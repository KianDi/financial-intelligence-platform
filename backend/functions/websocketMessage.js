const AWS = require('aws-sdk');
const { processEventWithRetry, RetryableError, NonRetryableError } = require('../utils/errorHandling');

const docClient = new AWS.DynamoDB.DocumentClient();
const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_API_ENDPOINT || 'https://your-websocket-api.execute-api.us-east-1.amazonaws.com/dev'
});

exports.handler = async (event, context) => {
  console.log('WebSocket Message event:', JSON.stringify(event, null, 2));
  
  const { connectionId, requestContext } = event;
  
  if (!connectionId) {
    console.error('No connectionId provided in message event');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Connection ID required' })
    };
  }

  try {
    // Parse the message body
    let messageData;
    try {
      messageData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('Invalid JSON in WebSocket message:', parseError);
      await sendErrorToClient(connectionId, 'Invalid JSON format');
      return { statusCode: 400 };
    }

    // Verify connection exists and get user context
    const connectionInfo = await getConnectionInfo(connectionId);
    if (!connectionInfo) {
      console.error(`Connection ${connectionId} not found in database`);
      return { statusCode: 404 };
    }

    const { userId } = connectionInfo;
    console.log(`Processing message from user ${userId}, action: ${messageData.action}`);

    // Route message based on action type
    await processEventWithRetry(
      { connectionId, userId, messageData },
      async () => {
        await routeMessage(connectionId, userId, messageData, requestContext);
      },
      { functionName: context.functionName }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message processed successfully' })
    };

  } catch (error) {
    console.error('WebSocket message processing failed:', error);
    
    // Send error back to client if possible
    try {
      await sendErrorToClient(connectionId, 'Message processing failed');
    } catch (sendError) {
      console.error('Failed to send error to client:', sendError);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Message processing failed' })
    };
  }
};

async function getConnectionInfo(connectionId) {
  try {
    const params = {
      TableName: 'WebSocketConnections',
      Key: { connectionId }
    };

    const result = await docClient.get(params).promise();
    return result.Item;
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return null;
  }
}

async function routeMessage(connectionId, userId, messageData, requestContext) {
  const { action, data = {} } = messageData;

  switch (action) {
    case 'ping':
      await handlePing(connectionId, userId, data);
      break;
      
    case 'subscribe':
      await handleSubscription(connectionId, userId, data);
      break;
      
    case 'unsubscribe':
      await handleUnsubscription(connectionId, userId, data);
      break;
      
    case 'get_live_data':
      await handleLiveDataRequest(connectionId, userId, data);
      break;
      
    case 'broadcast_to_household':
      await handleHouseholdBroadcast(connectionId, userId, data);
      break;
      
    default:
      console.log(`Unknown action: ${action}`);
      await sendErrorToClient(connectionId, `Unknown action: ${action}`);
  }
}

async function handlePing(connectionId, userId, data) {
  const response = {
    type: 'pong',
    timestamp: new Date().toISOString(),
    connectionId,
    userId
  };
  
  await sendMessageToClient(connectionId, response);
  console.log(`Pong sent to user ${userId}`);
}

async function handleSubscription(connectionId, userId, data) {
  const { channels = [] } = data;
  
  // Store subscription preferences in connection record
  const updateParams = {
    TableName: 'WebSocketConnections',
    Key: { connectionId },
    UpdateExpression: 'SET subscriptions = :subscriptions, lastActivity = :timestamp',
    ExpressionAttributeValues: {
      ':subscriptions': channels,
      ':timestamp': new Date().toISOString()
    }
  };

  await docClient.update(updateParams).promise();
  
  const response = {
    type: 'subscription_confirmed',
    channels,
    timestamp: new Date().toISOString()
  };
  
  await sendMessageToClient(connectionId, response);
  console.log(`User ${userId} subscribed to channels:`, channels);
}

async function handleUnsubscription(connectionId, userId, data) {
  const { channels = [] } = data;
  
  // Remove subscription preferences
  const updateParams = {
    TableName: 'WebSocketConnections',
    Key: { connectionId },
    UpdateExpression: 'REMOVE subscriptions SET lastActivity = :timestamp',
    ExpressionAttributeValues: {
      ':timestamp': new Date().toISOString()
    }
  };

  await docClient.update(updateParams).promise();
  
  const response = {
    type: 'unsubscription_confirmed',
    channels,
    timestamp: new Date().toISOString()
  };
  
  await sendMessageToClient(connectionId, response);
  console.log(`User ${userId} unsubscribed from channels:`, channels);
}

async function handleLiveDataRequest(connectionId, userId, data) {
  const { dataType } = data;
  
  try {
    let responseData = {};
    
    switch (dataType) {
      case 'recent_transactions':
        responseData = await getRecentTransactions(userId);
        break;
      case 'budget_status':
        responseData = await getBudgetStatus(userId);
        break;
      case 'household_activity':
        responseData = await getHouseholdActivity(userId);
        break;
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
    
    const response = {
      type: 'live_data_response',
      dataType,
      data: responseData,
      timestamp: new Date().toISOString()
    };
    
    await sendMessageToClient(connectionId, response);
    console.log(`Live data sent to user ${userId}, type: ${dataType}`);
    
  } catch (error) {
    console.error('Failed to get live data:', error);
    await sendErrorToClient(connectionId, `Failed to get ${dataType}`);
  }
}

async function handleHouseholdBroadcast(connectionId, userId, data) {
  // Future implementation: Broadcast message to household members
  // This would require household/family group management
  console.log(`Household broadcast from user ${userId}:`, data);
  
  const response = {
    type: 'household_broadcast_received',
    message: 'Household broadcasting not yet implemented',
    timestamp: new Date().toISOString()
  };
  
  await sendMessageToClient(connectionId, response);
}

async function getRecentTransactions(userId) {
  // Get recent transactions for real-time feed
  const params = {
    TableName: 'Transactions',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    },
    ScanIndexForward: false, // Most recent first
    Limit: 10
  };

  const result = await docClient.query(params).promise();
  return { transactions: result.Items };
}

async function getBudgetStatus(userId) {
  // Get current budget status
  const params = {
    TableName: 'Budgets',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  };

  const result = await docClient.query(params).promise();
  return { budgets: result.Items };
}

async function getHouseholdActivity(userId) {
  // Future implementation: Get household member activity
  return { 
    message: 'Household activity not yet implemented',
    userId 
  };
}

async function sendMessageToClient(connectionId, message) {
  try {
    const params = {
      ConnectionId: connectionId,
      Data: JSON.stringify(message)
    };

    await apiGateway.postToConnection(params).promise();
  } catch (error) {
    if (error.statusCode === 410) {
      console.log(`Connection ${connectionId} is gone, cleaning up`);
      // Clean up stale connection
      await cleanupStaleConnection(connectionId);
    } else {
      throw new RetryableError(`Failed to send message to client: ${error.message}`);
    }
  }
}

async function sendErrorToClient(connectionId, errorMessage) {
  const errorResponse = {
    type: 'error',
    error: errorMessage,
    timestamp: new Date().toISOString()
  };
  
  try {
    await sendMessageToClient(connectionId, errorResponse);
  } catch (error) {
    console.error('Failed to send error to client:', error);
    // Don't throw - this is best effort
  }
}

async function cleanupStaleConnection(connectionId) {
  try {
    const deleteParams = {
      TableName: 'WebSocketConnections',
      Key: { connectionId }
    };

    await docClient.delete(deleteParams).promise();
    console.log(`Cleaned up stale connection: ${connectionId}`);
  } catch (error) {
    console.error('Failed to cleanup stale connection:', error);
    // Don't throw - this is cleanup
  }
}