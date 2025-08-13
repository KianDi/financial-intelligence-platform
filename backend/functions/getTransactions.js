const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: No valid user ID found' }),
      };
    }

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { category, type, startDate, endDate, limit = '50' } = queryParams;

    let params;

    // Query by category if specified (uses GSI)
    if (category) {
      params = {
        TableName: 'Transactions',
        IndexName: 'category-index',
        KeyConditionExpression: 'userId = :userId AND category = :category',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':category': category.toLowerCase(),
        },
        ScanIndexForward: false, // Latest transactions first
        Limit: parseInt(limit),
      };
    } else {
      // Query all user transactions by timestamp
      params = {
        TableName: 'Transactions',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Latest transactions first
        Limit: parseInt(limit),
      };

      // Add date range filtering if specified
      if (startDate || endDate) {
        let filterExpression = '';

        if (startDate && endDate) {
          params.ExpressionAttributeValues[':startDate'] = startDate;
          params.ExpressionAttributeValues[':endDate'] = endDate;
          filterExpression = '#timestamp BETWEEN :startDate AND :endDate';
        } else if (startDate) {
          params.ExpressionAttributeValues[':startDate'] = startDate;
          filterExpression = '#timestamp >= :startDate';
        } else if (endDate) {
          params.ExpressionAttributeValues[':endDate'] = endDate;
          filterExpression = '#timestamp <= :endDate';
        }

        params.FilterExpression = filterExpression;
        params.ExpressionAttributeNames = { '#timestamp': 'timestamp' };
      }
    }

    // Add type filtering if specified
    if (type && ['income', 'expense'].includes(type)) {
      if (params.FilterExpression) {
        params.FilterExpression += ' AND #type = :type';
      } else {
        params.FilterExpression = '#type = :type';
      }

      params.ExpressionAttributeValues[':type'] = type;

      if (!params.ExpressionAttributeNames) {
        params.ExpressionAttributeNames = {};
      }
      params.ExpressionAttributeNames['#type'] = 'type';
    }

    const result = await docClient.query(params).promise();

    // Calculate summary statistics
    const transactions = result.Items;
    const summary = {
      totalTransactions: transactions.length,
      totalIncome: transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0),
      totalExpenses: transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0),
    };

    summary.netAmount = summary.totalIncome - summary.totalExpenses;

    return {
      statusCode: 200,
      body: JSON.stringify({
        transactions: transactions,
        summary: summary,
        filters: {
          category,
          type,
          startDate,
          endDate,
          limit: parseInt(limit),
        },
      }),
    };
  } catch (err) {
    console.error('Error retrieving transactions:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
