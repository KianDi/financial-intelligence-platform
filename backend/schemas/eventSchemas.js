/**
 * Shared Event Schema Definitions for Financial Platform
 * 
 * This module defines standardized event schemas for all EventBridge events
 * to ensure consistency, prevent schema drift, and enable easier debugging.
 */

// Event Source Constants
const EVENT_SOURCES = {
  FINANCIAL_PLATFORM: 'financial.platform'
};

// Event Detail Types
const EVENT_TYPES = {
  TRANSACTION_CREATED: 'Transaction Created',
  TRANSACTION_UPDATED: 'Transaction Updated', 
  TRANSACTION_DELETED: 'Transaction Deleted',
  BUDGET_THRESHOLD_REACHED: 'Budget Threshold Reached',
  NOTIFICATION_SENT: 'Notification Sent',
  USER_CREATED: 'User Created',
  USER_UPDATED: 'User Updated',
  BUDGET_CREATED: 'Budget Created',
  BUDGET_UPDATED: 'Budget Updated',
  BUDGET_DELETED: 'Budget Deleted',
  AUDIT_LOG_CREATED: 'Audit Log Created'
};

// Base Event Schema
const baseEventSchema = {
  Source: EVENT_SOURCES.FINANCIAL_PLATFORM,
  DetailType: '', // Will be overridden by specific event types
  Detail: {}, // Will be populated with event-specific data
  EventBusName: 'financial-platform-events'
};

// Transaction Event Schemas
const transactionCreatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.TRANSACTION_CREATED,
  Detail: {
    userId: '', // Required: User who created the transaction
    transactionId: '', // Required: Unique transaction identifier
    amount: 0, // Required: Transaction amount (positive for income, positive for expenses)
    category: '', // Required: Transaction category (food, entertainment, etc.)
    type: '', // Required: 'income' or 'expense'
    description: '', // Optional: Transaction description
    timestamp: '', // Required: ISO timestamp when transaction was created
    metadata: {} // Optional: Additional transaction metadata
  }
};

const transactionUpdatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.TRANSACTION_UPDATED,
  Detail: {
    userId: '', // Required: User who updated the transaction
    transactionId: '', // Required: Transaction identifier
    beforeState: {}, // Required: Transaction state before update
    afterState: {}, // Required: Transaction state after update
    changes: [], // Required: Array of changed field names
    timestamp: '', // Required: ISO timestamp when update occurred
    updatedBy: '' // Required: User ID who made the update
  }
};

const transactionDeletedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.TRANSACTION_DELETED,
  Detail: {
    userId: '', // Required: User who deleted the transaction
    transactionId: '', // Required: Deleted transaction identifier
    deletedTransaction: {}, // Required: Full transaction data before deletion
    timestamp: '', // Required: ISO timestamp when deletion occurred
    deletedBy: '' // Required: User ID who performed the deletion
  }
};

// Budget Event Schemas
const budgetThresholdReachedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.BUDGET_THRESHOLD_REACHED,
  Detail: {
    userId: '', // Required: User whose budget reached threshold
    budgetId: '', // Required: Budget identifier
    category: '', // Required: Budget category
    currentSpending: 0, // Required: Current spending amount
    limit: 0, // Required: Budget limit amount
    percentageUsed: 0, // Required: Percentage of budget used (0-100+)
    thresholdType: '', // Required: 'warning' (80%) or 'exceeded' (100%)
    timestamp: '' // Required: ISO timestamp when threshold was reached
  }
};

const budgetCreatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.BUDGET_CREATED,
  Detail: {
    userId: '', // Required: User who created the budget
    budgetId: '', // Required: New budget identifier
    name: '', // Required: Budget name
    amount: 0, // Required: Budget limit amount
    category: '', // Optional: Budget category
    period: '', // Optional: Budget period (monthly, weekly, etc.)
    timestamp: '' // Required: ISO timestamp when budget was created
  }
};

// Notification Event Schemas
const notificationSentSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.NOTIFICATION_SENT,
  Detail: {
    userId: '', // Required: User who received notification
    budgetId: '', // Optional: Related budget ID
    category: '', // Optional: Related category
    notificationType: '', // Required: 'budget_threshold', 'transaction_alert', etc.
    thresholdType: '', // Optional: 'warning' or 'exceeded' for budget notifications
    channel: '', // Required: 'console', 'email', 'sms', 'push'
    timestamp: '', // Required: ISO timestamp when notification was sent
    notificationId: '' // Required: Unique notification identifier
  }
};

// User Event Schemas
const userCreatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.USER_CREATED,
  Detail: {
    userId: '', // Required: New user identifier
    email: '', // Required: User email
    profile: {}, // Optional: User profile data
    timestamp: '', // Required: ISO timestamp when user was created
    registrationMethod: '' // Optional: How user registered (cognito, social, etc.)
  }
};

const userUpdatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.USER_UPDATED,
  Detail: {
    userId: '', // Required: Updated user identifier
    beforeState: {}, // Required: User state before update
    afterState: {}, // Required: User state after update
    changes: [], // Required: Array of changed field names
    timestamp: '', // Required: ISO timestamp when update occurred
    updatedBy: '' // Required: User ID who made the update
  }
};

// Audit Event Schema
const auditLogCreatedSchema = {
  ...baseEventSchema,
  DetailType: EVENT_TYPES.AUDIT_LOG_CREATED,
  Detail: {
    auditId: '', // Required: Unique audit log identifier
    userId: '', // Required: User associated with the audited action
    action: '', // Required: Action performed (CREATE, UPDATE, DELETE, etc.)
    resource: '', // Required: Resource type (TRANSACTION, BUDGET, USER, etc.)
    resourceId: '', // Required: Identifier of the affected resource
    timestamp: '', // Required: ISO timestamp when audit was created
    complianceFlags: [], // Optional: Array of compliance flags
    retentionCategory: '' // Required: Retention category for the audit log
  }
};

// Schema Validation Functions
function validateEventSchema(event, schema) {
  const errors = [];
  
  // Validate base event structure
  if (!event.Source) errors.push('Missing required field: Source');
  if (!event.DetailType) errors.push('Missing required field: DetailType');
  if (!event.Detail) errors.push('Missing required field: Detail');
  
  // Validate event source matches schema
  if (event.Source !== schema.Source) {
    errors.push(`Invalid Source: expected ${schema.Source}, got ${event.Source}`);
  }
  
  // Validate detail type matches schema
  if (event.DetailType !== schema.DetailType) {
    errors.push(`Invalid DetailType: expected ${schema.DetailType}, got ${event.DetailType}`);
  }
  
  // Validate required fields in Detail object
  validateDetailFields(event.Detail, schema.Detail, '', errors);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateDetailFields(detail, schema, prefix, errors) {
  for (const [key, schemaValue] of Object.entries(schema)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    
    if (typeof schemaValue === 'string' && schemaValue !== '') {
      // Required string field
      if (!detail.hasOwnProperty(key)) {
        errors.push(`Missing required field: Detail.${fieldPath}`);
      } else if (typeof detail[key] !== 'string') {
        errors.push(`Invalid type for Detail.${fieldPath}: expected string, got ${typeof detail[key]}`);
      }
    } else if (typeof schemaValue === 'number') {
      // Required number field
      if (!detail.hasOwnProperty(key)) {
        errors.push(`Missing required field: Detail.${fieldPath}`);
      } else if (typeof detail[key] !== 'number') {
        errors.push(`Invalid type for Detail.${fieldPath}: expected number, got ${typeof detail[key]}`);
      }
    } else if (Array.isArray(schemaValue)) {
      // Array field
      if (detail.hasOwnProperty(key) && !Array.isArray(detail[key])) {
        errors.push(`Invalid type for Detail.${fieldPath}: expected array, got ${typeof detail[key]}`);
      }
    } else if (typeof schemaValue === 'object' && schemaValue !== null) {
      // Nested object - validate recursively if present
      if (detail.hasOwnProperty(key) && typeof detail[key] === 'object') {
        validateDetailFields(detail[key], schemaValue, fieldPath, errors);
      }
    }
  }
}

// Event Builder Functions
function createTransactionCreatedEvent({ userId, transactionId, amount, category, type, description = '', timestamp = new Date().toISOString(), metadata = {} }) {
  return {
    ...transactionCreatedSchema,
    Detail: {
      userId,
      transactionId,
      amount,
      category,
      type,
      description,
      timestamp,
      metadata
    }
  };
}

function createTransactionUpdatedEvent({ userId, transactionId, beforeState, afterState, changes, updatedBy, timestamp = new Date().toISOString() }) {
  return {
    ...transactionUpdatedSchema,
    Detail: {
      userId,
      transactionId,
      beforeState,
      afterState,
      changes,
      timestamp,
      updatedBy
    }
  };
}

function createTransactionDeletedEvent({ userId, transactionId, deletedTransaction, deletedBy, timestamp = new Date().toISOString() }) {
  return {
    ...transactionDeletedSchema,
    Detail: {
      userId,
      transactionId,
      deletedTransaction,
      timestamp,
      deletedBy
    }
  };
}

function createBudgetThresholdReachedEvent({ userId, budgetId, category, currentSpending, limit, percentageUsed, thresholdType, timestamp = new Date().toISOString() }) {
  return {
    ...budgetThresholdReachedSchema,
    Detail: {
      userId,
      budgetId,
      category,
      currentSpending,
      limit,
      percentageUsed,
      thresholdType,
      timestamp
    }
  };
}

function createNotificationSentEvent({ userId, budgetId = '', category = '', notificationType, thresholdType = '', channel, notificationId, timestamp = new Date().toISOString() }) {
  return {
    ...notificationSentSchema,
    Detail: {
      userId,
      budgetId,
      category,
      notificationType,
      thresholdType,
      channel,
      timestamp,
      notificationId
    }
  };
}

// Schema Registry
const SCHEMAS = {
  [EVENT_TYPES.TRANSACTION_CREATED]: transactionCreatedSchema,
  [EVENT_TYPES.TRANSACTION_UPDATED]: transactionUpdatedSchema,
  [EVENT_TYPES.TRANSACTION_DELETED]: transactionDeletedSchema,
  [EVENT_TYPES.BUDGET_THRESHOLD_REACHED]: budgetThresholdReachedSchema,
  [EVENT_TYPES.NOTIFICATION_SENT]: notificationSentSchema,
  [EVENT_TYPES.USER_CREATED]: userCreatedSchema,
  [EVENT_TYPES.USER_UPDATED]: userUpdatedSchema,
  [EVENT_TYPES.BUDGET_CREATED]: budgetCreatedSchema,
  [EVENT_TYPES.AUDIT_LOG_CREATED]: auditLogCreatedSchema
};

// Export everything
module.exports = {
  // Constants
  EVENT_SOURCES,
  EVENT_TYPES,
  
  // Schemas
  SCHEMAS,
  
  // Individual schemas for direct access
  transactionCreatedSchema,
  transactionUpdatedSchema,
  transactionDeletedSchema,
  budgetThresholdReachedSchema,
  budgetCreatedSchema,
  notificationSentSchema,
  userCreatedSchema,
  userUpdatedSchema,
  auditLogCreatedSchema,
  
  // Validation functions
  validateEventSchema,
  
  // Event builder functions
  createTransactionCreatedEvent,
  createTransactionUpdatedEvent,
  createTransactionDeletedEvent,
  createBudgetThresholdReachedEvent,
  createNotificationSentEvent
};