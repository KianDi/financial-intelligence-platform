const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const budgetId = event.pathParameters.budgetId;
    const userId = "demo-user"; // For future auth-based filtering

    const params = {
      TableName: "Expenses",
      KeyConditionExpression: "budgetId = :budgetId",
      ExpressionAttributeValues: {
        ":budgetId": budgetId
      }
    };

    const result = await docClient.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
