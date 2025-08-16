const AWS = require('aws-sdk');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { processEventWithRetry, RetryableError, NonRetryableError, getSystemHealth } = require('../utils/errorHandling');
const docClient = new AWS.DynamoDB.DocumentClient();
const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event, context) => {
  console.log('Audit Logger processing event:', JSON.stringify(event, null, 2));
  console.log('System health check:', getSystemHealth());

  try {
    // Use robust event processing with retry logic
    const processingResult = await processEventWithRetry(
      event,
      async (record) => {
        const eventDetail = record.detail || record;
        const eventType = record['detail-type'] || record.DetailType;
        const eventSource = record.source || record.Source;

        console.log(`Processing audit log for ${eventType} from ${eventSource}`);

        // Validate required fields for audit logging
        if (!eventType || !eventSource) {
          throw new NonRetryableError(`Missing required fields: eventType or eventSource in audit event`);
        }

        return await processAuditEvent({
          eventType,
          eventSource,
          eventDetail,
          originalRecord: record
        });
      },
      { functionName: context.functionName }
    );

    console.log('Processing summary:', processingResult);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Audit logging completed successfully',
        summary: processingResult 
      }),
    };
  } catch (err) {
    console.error('Critical error in audit logger:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function processAuditEvent({ eventType, eventSource, eventDetail, originalRecord }) {
  try {
    // Generate unique audit log entry
    const auditEntry = createAuditEntry({
      eventType,
      eventSource,
      eventDetail,
      originalRecord
    });

    // Store audit log in DynamoDB
    await storeAuditLog(auditEntry);

    // Log structured audit information to CloudWatch
    logAuditToCloudWatch(auditEntry);

    console.log(`Audit log created for ${eventType} - ID: ${auditEntry.auditId}`);
  } catch (error) {
    console.error('Error processing audit event:', error);
    throw error;
  }
}

function createAuditEntry({ eventType, eventSource, eventDetail, originalRecord }) {
  const timestamp = new Date().toISOString();
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Extract common audit fields
  const userId = eventDetail.userId || 'system';
  const action = determineAction(eventType);
  const resource = determineResource(eventType, eventDetail);
  const resourceId = extractResourceId(eventDetail);

  // Create comprehensive audit entry
  const auditEntry = {
    auditId,
    timestamp,
    userId,
    action,
    resource,
    resourceId,
    eventType,
    eventSource,
    
    // Financial context
    amount: eventDetail.amount || null,
    category: eventDetail.category || null,
    transactionId: eventDetail.transactionId || null,
    budgetId: eventDetail.budgetId || null,
    
    // Event metadata
    eventTimestamp: eventDetail.timestamp || timestamp,
    originalEventId: originalRecord.eventId || null,
    
    // Compliance fields
    ipAddress: extractIpAddress(originalRecord),
    userAgent: extractUserAgent(originalRecord),
    sessionId: extractSessionId(originalRecord),
    
    // Change tracking (for update events)
    beforeState: eventDetail.beforeState || null,
    afterState: eventDetail.afterState || null,
    changes: eventDetail.changes || null,
    
    // Security context
    authMethod: 'jwt', // Based on Cognito JWT auth
    permissions: extractPermissions(eventDetail),
    
    // System context
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'audit-logger',
    region: process.env.AWS_REGION || 'us-east-1',
    
    // Full event payload for debugging
    fullEventPayload: JSON.stringify(eventDetail),
    
    // Audit metadata
    auditVersion: '1.0',
    retentionCategory: determineRetentionCategory(eventType),
    complianceFlags: determineComplianceFlags(eventType, eventDetail)
  };

  return auditEntry;
}

function determineAction(eventType) {
  const actionMap = {
    'Transaction Created': 'CREATE',
    'Transaction Updated': 'UPDATE', 
    'Transaction Deleted': 'DELETE',
    'Budget Threshold Reached': 'ALERT',
    'Notification Sent': 'NOTIFY',
    'User Login': 'LOGIN',
    'User Logout': 'LOGOUT',
    'Budget Created': 'CREATE',
    'Budget Updated': 'UPDATE',
    'Budget Deleted': 'DELETE',
    'User Created': 'CREATE',
    'User Updated': 'UPDATE'
  };

  return actionMap[eventType] || 'UNKNOWN';
}

function determineResource(eventType, eventDetail) {
  if (eventType.includes('Transaction')) return 'TRANSACTION';
  if (eventType.includes('Budget')) return 'BUDGET';
  if (eventType.includes('User')) return 'USER';
  if (eventType.includes('Notification')) return 'NOTIFICATION';
  
  return 'SYSTEM';
}

function extractResourceId(eventDetail) {
  return eventDetail.transactionId || 
         eventDetail.budgetId || 
         eventDetail.userId || 
         eventDetail.notificationId || 
         'unknown';
}

function extractIpAddress(originalRecord) {
  // Extract from API Gateway event context if available
  return originalRecord.requestContext?.identity?.sourceIp || 'unknown';
}

function extractUserAgent(originalRecord) {
  // Extract from API Gateway headers if available
  return originalRecord.headers?.['User-Agent'] || 'unknown';
}

function extractSessionId(originalRecord) {
  // Extract from JWT claims or request context if available
  return originalRecord.requestContext?.requestId || 'unknown';
}

function extractPermissions(eventDetail) {
  // Based on user role/permissions from JWT claims
  // For now, return basic permissions
  return ['financial.read', 'financial.write'];
}

function determineRetentionCategory(eventType) {
  // Financial transactions require long-term retention
  if (eventType.includes('Transaction') || eventType.includes('Budget')) {
    return 'FINANCIAL_RECORD'; // 7+ years retention
  }
  
  // Notifications and alerts - shorter retention
  if (eventType.includes('Notification') || eventType.includes('Threshold')) {
    return 'OPERATIONAL'; // 1-2 years retention
  }
  
  // User management - medium retention
  if (eventType.includes('User')) {
    return 'USER_MANAGEMENT'; // 3-5 years retention
  }
  
  return 'STANDARD'; // Default retention
}

function determineComplianceFlags(eventType, eventDetail) {
  const flags = [];
  
  // Financial compliance
  if (eventType.includes('Transaction') || eventType.includes('Budget')) {
    flags.push('SOX_APPLICABLE', 'PCI_RELEVANT');
  }
  
  // Large transaction amounts
  if (eventDetail.amount && eventDetail.amount > 10000) {
    flags.push('HIGH_VALUE_TRANSACTION');
  }
  
  // Privacy compliance
  if (eventType.includes('User')) {
    flags.push('GDPR_APPLICABLE', 'CCPA_APPLICABLE');
  }
  
  // Security events
  if (eventType.includes('Login') || eventType.includes('Logout')) {
    flags.push('SECURITY_EVENT');
  }
  
  return flags;
}

async function storeAuditLog(auditEntry) {
  try {
    // Store in Users table with audit trail
    // Alternative: Create separate AuditLogs table for better scalability
    const params = {
      TableName: 'Users',
      Key: { userId: auditEntry.userId },
      UpdateExpression: 'SET #auditTrail = list_append(if_not_exists(#auditTrail, :empty_list), :audit)',
      ExpressionAttributeNames: {
        '#auditTrail': 'auditTrail'
      },
      ExpressionAttributeValues: {
        ':audit': [auditEntry],
        ':empty_list': []
      }
    };

    await docClient.update(params).promise();
    console.log(`Stored audit log ${auditEntry.auditId} for user ${auditEntry.userId}`);
  } catch (error) {
    console.error('Error storing audit log in DynamoDB:', error);
    
    // Fallback: Still log to CloudWatch even if DynamoDB fails
    console.error('AUDIT_STORAGE_FAILURE:', JSON.stringify({
      auditId: auditEntry.auditId,
      userId: auditEntry.userId,
      action: auditEntry.action,
      resource: auditEntry.resource,
      timestamp: auditEntry.timestamp,
      error: error.message
    }));
    
    // Don't throw - audit logging should be resilient
  }
}

function logAuditToCloudWatch(auditEntry) {
  // Structured logging for CloudWatch insights and monitoring
  const cloudWatchLog = {
    auditId: auditEntry.auditId,
    timestamp: auditEntry.timestamp,
    userId: auditEntry.userId,
    action: auditEntry.action,
    resource: auditEntry.resource,
    resourceId: auditEntry.resourceId,
    eventType: auditEntry.eventType,
    amount: auditEntry.amount,
    category: auditEntry.category,
    complianceFlags: auditEntry.complianceFlags,
    retentionCategory: auditEntry.retentionCategory
  };

  // Log as structured JSON for CloudWatch Insights queries
  console.log('AUDIT_LOG:', JSON.stringify(cloudWatchLog));
  
  // Also log human-readable format
  console.log(`AUDIT: ${auditEntry.action} ${auditEntry.resource} by ${auditEntry.userId} at ${auditEntry.timestamp}`);
}