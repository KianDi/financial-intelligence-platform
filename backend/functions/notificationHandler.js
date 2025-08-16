const AWS = require('aws-sdk');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { createNotificationSentEvent, validateEventSchema } = require('../schemas/eventSchemas');
const { processEventWithRetry, RetryableError, NonRetryableError, getSystemHealth } = require('../utils/errorHandling');
const docClient = new AWS.DynamoDB.DocumentClient();
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event, context) => {
  console.log('Notification Handler processing event:', JSON.stringify(event, null, 2));
  console.log('System health check:', getSystemHealth());

  try {
    // Use robust event processing with retry logic
    const processingResult = await processEventWithRetry(
      event,
      async (record) => {
        const eventDetail = record.detail || record;
        const eventType = record['detail-type'] || record.DetailType;

        console.log(`Processing ${eventType} event for notification`);

        // Process budget threshold events
        if (eventType === 'Budget Threshold Reached') {
          // Validate required fields
          if (!eventDetail.userId || !eventDetail.budgetId) {
            throw new NonRetryableError(`Missing required fields: userId or budgetId in event ${eventType}`);
          }
          
          return await processBudgetThresholdNotification(eventDetail);
        }
        // Future: Add other notification types (transaction alerts, etc.)
        else {
          console.log(`Skipping non-notification event: ${eventType}`);
          return { skipped: true, reason: 'non-notification event' };
        }
      },
      { functionName: context.functionName }
    );

    console.log('Processing summary:', processingResult);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Notifications processed successfully',
        summary: processingResult 
      }),
    };
  } catch (err) {
    console.error('Critical error in notification handler:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function processBudgetThresholdNotification(eventDetail) {
  const { 
    userId, 
    budgetId, 
    category, 
    currentSpending, 
    limit, 
    percentageUsed, 
    thresholdType 
  } = eventDetail;

  try {
    // Get user profile for notification preferences
    const userProfile = await getUserProfile(userId);
    
    // Create notification message
    const notificationMessage = createNotificationMessage({
      category,
      currentSpending,
      limit,
      percentageUsed,
      thresholdType,
      userProfile
    });

    // Send notification (currently console logging, extensible for email/push/SMS)
    await sendNotification({
      userId,
      budgetId,
      notificationMessage,
      thresholdType,
      userProfile
    });

    // Store notification in database for user history
    await storeNotificationHistory({
      userId,
      budgetId,
      category,
      currentSpending,
      limit,
      percentageUsed,
      thresholdType,
      message: notificationMessage.text
    });

    // Emit notification sent event for audit trail
    await emitNotificationSentEvent({
      userId,
      budgetId,
      category,
      thresholdType,
      notificationChannel: 'console' // Future: email, push, sms
    });

    console.log(`Notification processed for user ${userId}, budget ${budgetId}`);
  } catch (error) {
    console.error('Error processing budget threshold notification:', error);
    throw error;
  }
}

async function getUserProfile(userId) {
  try {
    const params = {
      TableName: 'Users',
      Key: { userId }
    };

    const result = await docClient.get(params).promise();
    
    // Return profile or default preferences
    return result.Item || {
      userId,
      notificationPreferences: {
        budgetAlerts: true,
        email: null,
        phone: null,
        preferredChannel: 'console'
      }
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    // Return default preferences if profile fetch fails
    return {
      userId,
      notificationPreferences: {
        budgetAlerts: true,
        preferredChannel: 'console'
      }
    };
  }
}

function createNotificationMessage({ category, currentSpending, limit, percentageUsed, thresholdType, userProfile }) {
  const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
  const spendingFormatted = currentSpending.toFixed(2);
  const limitFormatted = limit.toFixed(2);
  const percentageFormatted = percentageUsed.toFixed(1);

  let title, text, urgency;

  if (thresholdType === 'exceeded') {
    title = `Budget Exceeded - ${categoryDisplay}`;
    text = `You've exceeded your ${categoryDisplay} budget! Spent $${spendingFormatted} of $${limitFormatted} (${percentageFormatted}%). Consider reviewing your spending.`;
    urgency = 'high';
  } else {
    title = `Budget Alert - ${categoryDisplay}`;
    text = `You're approaching your ${categoryDisplay} budget limit. Spent $${spendingFormatted} of $${limitFormatted} (${percentageFormatted}%). ${limit - currentSpending >= 0 ? `$${(limit - currentSpending).toFixed(2)} remaining.` : ''}`;
    urgency = 'medium';
  }

  return {
    title,
    text,
    urgency,
    category,
    currentSpending: spendingFormatted,
    limit: limitFormatted,
    percentageUsed: percentageFormatted
  };
}

async function sendNotification({ userId, budgetId, notificationMessage, thresholdType, userProfile }) {
  const { notificationPreferences = {} } = userProfile;
  
  // Check if user wants budget alerts
  if (notificationPreferences.budgetAlerts === false) {
    console.log(`User ${userId} has disabled budget alerts`);
    return;
  }

  // Current implementation: Console logging (easily extensible)
  console.log('\n=== BUDGET NOTIFICATION ===');
  console.log(`User: ${userId}`);
  console.log(`Budget: ${budgetId}`);
  console.log(`Type: ${thresholdType.toUpperCase()}`);
  console.log(`Title: ${notificationMessage.title}`);
  console.log(`Message: ${notificationMessage.text}`);
  console.log(`Urgency: ${notificationMessage.urgency}`);
  console.log('===========================\n');

  // Future implementation examples:
  // if (notificationPreferences.email) {
  //   await sendEmailNotification(notificationPreferences.email, notificationMessage);
  // }
  // if (notificationPreferences.phone) {
  //   await sendSMSNotification(notificationPreferences.phone, notificationMessage);
  // }
  // await sendPushNotification(userId, notificationMessage);
}

async function storeNotificationHistory({ userId, budgetId, category, currentSpending, limit, percentageUsed, thresholdType, message }) {
  try {
    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const notificationRecord = {
      notificationId,
      userId,
      budgetId,
      category,
      type: 'budget_threshold',
      thresholdType,
      currentSpending,
      limit,
      percentageUsed,
      message,
      sentAt: timestamp,
      channel: 'console', // Future: email, push, sms
      status: 'sent'
    };

    // Store in Users table with a notification history attribute
    // Alternative: Create separate Notifications table
    const params = {
      TableName: 'Users',
      Key: { userId },
      UpdateExpression: 'SET #notifications = list_append(if_not_exists(#notifications, :empty_list), :notification)',
      ExpressionAttributeNames: {
        '#notifications': 'notificationHistory'
      },
      ExpressionAttributeValues: {
        ':notification': [notificationRecord],
        ':empty_list': []
      }
    };

    await docClient.update(params).promise();
    console.log(`Stored notification history for user ${userId}`);
  } catch (error) {
    console.error('Error storing notification history:', error);
    // Don't throw - notification history is secondary
  }
}

async function emitNotificationSentEvent({ userId, budgetId, category, thresholdType, notificationChannel }) {
  try {
    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Use standardized event schema
    const eventData = createNotificationSentEvent({
      userId,
      budgetId,
      category,
      notificationType: 'budget_threshold',
      thresholdType,
      channel: notificationChannel,
      notificationId
    });

    // Validate event against schema before sending
    const validation = validateEventSchema(eventData, eventData);
    if (!validation.isValid) {
      console.error('Event schema validation failed:', validation.errors);
      throw new Error(`Invalid event schema: ${validation.errors.join(', ')}`);
    }

    const eventParams = {
      Entries: [
        {
          ...eventData,
          Detail: JSON.stringify(eventData.Detail)
        }
      ],
    };

    await eventBridge.send(new PutEventsCommand(eventParams));
    console.log('Notification sent event emitted successfully with validated schema');
  } catch (error) {
    console.error('Failed to emit notification sent event:', error);
    // Don't throw - event emission is secondary
  }
}