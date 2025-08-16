const AWS = require('aws-sdk');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { createTransactionUpdatedEvent, validateEventSchema } = require('../schemas/eventSchemas');
const docClient = new AWS.DynamoDB.DocumentClient();
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
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

    // Build update expression dynamically
    const allowedFields = ['amount', 'category', 'description', 'type'];
    const updates = {};
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    let updateExpression = 'SET updatedAt = :updatedAt';

    // Add updatedAt timestamp
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    // Process each field in the request body
    Object.keys(body).forEach((key) => {
      if (allowedFields.includes(key) && body[key] !== undefined) {
        const value =
          key === 'amount'
            ? parseFloat(body[key])
            : key === 'category'
              ? body[key].toLowerCase()
              : body[key];

        // Validate transaction type if being updated
        if (key === 'type' && !['income', 'expense'].includes(value)) {
          throw new Error(
            "Invalid transaction type. Must be 'income' or 'expense'"
          );
        }

        updates[key] = value;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
        updateExpression += `, #${key} = :${key}`;
      }
    });

    // If no valid fields to update
    if (Object.keys(updates).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            'No valid fields to update. Allowed fields: amount, category, description, type',
        }),
      };
    }

    // Perform the update
    const updateParams = {
      TableName: 'Transactions',
      Key: {
        userId: userId,
        timestamp: timestamp,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    const result = await docClient.update(updateParams).promise();

    // Emit transaction.updated event to EventBridge using standardized schema
    try {
      const eventData = createTransactionUpdatedEvent({
        userId: result.Attributes.userId,
        transactionId: result.Attributes.transactionId,
        beforeState: existingTransaction.Item,
        afterState: result.Attributes,
        changes: Object.keys(updates),
        updatedBy: result.Attributes.userId,
        timestamp: result.Attributes.updatedAt
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
      console.log('Transaction updated event emitted successfully with validated schema');
    } catch (eventError) {
      console.error('Failed to emit transaction updated event:', eventError);
      // Don't fail the entire request if event emission fails
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Transaction updated successfully',
        transaction: result.Attributes,
        updatedFields: Object.keys(updates),
      }),
    };
  } catch (err) {
    console.error('Error updating transaction:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
