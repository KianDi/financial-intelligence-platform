const AWS = require('aws-sdk');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { createTransactionDeletedEvent, validateEventSchema } = require('../schemas/eventSchemas');
const docClient = new AWS.DynamoDB.DocumentClient();
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const { timestamp } = event.pathParameters;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: No valid user ID found' }),
      };
    }

    if (!timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing transaction timestamp in path',
        }),
      };
    }

    // First, verify the transaction exists and belongs to the user
    const getParams = {
      TableName: 'Transactions',
      Key: {
        userId: userId,
        timestamp: timestamp,
      },
    };

    const existingTransaction = await docClient.get(getParams).promise();

    if (!existingTransaction.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Transaction not found or not owned by user',
        }),
      };
    }

    // Store transaction details for response before deletion
    const transactionDetails = existingTransaction.Item;

    // Delete the transaction
    const deleteParams = {
      TableName: 'Transactions',
      Key: {
        userId: userId,
        timestamp: timestamp,
      },
      ReturnValues: 'ALL_OLD',
    };

    await docClient.delete(deleteParams).promise();

    // Emit transaction.deleted event to EventBridge
    try {
      const eventParams = {
        Entries: [
          {
            Source: 'financial.platform',
            DetailType: 'Transaction Deleted',
            Detail: JSON.stringify({
              userId: transactionDetails.userId,
              transactionId: transactionDetails.transactionId,
              amount: transactionDetails.amount,
              category: transactionDetails.category,
              description: transactionDetails.description,
              type: transactionDetails.type,
              timestamp: transactionDetails.timestamp,
              deletedAt: new Date().toISOString(),
            }),
            EventBusName: 'financial-platform-events',
          },
        ],
      };

      await eventBridge.send(new PutEventsCommand(eventParams));
      console.log('Transaction deleted event emitted successfully');
    } catch (eventError) {
      console.error('Failed to emit transaction deleted event:', eventError);
      // Don't fail the entire request if event emission fails
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Transaction deleted successfully',
        deletedTransaction: {
          transactionId: transactionDetails.transactionId,
          amount: transactionDetails.amount,
          category: transactionDetails.category,
          type: transactionDetails.type,
          description: transactionDetails.description,
          timestamp: transactionDetails.timestamp,
        },
      }),
    };
  } catch (err) {
    console.error('Error deleting transaction:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
