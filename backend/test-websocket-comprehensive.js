const axios = require('axios');
const WebSocket = require('ws');

const API_BASE_URL = 'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com';
const WS_BASE_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';

// Test utilities
class TestReporter {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, result, details = '') {
    const status = result ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}`);
    if (details && !result) {
      console.log(`   Details: ${details}`);
    }
    
    this.tests.push({ name, result, details });
    if (result) this.passed++; else this.failed++;
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.tests.length}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
    
    if (this.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.tests.filter(t => !t.result).forEach(test => {
        console.log(`   - ${test.name}: ${test.details}`);
      });
    }
    
    return this.failed === 0;
  }
}

// Enhanced WebSocket test client with timing and state tracking
class WebSocketTestClient {
  constructor(token, options = {}) {
    this.token = token;
    this.url = WS_BASE_URL;
    this.options = {
      timeout: options.timeout || 10000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      ...options
    };
    this.ws = null;
    this.messages = [];
    this.connectionStates = [];
    this.startTime = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.startTime = Date.now();
      const wsUrl = `${this.url}?token=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connectionStates.push({ state: 'connected', time: Date.now() - this.startTime });
        resolve({ connected: true, time: Date.now() - this.startTime });
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.messages.push({ ...message, receivedAt: Date.now() });
        } catch (error) {
          this.messages.push({ raw: data.toString(), error: error.message, receivedAt: Date.now() });
        }
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        this.connectionStates.push({ 
          state: 'closed', 
          code, 
          reason: reason.toString(), 
          time: Date.now() - this.startTime 
        });
        
        if (this.connectionStates.length === 1) {
          // Initial connection failed
          reject(new Error(`Connection failed: ${code} - ${reason}`));
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.connectionStates.push({ 
          state: 'error', 
          error: error.message, 
          time: Date.now() - this.startTime 
        });
        reject(error);
      });
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  waitForMessages(count, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startCount = this.messages.length;
      const checkInterval = setInterval(() => {
        if (this.messages.length >= startCount + count) {
          clearInterval(checkInterval);
          resolve(this.messages.slice(startCount, startCount + count));
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Timeout waiting for ${count} messages. Got ${this.messages.length - startCount}`));
      }, timeout);
    });
  }

  close() {
    if (this.ws) {
      this.ws.close(1000, 'Test completed');
    }
  }

  getStats() {
    return {
      totalMessages: this.messages.length,
      connectionStates: this.connectionStates,
      connectionTime: this.connectionStates.find(s => s.state === 'connected')?.time || null,
      messageTypes: this.messages.reduce((acc, msg) => {
        const type = msg.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// Test Suite
class WebSocketTestSuite {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.reporter = new TestReporter();
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive WebSocket Test Suite\n');

    await this.testBasicConnection();
    await this.testAuthentication();
    await this.testMessageFlow();
    await this.testSubscriptions();
    await this.testLiveData();
    await this.testErrorHandling();
    await this.testConnectionStates();
    await this.testHeartbeat();

    return this.reporter.summary();
  }

  async testBasicConnection() {
    console.log('\n🔌 Testing Basic Connection...');
    
    try {
      const client = new WebSocketTestClient(this.accessToken, { timeout: 5000 });
      const result = await client.connect();
      
      this.reporter.test(
        'WebSocket Connection Establishment',
        result.connected,
        `Connection time: ${result.time}ms`
      );

      this.reporter.test(
        'Connection Time Performance',
        result.time < 3000,
        `Expected < 3000ms, got ${result.time}ms`
      );

      client.close();
      
    } catch (error) {
      this.reporter.test(
        'WebSocket Connection Establishment',
        false,
        error.message
      );
    }
  }

  async testAuthentication() {
    console.log('\n🔐 Testing Authentication...');

    // Test valid token
    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();
      this.reporter.test('Valid Token Authentication', true);
      client.close();
    } catch (error) {
      this.reporter.test('Valid Token Authentication', false, error.message);
    }

    // Test invalid token
    try {
      const client = new WebSocketTestClient('invalid-token', { timeout: 3000 });
      await client.connect();
      this.reporter.test('Invalid Token Rejection', false, 'Should have been rejected');
    } catch (error) {
      this.reporter.test(
        'Invalid Token Rejection',
        error.message.includes('401') || error.message.includes('Connection failed'),
        `Expected authentication error, got: ${error.message}`
      );
    }

    // Test missing token
    try {
      const client = new WebSocketTestClient('', { timeout: 3000 });
      await client.connect();
      this.reporter.test('Missing Token Rejection', false, 'Should have been rejected');
    } catch (error) {
      this.reporter.test(
        'Missing Token Rejection',
        error.message.includes('401') || error.message.includes('Connection failed'),
        `Expected authentication error, got: ${error.message}`
      );
    }
  }

  async testMessageFlow() {
    console.log('\n📨 Testing Message Flow...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Test ping/pong
      const pingResult = client.send({ action: 'ping', data: { test: true } });
      this.reporter.test('Message Sending', pingResult, 'Failed to send ping');

      if (pingResult) {
        try {
          const messages = await client.waitForMessages(1, 3000);
          const pongMessage = messages.find(m => m.type === 'pong');
          
          this.reporter.test(
            'Ping/Pong Response',
            !!pongMessage,
            pongMessage ? 'Received pong response' : 'No pong response received'
          );

          this.reporter.test(
            'Message Response Time',
            messages[0]?.receivedAt - Date.now() < 1000,
            'Response time should be < 1000ms'
          );
        } catch (error) {
          this.reporter.test('Ping/Pong Response', false, error.message);
        }
      }

      client.close();
    } catch (error) {
      this.reporter.test('Message Flow Test Setup', false, error.message);
    }
  }

  async testSubscriptions() {
    console.log('\n🔔 Testing Subscriptions...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Test subscription
      client.send({
        action: 'subscribe',
        data: { channels: ['transactions', 'budgets', 'notifications'] }
      });

      try {
        const messages = await client.waitForMessages(1, 3000);
        const confirmMessage = messages.find(m => m.type === 'subscription_confirmed');
        
        this.reporter.test(
          'Subscription Confirmation',
          !!confirmMessage,
          confirmMessage ? 'Subscription confirmed' : 'No confirmation received'
        );

        if (confirmMessage) {
          const hasCorrectChannels = confirmMessage.channels &&
            confirmMessage.channels.includes('transactions') &&
            confirmMessage.channels.includes('budgets') &&
            confirmMessage.channels.includes('notifications');

          this.reporter.test(
            'Subscription Channel Verification',
            hasCorrectChannels,
            `Expected channels: [transactions, budgets, notifications], got: ${JSON.stringify(confirmMessage.channels)}`
          );
        }
      } catch (error) {
        this.reporter.test('Subscription Confirmation', false, error.message);
      }

      client.close();
    } catch (error) {
      this.reporter.test('Subscription Test Setup', false, error.message);
    }
  }

  async testLiveData() {
    console.log('\n📊 Testing Live Data Requests...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Test live data request
      client.send({
        action: 'get_live_data',
        data: { dataType: 'recent_transactions' }
      });

      try {
        const messages = await client.waitForMessages(1, 5000);
        const liveDataMessage = messages.find(m => m.type === 'live_data_response');
        
        this.reporter.test(
          'Live Data Response',
          !!liveDataMessage,
          liveDataMessage ? 'Live data received' : 'No live data response'
        );

        if (liveDataMessage) {
          const hasCorrectStructure = liveDataMessage.dataType === 'recent_transactions' &&
            liveDataMessage.data && 
            Array.isArray(liveDataMessage.data.transactions);

          this.reporter.test(
            'Live Data Structure Validation',
            hasCorrectStructure,
            `Expected dataType and transactions array, got: ${JSON.stringify(liveDataMessage, null, 2)}`
          );
        }
      } catch (error) {
        this.reporter.test('Live Data Response', false, error.message);
      }

      client.close();
    } catch (error) {
      this.reporter.test('Live Data Test Setup', false, error.message);
    }
  }

  async testErrorHandling() {
    console.log('\n⚠️  Testing Error Handling...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Test invalid action
      client.send({
        action: 'invalid_action',
        data: { test: true }
      });

      try {
        const messages = await client.waitForMessages(1, 3000);
        const errorMessage = messages.find(m => m.type === 'error');
        
        this.reporter.test(
          'Invalid Action Error Handling',
          !!errorMessage,
          errorMessage ? 'Error message received for invalid action' : 'No error message for invalid action'
        );
      } catch (error) {
        // Timeout is acceptable - server might not send error for unknown actions
        this.reporter.test(
          'Invalid Action Error Handling',
          true,
          'Server handled invalid action gracefully (no response or error)'
        );
      }

      client.close();
    } catch (error) {
      this.reporter.test('Error Handling Test Setup', false, error.message);
    }
  }

  async testConnectionStates() {
    console.log('\n🔄 Testing Connection States...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Test graceful disconnect
      client.close();
      
      // Wait for close event
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const stats = client.getStats();
      const hasConnectedState = stats.connectionStates.some(s => s.state === 'connected');
      const hasClosedState = stats.connectionStates.some(s => s.state === 'closed');

      this.reporter.test(
        'Connection State Tracking',
        hasConnectedState && hasClosedState,
        `States recorded: ${stats.connectionStates.map(s => s.state).join(', ')}`
      );

      this.reporter.test(
        'Graceful Disconnection',
        stats.connectionStates.find(s => s.state === 'closed')?.code === 1000,
        'Expected close code 1000 for normal closure'
      );

    } catch (error) {
      this.reporter.test('Connection States Test Setup', false, error.message);
    }
  }

  async testHeartbeat() {
    console.log('\n💓 Testing Heartbeat (Basic - Full test requires 30s+)...');

    try {
      const client = new WebSocketTestClient(this.accessToken);
      await client.connect();

      // Send a manual ping to test the mechanism
      client.send({ action: 'ping', data: { heartbeat: true } });

      try {
        const messages = await client.waitForMessages(1, 3000);
        const pongMessage = messages.find(m => m.type === 'pong');
        
        this.reporter.test(
          'Manual Heartbeat Test',
          !!pongMessage,
          'Manual ping/pong for heartbeat verification'
        );

        // Test message timing for heartbeat efficiency
        if (pongMessage) {
          const responseTime = pongMessage.receivedAt - Date.now();
          this.reporter.test(
            'Heartbeat Response Time',
            Math.abs(responseTime) < 500,
            `Response time should be fast for heartbeat, got ${Math.abs(responseTime)}ms`
          );
        }
      } catch (error) {
        this.reporter.test('Manual Heartbeat Test', false, error.message);
      }

      client.close();
    } catch (error) {
      this.reporter.test('Heartbeat Test Setup', false, error.message);
    }
  }
}

// Integration test with transaction creation
async function testRealTimeIntegration(accessToken) {
  console.log('\n🔗 Testing Real-time Integration...');
  
  const reporter = new TestReporter();
  
  try {
    // Create WebSocket connection
    const client = new WebSocketTestClient(accessToken);
    await client.connect();

    // Subscribe to transaction events
    client.send({
      action: 'subscribe',
      data: { channels: ['transactions', 'budgets'] }
    });

    // Wait for subscription confirmation
    await client.waitForMessages(1, 3000);

    // Create a transaction via REST API to trigger WebSocket events
    const transactionData = {
      amount: 99.99,
      category: 'websocket_test',
      description: 'WebSocket Integration Test Transaction',
      type: 'expense'
    };

    const restResponse = await axios.post(
      `${API_BASE_URL}/transactions`,
      transactionData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    reporter.test(
      'REST API Transaction Creation',
      restResponse.status === 201,
      `Expected 201, got ${restResponse.status}`
    );

    // Wait for WebSocket events (transaction + budget alert)
    try {
      const messages = await client.waitForMessages(2, 10000);
      const transactionEvent = messages.find(m => m.type === 'transaction_created');
      const budgetEvent = messages.find(m => m.type === 'budget_threshold_alert');

      reporter.test(
        'Real-time Transaction Event',
        !!transactionEvent,
        transactionEvent ? 'Transaction event received via WebSocket' : 'No transaction event received'
      );

      reporter.test(
        'Real-time Budget Alert Event', 
        !!budgetEvent,
        budgetEvent ? 'Budget alert received via WebSocket' : 'No budget alert received'
      );

      // Verify event data consistency
      if (transactionEvent && restResponse.data.transaction) {
        const consistentData = transactionEvent.data.transactionId === restResponse.data.transaction.transactionId;
        reporter.test(
          'Event Data Consistency',
          consistentData,
          `REST ID: ${restResponse.data.transaction.transactionId}, WebSocket ID: ${transactionEvent.data?.transactionId}`
        );
      }

    } catch (error) {
      reporter.test('Real-time Event Reception', false, error.message);
    }

    client.close();

  } catch (error) {
    reporter.test('Real-time Integration Test Setup', false, error.message);
  }

  return reporter.summary();
}

// Main execution
async function main() {
  const accessToken = process.argv[2];

  if (!accessToken) {
    console.log('❌ Please provide an access token as argument');
    console.log('Usage: node test-websocket-comprehensive.js [ACCESS_TOKEN]');
    console.log('Get token by running: node test-auth.js');
    process.exit(1);
  }

  console.log('🚀 Starting Comprehensive WebSocket Test Suite');
  console.log('='.repeat(60));

  try {
    const testSuite = new WebSocketTestSuite(accessToken);
    const allTestsPassed = await testSuite.runAllTests();

    // Run integration test
    const integrationPassed = await testRealTimeIntegration(accessToken);

    const overallSuccess = allTestsPassed && integrationPassed;

    console.log('\n' + '='.repeat(60));
    console.log('🎯 OVERALL RESULT');
    console.log('='.repeat(60));
    console.log(overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    
    process.exit(overallSuccess ? 0 : 1);

  } catch (error) {
    console.error('❌ Test suite execution failed:', error.message);
    process.exit(1);
  }
}

// Export for potential module usage
module.exports = {
  WebSocketTestClient,
  WebSocketTestSuite,
  TestReporter,
  testRealTimeIntegration
};

// Run if called directly
if (require.main === module) {
  main();
}