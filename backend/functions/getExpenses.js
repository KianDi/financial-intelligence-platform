const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const budgetId = event.pathParameters.budgetId;
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: No valid user ID found' }),
      };
    }

    // First verify the budget belongs to the authenticated user
    const budgetParams = {
      TableName: 'Budgets',
      Key: {
        userId: userId,
        budgetId: budgetId,
      },
    };

    const budgetResult = await docClient.get(budgetParams).promise();
    if (!budgetResult.Item) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Access denied: Budget not found or not owned by user',
        }),
      };
    }

    const params = {
      TableName: 'Expenses',
      KeyConditionExpression: 'budgetId = :budgetId',
      ExpressionAttributeValues: {
        ':budgetId': budgetId,
      },
    };

    const result = await docClient.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
