const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const userEmail = event.requestContext?.authorizer?.jwt?.claims?.email;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: No valid user ID found' }),
      };
    }

    // Check if user profile already exists
    const existingUserParams = {
      TableName: 'Users',
      Key: { userId: userId },
    };

    const existingUser = await docClient.get(existingUserParams).promise();

    if (existingUser.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'User profile already exists',
          existingProfile: existingUser.Item,
        }),
      };
    }

    // Extract profile data from request body with defaults
    const {
      name,
      firstName,
      lastName,
      preferences = {},
      notificationPreferences = {},
      familyGroupId = null,
      timezone = 'UTC',
    } = body;

    // Handle legacy 'name' field or split firstName/lastName
    let finalFirstName = firstName;
    let finalLastName = lastName;
    if (name && !firstName && !lastName) {
      const nameParts = name.split(' ');
      finalFirstName = nameParts[0] || '';
      finalLastName = nameParts.slice(1).join(' ') || '';
    }

    // Build user profile object
    const userProfile = {
      userId: userId,
      email: userEmail || 'unknown@example.com',
      firstName: finalFirstName || '',
      lastName: finalLastName || '',
      fullName:
        `${finalFirstName || ''} ${finalLastName || ''}`.trim() || 'Anonymous User',
      preferences: {
        currency: preferences.currency || 'USD',
        dateFormat: preferences.dateFormat || 'YYYY-MM-DD',
        budgetAlerts:
          preferences.budgetAlerts !== undefined
            ? preferences.budgetAlerts
            : true,
        weeklyReports:
          preferences.weeklyReports !== undefined
            ? preferences.weeklyReports
            : false,
        ...preferences,
      },
      notificationPreferences: {
        budgetAlerts: notificationPreferences.budgetAlerts !== undefined 
          ? notificationPreferences.budgetAlerts 
          : true,
        email: notificationPreferences.email || userEmail || 'unknown@example.com',
        preferredChannel: notificationPreferences.preferredChannel || 'console',
        ...notificationPreferences,
      },
      familyGroupId: familyGroupId,
      timezone: timezone,
      profileCompleted: !!(finalFirstName && finalLastName), // Boolean flag for onboarding
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    // Store user profile
    const params = {
      TableName: 'Users',
      Item: userProfile,
    };

    await docClient.put(params).promise();

    // Remove sensitive data from response
    const responseProfile = { ...userProfile };
    delete responseProfile.email; // Don't expose email in API response

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'User profile created successfully',
        user: responseProfile,
      }),
    };
  } catch (err) {
    console.error('Error creating user profile:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
