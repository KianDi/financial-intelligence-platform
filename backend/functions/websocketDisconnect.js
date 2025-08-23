const AWS = require('aws-sdk');
const { processEventWithRetry, RetryableError, NonRetryableError } = require('../utils/errorHandling');

const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context) => {
  console.log('WebSocket Disconnect event:', JSON.stringify(event, null, 2));
  
  const { connectionId, requestContext } = event;
  
  if (!connectionId) {
    console.error('No connectionId provided in disconnect event');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Connection ID required' })
    };
  }

  try {
    // Clean up connection with retry logic for reliability
    await processEventWithRetry(
      { connectionId },
      async () => {
        await cleanupConnection(connectionId, requestContext);
      },
      { functionName: context.functionName }
    );

    console.log(`WebSocket connection cleaned up successfully: ${connectionId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Disconnected successfully',
        connectionId 
      })
    };

  } catch (error) {
    console.error('WebSocket disconnection cleanup failed:', error);
    
    // Even if cleanup fails, we should return success since the connection is already closed
    // This prevents infinite retry loops on stale connections
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Disconnected (cleanup attempted)',
        connectionId,
        warning: 'Cleanup may have failed but connection is closed'
      })
    };
  }
};

async function cleanupConnection(connectionId, requestContext) {
  try {
    // First, get the connection details for logging and potential cleanup operations
    const getParams = {
      TableName: 'WebSocketConnections',
      Key: { connectionId }
    };

    const existingConnection = await docClient.get(getParams).promise();
    
    if (existingConnection.Item) {
      const { userId, connectedAt } = existingConnection.Item;
      const connectionDuration = Date.now() - new Date(connectedAt).getTime();
      
      console.log(`Cleaning up connection for user ${userId}, duration: ${Math.round(connectionDuration / 1000)}s`);
      
      // Log connection metrics for monitoring
      logConnectionMetrics(connectionId, userId, connectionDuration, requestContext);
    } else {
      console.log(`Connection ${connectionId} not found in database (may have already been cleaned up)`);
    }

    // Delete the connection record
    const deleteParams = {
      TableName: 'WebSocketConnections',
      Key: { connectionId },
      // Use conditional delete to handle race conditions gracefully
      ConditionExpression: 'attribute_exists(connectionId)'
    };

    await docClient.delete(deleteParams).promise();
    console.log(`Successfully deleted connection record: ${connectionId}`);

  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      console.log(`Connection ${connectionId} was already deleted (race condition handled gracefully)`);
      return; // This is not an error - connection was already cleaned up
    }
    
    // For other errors, throw to trigger retry logic
    throw new RetryableError(`Failed to cleanup WebSocket connection: ${error.message}`);
  }
}

function logConnectionMetrics(connectionId, userId, duration, requestContext) {
  // Structured logging for CloudWatch monitoring and analytics
  const metrics = {
    eventType: 'websocket_disconnect',
    connectionId,
    userId,
    connectionDuration: Math.round(duration / 1000), // seconds
    timestamp: new Date().toISOString(),
    requestContext: {
      requestId: requestContext?.requestId,
      apiId: requestContext?.apiId,
      stage: requestContext?.stage,
      routeKey: requestContext?.routeKey
    }
  };

  console.log('CONNECTION_METRICS:', JSON.stringify(metrics));
  
  // Future enhancement: Send metrics to CloudWatch custom metrics
  // await cloudWatch.putMetricData({
  //   Namespace: 'FinancialPlatform/WebSocket',
  //   MetricData: [{
  //     MetricName: 'ConnectionDuration',
  //     Value: duration,
  //     Unit: 'Seconds',
  //     Dimensions: [{ Name: 'UserId', Value: userId }]
  //   }]
  // }).promise();
}