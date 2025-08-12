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

    // Verify user profile exists
    const getParams = {
      TableName: "Users",
      Key: { userId: userId }
    };

    const existingUser = await docClient.get(getParams).promise();
    
    if (!existingUser.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: "User profile not found. Please create a profile first.",
          suggestion: "POST /users to create your profile"
        }),
      };
    }

    // Define allowed update fields
    const allowedFields = [
      'firstName', 'lastName', 'preferences', 'familyGroupId', 'timezone'
    ];

    const updates = {};
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    let updateExpression = "SET updatedAt = :updatedAt";

    // Add updatedAt timestamp
    expressionAttributeValues[":updatedAt"] = new Date().toISOString();

    // Process each field in the request body
    Object.keys(body).forEach(key => {
      if (allowedFields.includes(key) && body[key] !== undefined) {
        updates[key] = body[key];
        
        if (key === 'preferences') {
          // Merge preferences with existing ones
          const currentPreferences = existingUser.Item.preferences || {};
          const newPreferences = { ...currentPreferences, ...body[key] };
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = newPreferences;
          updates[key] = newPreferences;
        } else {
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = body[key];
        }
        
        updateExpression += `, #${key} = :${key}`;
      }
    });

    // Update fullName if firstName or lastName changed
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const firstName = updates.firstName !== undefined ? updates.firstName : existingUser.Item.firstName;
      const lastName = updates.lastName !== undefined ? updates.lastName : existingUser.Item.lastName;
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Anonymous User';
      
      expressionAttributeNames["#fullName"] = "fullName";
      expressionAttributeValues[":fullName"] = fullName;
      updateExpression += ", #fullName = :fullName";
      updates.fullName = fullName;
    }

    // Update profileCompleted flag
    const firstName = updates.firstName !== undefined ? updates.firstName : existingUser.Item.firstName;
    const lastName = updates.lastName !== undefined ? updates.lastName : existingUser.Item.lastName;
    const profileCompleted = !!(firstName && lastName);
    
    expressionAttributeNames["#profileCompleted"] = "profileCompleted";
    expressionAttributeValues[":profileCompleted"] = profileCompleted;
    updateExpression += ", #profileCompleted = :profileCompleted";
    updates.profileCompleted = profileCompleted;

    // If no valid fields to update
    if (Object.keys(body).filter(key => allowedFields.includes(key)).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: "No valid fields to update",
          allowedFields: allowedFields
        }),
      };
    }

    // Perform the update
    const updateParams = {
      TableName: "Users",
      Key: { userId: userId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW"
    };

    const result = await docClient.update(updateParams).promise();

    // Remove sensitive data from response
    const updatedProfile = { ...result.Attributes };
    delete updatedProfile.email;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "User profile updated successfully",
        profile: updatedProfile,
        updatedFields: Object.keys(updates)
      }),
    };
  } catch (err) {
    console.error("Error updating user profile:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};