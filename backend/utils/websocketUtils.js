
const AWS = require('aws-sdk');
const { RetryableError } = require('./errorHandling');

const docClient = new AWS.DynamoDB.DocumentClient();
const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_API_ENDPOINT || 'https://your-websocket-api.execute-api.us-east-1.amazonaws.com/dev'
});

async function broadcastToUser(userId, message) {
  try {
    const connections = await getUserConnections(userId);
    
    if (connections.length === 0) {
      console.log(`No active connections for user ${userId}`);
      return { delivered: 0, failed: 0 };
    }

    const deliveryResults = await Promise.allSettled(
      connections.map(connection => 
        sendMessageToConnection(connection.connectionId, message)
      )
    );

    const stats = deliveryResults.reduce(
      (acc, result) => {
        if (result.status === 'fulfilled') {
          acc.delivered++;
        } else {
          acc.failed++;
          console.error('Failed to deliver message:', result.reason);
        }
        return acc;
      },
      { delivered: 0, failed: 0 }
    );

    console.log(`Broadcast to user ${userId}: ${stats.delivered} delivered, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    console.error(`Failed to broadcast to user ${userId}:`, error);
    throw new RetryableError(`Broadcast failed: ${error.message}`);
  }
}

async function broadcastToSubscribers(channel, message, excludeUserId = null) {
  try {
    const subscribers = await getChannelSubscribers(channel, excludeUserId);
    
    if (subscribers.length === 0) {
      console.log(`No subscribers for channel ${channel}`);
      return { delivered: 0, failed: 0 };
    }

    const deliveryResults = await Promise.allSettled(
      subscribers.map(connection => 
        sendMessageToConnection(connection.connectionId, {
          ...message,
          channel: channel,
          type: 'broadcast'
        })
      )
    );

    const stats = deliveryResults.reduce(
      (acc, result) => {
        if (result.status === 'fulfilled') {
          acc.delivered++;
        } else {
          acc.failed++;
          console.error('Failed to deliver broadcast:', result.reason);
        }
        return acc;
      },
      { delivered: 0, failed: 0 }
    );

    console.log(`Broadcast to channel ${channel}: ${stats.delivered} delivered, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    console.error(`Failed to broadcast to channel ${channel}:`, error);
    throw new RetryableError(`Channel broadcast failed: ${error.message}`);
  }
}

async function getUserConnections(userId) {
  try {
    const params = {
      TableName: 'WebSocketConnections',
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items || [];

  } catch (error) {
    console.error(`Failed to get connections for user ${userId}:`, error);
    return [];
  }
}

async function getChannelSubscribers(channel, excludeUserId = null) {
  try {
    const params = {
      TableName: 'WebSocketConnections',
      FilterExpression: 'contains(subscriptions, :channel)',
      ExpressionAttributeValues: {
        ':channel': channel
      }
    };

    if (excludeUserId) {
      params.FilterExpression += ' AND userId <> :excludeUserId';
      params.ExpressionAttributeValues[':excludeUserId'] = excludeUserId;
    }

    const result = await docClient.scan(params).promise();
    return result.Items || [];

  } catch (error) {
    console.error(`Failed to get subscribers for channel ${channel}:`, error);
    return [];
  }
}

async function sendMessageToConnection(connectionId, message) {
  try {
    const params = {
      ConnectionId: connectionId,
      Data: JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      })
    };

    await apiGateway.postToConnection(params).promise();
    return { success: true, connectionId };

  } catch (error) {
    if (error.statusCode === 410) {
      console.log(`Connection ${connectionId} is gone, cleaning up`);
      await cleanupStaleConnection(connectionId);
      return { success: false, connectionId, reason: 'stale_connection' };
    } else {
      console.error(`Failed to send message to ${connectionId}:`, error);
      throw new RetryableError(`Message delivery failed: ${error.message}`);
    }
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
  }
}

async function notifyBudgetThreshold(userId, budgetData, thresholdType) {
  const message = {
    type: 'budget_threshold_alert',
    data: {
      budgetId: budgetData.budgetId,
      category: budgetData.category,
      currentAmount: budgetData.currentAmount,
      budgetLimit: budgetData.budgetLimit,
      utilizationPercentage: budgetData.utilizationPercentage,
      thresholdType: thresholdType,
      severity: thresholdType === 'exceeded' ? 'high' : 'medium'
    }
  };

  return await broadcastToUser(userId, message);
}

async function notifyTransactionCreated(userId, transactionData) {
  const message = {
    type: 'transaction_created',
    data: {
      transactionId: transactionData.transactionId,
      amount: transactionData.amount,
      category: transactionData.category,
      description: transactionData.description,
      timestamp: transactionData.timestamp
    }
  };

  const userStats = await broadcastToUser(userId, message);
  
  const channelStats = await broadcastToSubscribers(
    `user_${userId}_transactions`, 
    message, 
    userId
  );

  return {
    userDeliveries: userStats.delivered,
    channelDeliveries: channelStats.delivered,
    totalDelivered: userStats.delivered + channelStats.delivered,
    totalFailed: userStats.failed + channelStats.failed
  };
}

async function notifyTransactionUpdated(userId, transactionData, changes) {
  const message = {
    type: 'transaction_updated',
    data: {
      transactionId: transactionData.transactionId,
      changes: changes,
      updatedTransaction: transactionData
    }
  };

  return await broadcastToUser(userId, message);
}

async function notifyTransactionDeleted(userId, transactionId) {
  const message = {
    type: 'transaction_deleted',
    data: {
      transactionId: transactionId,
      deletedAt: new Date().toISOString()
    }
  };

  return await broadcastToUser(userId, message);
}

async function getConnectionStats() {
  try {
    const params = {
      TableName: 'WebSocketConnections',
      Select: 'COUNT'
    };

    const result = await docClient.scan(params).promise();
    return {
      totalConnections: result.Count,
      scannedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Failed to get connection stats:', error);
    return { totalConnections: 0, error: error.message };
  }
}

module.exports = {
  broadcastToUser,
  broadcastToSubscribers,
  getUserConnections,
  getChannelSubscribers,
  sendMessageToConnection,
  cleanupStaleConnection,
  notifyBudgetThreshold,
  notifyTransactionCreated,
  notifyTransactionUpdated,
  notifyTransactionDeleted,
  getConnectionStats
};