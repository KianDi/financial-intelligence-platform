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

    // Emit transaction.deleted event to EventBridge using standardized schema
    try {
      const eventData = createTransactionDeletedEvent({
        userId: transactionDetails.userId,
        transactionId: transactionDetails.transactionId,
        deletedTransaction: transactionDetails,
        deletedBy: transactionDetails.userId,
        timestamp: new Date().toISOString()
      });

      // Validate event against schema before sending
      const validation = validateEventSchema(eventData, eventData);
      if (!validation.isValid) {
        console.error('Event schema validation failed:', validation.errors);
        throw new Error(`Invalid event schema: ${validation.errors.join(', ')}`);
      }

      const eventParams = {
        Entries: [
          {
            ...eventData,
            Detail: JSON.stringify(eventData.Detail)
          }
        ],
      };

      await eventBridge.send(new PutEventsCommand(eventParams));
      console.log('Transaction deleted event emitted successfully with validated schema');
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
