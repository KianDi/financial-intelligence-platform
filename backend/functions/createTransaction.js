const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized: No valid user ID found" }),
      };
    }

    // Validate required fields
    const { amount, category, description, type } = body;
    if (!amount || !category || !type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: "Missing required fields: amount, category, type are required" 
        }),
      };
    }

    // Validate transaction type
    if (!['income', 'expense'].includes(type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: "Invalid transaction type. Must be 'income' or 'expense'" 
        }),
      };
    }

    // Generate timestamp-based ID for sorting
    const timestamp = new Date().toISOString();
    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const transactionItem = {
      userId: userId,
      timestamp: timestamp,
      transactionId: transactionId,
      amount: parseFloat(amount),
      category: category.toLowerCase(),
      description: description || '',
      type: type, // 'income' or 'expense'
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Store transaction in Transactions table
    const params = {
      TableName: "Transactions",
      Item: transactionItem
    };

    await docClient.put(params).promise();

    return {
      statusCode: 201,
      body: JSON.stringify({ 
        message: "Transaction created successfully", 
        transaction: transactionItem 
      }),
    };
  } catch (err) {
    console.error("Error creating transaction:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};