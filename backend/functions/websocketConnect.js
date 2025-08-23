const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { processEventWithRetry, RetryableError, NonRetryableError } = require('../utils/errorHandling');

const docClient = new AWS.DynamoDB.DocumentClient();

// JWKS client for Cognito JWT verification
const client = jwksClient({
  jwksUri: `https://cognito-idp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000 // 10 minutes
});

exports.handler = async (event, context) => {
  console.log('WebSocket Connect event:', JSON.stringify(event, null, 2));
  
  const { requestContext, queryStringParameters = {}, headers = {} } = event;
  const connectionId = requestContext?.connectionId;
  
  try {
    // Extract JWT token from query parameters or headers
    const token = queryStringParameters.token || 
                  headers.Authorization?.replace('Bearer ', '') ||
                  headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.error('No authentication token provided');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Authentication token required' })
      };
    }

    // Verify JWT token and extract user ID
    const userId = await verifyJWTToken(token);
    if (!userId) {
      console.error('Invalid authentication token');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid authentication token' })
      };
    }

    // Store connection in DynamoDB with retry logic
    await processEventWithRetry(
      { connectionId, userId },
      async () => {
        await storeConnection(connectionId, userId, requestContext);
      },
      { functionName: context.functionName }
    );

    console.log(`WebSocket connection established: ${connectionId} for user ${userId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Connected successfully',
        connectionId,
        userId 
      })
    };

  } catch (error) {
    console.error('WebSocket connection failed:', error);
    
    // Return appropriate error response
    if (error instanceof NonRetryableError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Authentication failed' })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Connection failed' })
    };
  }
};

async function verifyJWTToken(token) {
  try {
    // Decode token header to get key ID
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
      throw new Error('Invalid token format');
    }

    // Get signing key from JWKS
    const key = await getSigningKey(decoded.header.kid);
    
    // Verify token (don't verify audience for access tokens)
    const verified = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
    });

    // Extract user ID from token claims
    return verified.sub || verified['cognito:username'];
    
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

async function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key.getPublicKey());
      }
    });
  });
}

async function storeConnection(connectionId, userId, requestContext) {
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hour TTL
  
  const connectionItem = {
    connectionId,
    userId,
    connectedAt: timestamp,
    ttl,
    // Store additional context for debugging and monitoring
    requestContext: {
      routeKey: requestContext.routeKey,
      requestId: requestContext.requestId,
      apiId: requestContext.apiId,
      stage: requestContext.stage,
      sourceIp: requestContext.identity?.sourceIp,
      userAgent: requestContext.identity?.userAgent
    }
  };

  const params = {
    TableName: 'WebSocketConnections',
    Item: connectionItem,
    // Prevent overwriting existing connections
    ConditionExpression: 'attribute_not_exists(connectionId)'
  };

  try {
    await docClient.put(params).promise();
    console.log(`Stored WebSocket connection: ${connectionId} for user ${userId}`);
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      console.log(`Connection ${connectionId} already exists, updating timestamp`);
      
      // Update existing connection timestamp
      const updateParams = {
        TableName: 'WebSocketConnections',
        Key: { connectionId },
        UpdateExpression: 'SET connectedAt = :timestamp, ttl = :ttl',
        ExpressionAttributeValues: {
          ':timestamp': timestamp,
          ':ttl': ttl
        }
      };
      
      await docClient.update(updateParams).promise();
    } else {
      throw new RetryableError(`Failed to store WebSocket connection: ${error.message}`);
    }
  }
}