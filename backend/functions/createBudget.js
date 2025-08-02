const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const userId = event.requestContext?.authorizer?.claims?.sub || "demo-user";

    const budgetItem = {
      userId: userId,
      budgetId: body.budgetId, // UUID generated on frontend
      name: body.name,
      amount: body.amount,
      createdAt: new Date().toISOString()
    };

    const params = {
      TableName: "Budgets",
      Item: budgetItem
    };

    await docClient.put(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Budget created", budget: budgetItem }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// this is properly working
// deployment 3 