const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized: No valid user ID found" }),
      };
    }

    // Get user profile
    const params = {
      TableName: "Users",
      Key: { userId: userId }
    };

    const result = await docClient.get(params).promise();
    
    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: "User profile not found. Please create a profile first.",
          suggestion: "POST /users to create your profile"
        }),
      };
    }

    // Remove sensitive data from response
    const userProfile = { ...result.Item };
    delete userProfile.email; // Don't expose email in API response
    
    // Add computed fields for client convenience
    const enhancedProfile = {
      ...userProfile,
      displayName: userProfile.fullName || 'Anonymous User',
      isProfileComplete: userProfile.profileCompleted || false,
      memberSince: userProfile.createdAt
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        profile: enhancedProfile
      }),
    };
  } catch (err) {
    console.error("Error retrieving user profile:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};