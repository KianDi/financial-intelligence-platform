/**
 * Error Handling and Retry Utilities for Event-Driven Functions
 * 
 * This module provides robust error handling, retry logic, and circuit breaker
 * patterns for Lambda functions processing EventBridge events.
 */

// Error Types
const ERROR_TYPES = {
  TRANSIENT: 'TRANSIENT',        // Temporary errors that should be retried
  PERMANENT: 'PERMANENT',        // Permanent errors that shouldn't be retried
  THROTTLING: 'THROTTLING',      // Rate limiting errors
  VALIDATION: 'VALIDATION',      // Data validation errors
  TIMEOUT: 'TIMEOUT',           // Timeout errors
  NETWORK: 'NETWORK'            // Network connectivity errors
};

// Retry Configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,           // 1 second base delay
  maxDelayMs: 30000,           // 30 second max delay
  backoffMultiplier: 2,        // Exponential backoff
  jitterEnabled: true          // Add randomness to prevent thundering herd
};

// Circuit Breaker Configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,         // Open circuit after 5 failures
  recoveryTimeoutMs: 60000,    // Try to close circuit after 1 minute
  monitoringPeriodMs: 120000   // Monitor for 2 minutes
};

class RetryableError extends Error {
  constructor(message, errorType = ERROR_TYPES.TRANSIENT, retryAfter = null) {
    super(message);
    this.name = 'RetryableError';
    this.errorType = errorType;
    this.retryAfter = retryAfter; // Specific retry delay for throttling
    this.isRetryable = true;
  }
}

class NonRetryableError extends Error {
  constructor(message, errorType = ERROR_TYPES.PERMANENT) {
    super(message);
    this.name = 'NonRetryableError';
    this.errorType = errorType;
    this.isRetryable = false;
  }
}

// Circuit Breaker Implementation
class CircuitBreaker {
  constructor(config = CIRCUIT_BREAKER_CONFIG) {
    this.config = config;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log('Circuit breaker moving to HALF_OPEN state for recovery attempt');
      } else {
        throw new NonRetryableError('Circuit breaker is OPEN - operation not allowed');
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 2) { // Require 2 successes to fully close
          this.state = 'CLOSED';
          this.failureCount = 0;
          console.log('Circuit breaker closed after successful recovery');
        }
      } else {
        this.failureCount = 0; // Reset on success in CLOSED state
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      console.log(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Global circuit breakers for different operations
const circuitBreakers = {
  dynamodb: new CircuitBreaker(),
  eventbridge: new CircuitBreaker(),
  external_api: new CircuitBreaker()
};

// Error Classification
function classifyError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code || error.statusCode;

  // DynamoDB specific errors
  if (error.code === 'ProvisionedThroughputExceededException' || 
      error.code === 'ThrottlingException') {
    return ERROR_TYPES.THROTTLING;
  }
  
  if (error.code === 'ValidationException' || 
      error.code === 'ConditionalCheckFailedException') {
    return ERROR_TYPES.VALIDATION;
  }

  // Network and timeout errors
  if (errorMessage.includes('timeout') || 
      errorMessage.includes('etimedout') ||
      error.code === 'TimeoutError') {
    return ERROR_TYPES.TIMEOUT;
  }

  if (errorMessage.includes('network') || 
      errorMessage.includes('connection') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound')) {
    return ERROR_TYPES.NETWORK;
  }

  // HTTP status codes
  if (errorCode >= 500 && errorCode < 600) {
    return ERROR_TYPES.TRANSIENT; // Server errors are usually transient
  }
  
  if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
    return ERROR_TYPES.PERMANENT; // Client errors (except rate limiting)
  }
  
  if (errorCode === 429) {
    return ERROR_TYPES.THROTTLING;
  }

  // Default to transient for unknown errors
  return ERROR_TYPES.TRANSIENT;
}

// Retry Logic with Exponential Backoff
async function retryWithBackoff(operation, context = {}, config = RETRY_CONFIG) {
  let lastError;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateDelay(attempt, config);
        console.log(`Retry attempt ${attempt}/${config.maxRetries} after ${delay}ms delay`);
        await sleep(delay);
      }
      
      return await operation();
    } catch (error) {
      lastError = error;
      const errorType = classifyError(error);
      
      console.error(`Attempt ${attempt + 1} failed:`, {
        error: error.message,
        errorType,
        isRetryable: shouldRetry(error, errorType, attempt, config)
      });
      
      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === config.maxRetries || !shouldRetry(error, errorType, attempt, config)) {
        break;
      }
    }
  }
  
  // All retries exhausted
  throw new NonRetryableError(
    `Operation failed after ${config.maxRetries + 1} attempts. Last error: ${lastError.message}`,
    ERROR_TYPES.PERMANENT
  );
}

function shouldRetry(error, errorType, attempt, config) {
  // Never retry permanent errors
  if (errorType === ERROR_TYPES.PERMANENT || errorType === ERROR_TYPES.VALIDATION) {
    return false;
  }
  
  // Always retry transient errors within limit
  if (errorType === ERROR_TYPES.TRANSIENT || 
      errorType === ERROR_TYPES.NETWORK || 
      errorType === ERROR_TYPES.TIMEOUT) {
    return attempt < config.maxRetries;
  }
  
  // Retry throttling errors with longer delays
  if (errorType === ERROR_TYPES.THROTTLING) {
    return attempt < config.maxRetries;
  }
  
  return false;
}

function calculateDelay(attempt, config) {
  // Exponential backoff with jitter
  let delay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs
  );
  
  if (config.jitterEnabled) {
    // Add ±25% jitter to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay += jitter;
  }
  
  return Math.max(delay, 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Dead Letter Queue Handler
async function handleDeadLetterQueue(record, error, context = {}) {
  console.error('DEAD_LETTER_QUEUE: Message processing failed permanently', {
    messageId: record.messageId || 'unknown',
    eventType: record['detail-type'] || record.DetailType,
    userId: record.detail?.userId || 'unknown',
    error: error.message,
    errorType: error.errorType || 'unknown',
    functionName: context.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME,
    timestamp: new Date().toISOString(),
    fullRecord: JSON.stringify(record)
  });
  
  // In a production system, you might want to:
  // 1. Send to an actual DLQ (SQS)
  // 2. Store in a database for later analysis
  // 3. Send alerts to monitoring systems
  // 4. Trigger manual review processes
}

// Event Processing Wrapper
async function processEventWithRetry(event, processor, context = {}) {
  const results = [];
  const errors = [];
  
  // Process each record in the event
  const records = event.Records || [event];
  
  for (const record of records) {
    try {
      const result = await retryWithBackoff(
        () => circuitBreakers.dynamodb.execute(() => processor(record)),
        { recordId: record.messageId || 'unknown' }
      );
      
      results.push({
        recordId: record.messageId || 'unknown',
        status: 'success',
        result
      });
    } catch (error) {
      console.error('Record processing failed permanently:', error);
      
      // Send to dead letter queue
      await handleDeadLetterQueue(record, error, context);
      
      errors.push({
        recordId: record.messageId || 'unknown',
        status: 'failed',
        error: error.message,
        errorType: error.errorType || 'unknown'
      });
    }
  }
  
  return {
    totalRecords: records.length,
    successCount: results.length,
    errorCount: errors.length,
    results,
    errors
  };
}

// Health Check Utility
function getSystemHealth() {
  return {
    timestamp: new Date().toISOString(),
    circuitBreakers: Object.entries(circuitBreakers).reduce((acc, [name, cb]) => {
      acc[name] = cb.getState();
      return acc;
    }, {}),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  };
}

module.exports = {
  // Error Types
  ERROR_TYPES,
  RetryableError,
  NonRetryableError,
  
  // Core Functions
  retryWithBackoff,
  processEventWithRetry,
  classifyError,
  
  // Circuit Breaker
  CircuitBreaker,
  circuitBreakers,
  
  // Utilities
  handleDeadLetterQueue,
  getSystemHealth,
  
  // Configuration
  RETRY_CONFIG,
  CIRCUIT_BREAKER_CONFIG
};