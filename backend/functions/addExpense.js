const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const budgetId = event.pathParameters.budgetId;
    const userId = "demo-user"; // Replace with Cognito user ID in the future

    const expenseItem = {
      budgetId: budgetId,
      expenseId: body.expenseId,
      amount: body.amount,
      description: body.description,
      createdAt: new Date().toISOString(),
      userId: userId
    };

    const params = {
      TableName: "Expenses",
      Item: expenseItem
    };

    await docClient.put(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Expense added", expense: expenseItem })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
