const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: 'us-east-1' });
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = 'us-east-1_bFOwFsIdV';
const CLIENT_ID = '5vsqghihkjqgmhgqn6c6dgomei';

// Create a test user
async function createUser(email, password) {
  try {
    console.log('Creating user:', email);
    
    const params = {
      UserPoolId: USER_POOL_ID,
      Username: email,
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS', // Don't send welcome email
      UserAttributes: [
        {
          Name: 'email',
          Value: email
        },
        {
          Name: 'email_verified',
          Value: 'true'
        }
      ]
    };

    const result = await cognitoIdentityServiceProvider.adminCreateUser(params).promise();
    console.log('User created successfully:', result.User.Username);

    // Set permanent password
    const setPasswordParams = {
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true
    };

    await cognitoIdentityServiceProvider.adminSetUserPassword(setPasswordParams).promise();
    console.log('Password set successfully');
    
    return result.User;
  } catch (error) {
    console.error('Error creating user:', error.message);
  }
}

// Authenticate user and get JWT token
async function authenticateUser(email, password) {
  try {
    console.log('Authenticating user:', email);
    
    const params = {
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    const result = await cognitoIdentityServiceProvider.adminInitiateAuth(params).promise();
    
    if (result.AuthenticationResult) {
      console.log('Authentication successful!');
      console.log('Access Token:', result.AuthenticationResult.AccessToken);
      console.log('ID Token:', result.AuthenticationResult.IdToken);
      console.log('Refresh Token:', result.AuthenticationResult.RefreshToken);
      
      return {
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        refreshToken: result.AuthenticationResult.RefreshToken
      };
    }
  } catch (error) {
    console.error('Error authenticating user:', error.message);
  }
}

// Test API call with authentication
async function testApiCall(token) {
  const axios = require('axios');
  
  try {
    console.log('Testing authenticated API call...');
    
    const response = await axios.get(
      'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com/budgets',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('API Response:', response.data);
  } catch (error) {
    console.error('API call failed:', error.response?.data || error.message);
  }
}

// Main execution
async function main() {
  const email = 'test@example.com';
  const password = 'TestPass123!';
  
  console.log('=== Creating Test User ===');
  await createUser(email, password);
  
  console.log('\n=== Authenticating User ===');
  const tokens = await authenticateUser(email, password);
  
  if (tokens) {
    console.log('\n=== Testing API Call ===');
    await testApiCall(tokens.accessToken);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createUser,
  authenticateUser,
  testApiCall
};