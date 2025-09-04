const WebSocket = require('ws');
const axios = require('axios');

const WS_BASE_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';

// Advanced WebSocket test client that simulates network issues and reconnection scenarios
class ResilientWebSocketTestClient {
  constructor(token, options = {}) {
    this.token = token;
    this.url = WS_BASE_URL;
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts || 3,
      reconnectInterval: options.reconnectInterval || 1000, // Faster for testing
      heartbeatInterval: options.heartbeatInterval || 5000, // Faster for testing
      ...options
    };
    
    this.ws = null;
    this.connectionAttempts = [];
    this.reconnectAttempts = 0;
    this.isIntentionallyClosed = false;
    this.connectionStates = [];
    this.heartbeatTests = [];
    this.eventLog = [];
  }

  log(event, data = {}) {
    const logEntry = {
      timestamp: Date.now(),
      event,
      ...data
    };
    this.eventLog.push(logEntry);
    console.log(`[${new Date().toISOString()}] ${event}:`, data);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const attemptStartTime = Date.now();
      this.connectionAttempts.push({ startTime: attemptStartTime, attempt: this.reconnectAttempts + 1 });

      const wsUrl = `${this.url}?token=${this.token}`;
      this.log('CONNECTION_ATTEMPT', { url: wsUrl, attempt: this.reconnectAttempts + 1 });

      this.ws = new WebSocket(wsUrl);
      let resolved = false;

      this.ws.on('open', () => {
        const connectionTime = Date.now() - attemptStartTime;
        this.log('CONNECTION_ESTABLISHED', { connectionTime, attempt: this.reconnectAttempts + 1 });
        
        this.connectionStates.push({
          state: 'CONNECTED',
          timestamp: Date.now(),
          connectionTime,
          attempt: this.reconnectAttempts + 1
        });

        this.reconnectAttempts = 0;
        
        if (!resolved) {
          resolved = true;
          resolve({ connected: true, connectionTime, attempts: this.connectionAttempts.length });
        }
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.log('MESSAGE_RECEIVED', { type: message.type });
          
          // Track heartbeat responses
          if (message.type === 'pong') {
            this.heartbeatTests.push({
              timestamp: Date.now(),
              responseReceived: true
            });
          }
        } catch (error) {
          this.log('MESSAGE_PARSE_ERROR', { error: error.message });
        }
      });

      this.ws.on('close', (code, reason) => {
        const closeTime = Date.now() - attemptStartTime;
        this.log('CONNECTION_CLOSED', { 
          code, 
          reason: reason.toString(), 
          closeTime,
          intentional: this.isIntentionallyClosed 
        });

        this.connectionStates.push({
          state: 'DISCONNECTED',
          timestamp: Date.now(),
          code,
          reason: reason.toString(),
          closeTime
        });

        // Attempt reconnection if not intentionally closed and within retry limits
        if (!this.isIntentionallyClosed && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.attemptReconnect();
        } else if (!resolved) {
          resolved = true;
          if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            reject(new Error(`Max reconnection attempts (${this.options.maxReconnectAttempts}) exceeded`));
          } else {
            reject(new Error(`Connection closed: ${code} - ${reason}`));
          }
        }
      });

      this.ws.on('error', (error) => {
        this.log('CONNECTION_ERROR', { error: error.message });
        
        this.connectionStates.push({
          state: 'ERROR',
          timestamp: Date.now(),
          error: error.message
        });

        if (!resolved && this.reconnectAttempts === 0) {
          resolved = true;
          reject(error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.log('CONNECTION_TIMEOUT', { timeout: 10000 });
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  attemptReconnect() {
    this.reconnectAttempts++;
    
    // Exponential backoff with jitter (same as implemented in frontend)
    const baseDelay = this.options.reconnectInterval;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 500; // Reduced jitter for faster testing
    const finalDelay = Math.min(exponentialDelay + jitter, 10000); // Cap at 10 seconds for testing

    this.log('RECONNECT_SCHEDULED', { 
      attempt: this.reconnectAttempts, 
      delay: finalDelay,
      maxAttempts: this.options.maxReconnectAttempts
    });

    setTimeout(() => {
      this.log('RECONNECT_STARTING', { attempt: this.reconnectAttempts });
      this.connect().catch((error) => {
        this.log('RECONNECT_FAILED', { attempt: this.reconnectAttempts, error: error.message });
      });
    }, finalDelay);
  }

  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const heartbeatTime = Date.now();
      this.heartbeatTests.push({
        timestamp: heartbeatTime,
        sent: true
      });
      
      this.ws.send(JSON.stringify({
        action: 'ping',
        data: { heartbeat: true, timestamp: heartbeatTime }
      }));
      
      this.log('HEARTBEAT_SENT', { timestamp: heartbeatTime });
      return true;
    }
    return false;
  }

  simulateNetworkDisruption() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log('NETWORK_DISRUPTION_SIMULATED');
      // Force close the connection to simulate network failure
      this.ws.terminate();
      return true;
    }
    return false;
  }

  close() {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.log('INTENTIONAL_CLOSE');
      this.ws.close(1000, 'Test completed');
    }
  }

  getResilienceReport() {
    const totalAttempts = this.connectionAttempts.length;
    const successfulConnections = this.connectionStates.filter(s => s.state === 'CONNECTED').length;
    const averageConnectionTime = this.connectionAttempts
      .map(a => {
        const connected = this.connectionStates.find(s => s.state === 'CONNECTED' && s.attempt === a.attempt);
        return connected ? connected.connectionTime : null;
      })
      .filter(t => t !== null)
      .reduce((sum, time, _, arr) => sum + time / arr.length, 0);

    const heartbeatStats = {
      sent: this.heartbeatTests.filter(h => h.sent).length,
      received: this.heartbeatTests.filter(h => h.responseReceived).length,
      successRate: this.heartbeatTests.length > 0 
        ? (this.heartbeatTests.filter(h => h.responseReceived).length / this.heartbeatTests.filter(h => h.sent).length) * 100
        : 0
    };

    return {
      totalAttempts,
      successfulConnections,
      reconnectionAttempts: this.reconnectAttempts,
      averageConnectionTime: Math.round(averageConnectionTime || 0),
      heartbeatStats,
      connectionStates: this.connectionStates,
      eventLog: this.eventLog,
      resilientConnection: successfulConnections > 0,
      recoveredFromFailure: this.reconnectAttempts > 0 && successfulConnections > 0
    };
  }
}

// Test Suite for Resilience and Error Handling
class ResilienceTestSuite {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.results = [];
  }

  async runAllTests() {
    console.log('🔄 Starting WebSocket Resilience Test Suite\n');

    await this.testBasicResilience();
    await this.testReconnectionLogic();
    await this.testHeartbeatMechanism();
    await this.testErrorRecovery();
    await this.testConnectionLimits();

    return this.generateReport();
  }

  async testBasicResilience() {
    console.log('🛡️  Testing Basic Connection Resilience...');

    try {
      const client = new ResilientWebSocketTestClient(this.accessToken, {
        maxReconnectAttempts: 2,
        reconnectInterval: 500
      });

      const result = await client.connect();
      
      this.results.push({
        testName: 'Basic Resilience - Initial Connection',
        success: result.connected,
        details: `Connected in ${result.connectionTime}ms`,
        data: result
      });

      // Simulate network disruption
      const disruptionSuccess = client.simulateNetworkDisruption();
      
      if (disruptionSuccess) {
        // Wait for reconnection attempts
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const report = client.getResilienceReport();
        
        this.results.push({
          testName: 'Basic Resilience - Network Disruption Recovery',
          success: report.recoveredFromFailure,
          details: `Reconnection attempts: ${report.reconnectionAttempts}, Recovered: ${report.recoveredFromFailure}`,
          data: report
        });
      }

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Basic Resilience Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testReconnectionLogic() {
    console.log('🔁 Testing Exponential Backoff Reconnection...');

    // Test with invalid token to trigger immediate failures and reconnection logic
    try {
      const client = new ResilientWebSocketTestClient('invalid-token-for-testing', {
        maxReconnectAttempts: 3,
        reconnectInterval: 200 // Very fast for testing
      });

      const startTime = Date.now();
      
      try {
        await client.connect();
        // Should not succeed with invalid token
        this.results.push({
          testName: 'Reconnection Logic - Invalid Token Test',
          success: false,
          details: 'Should not have connected with invalid token',
          data: {}
        });
      } catch (error) {
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const report = client.getResilienceReport();

        // Check if exponential backoff was applied
        const expectedMinTime = 200 + 400 + 800; // Base delays for 3 attempts
        const validReconnectionBehavior = report.reconnectionAttempts === 3 && totalTime >= expectedMinTime;

        this.results.push({
          testName: 'Reconnection Logic - Exponential Backoff',
          success: validReconnectionBehavior,
          details: `Attempts: ${report.reconnectionAttempts}, Time: ${totalTime}ms, Expected min: ${expectedMinTime}ms`,
          data: { ...report, totalTime }
        });
      }

    } catch (error) {
      this.results.push({
        testName: 'Reconnection Logic Test Setup',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testHeartbeatMechanism() {
    console.log('💓 Testing Heartbeat Mechanism...');

    try {
      const client = new ResilientWebSocketTestClient(this.accessToken, {
        heartbeatInterval: 2000 // 2 seconds for testing
      });

      await client.connect();

      // Send multiple heartbeats
      const heartbeatCount = 3;
      const heartbeatResults = [];

      for (let i = 0; i < heartbeatCount; i++) {
        const sent = client.sendHeartbeat();
        heartbeatResults.push(sent);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between heartbeats
      }

      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, 2000));

      const report = client.getResilienceReport();
      const allHeartbeatsSent = heartbeatResults.every(result => result === true);
      const goodResponseRate = report.heartbeatStats.successRate > 80;

      this.results.push({
        testName: 'Heartbeat Mechanism - Send/Receive',
        success: allHeartbeatsSent && goodResponseRate,
        details: `Sent: ${report.heartbeatStats.sent}, Received: ${report.heartbeatStats.received}, Success Rate: ${report.heartbeatStats.successRate.toFixed(1)}%`,
        data: report.heartbeatStats
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Heartbeat Mechanism Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testErrorRecovery() {
    console.log('⚠️  Testing Error Recovery Scenarios...');

    // Test recovery from different error types
    const errorScenarios = [
      { name: 'Invalid Token Auth Error', token: 'invalid-token', expectedFailure: true },
      { name: 'Empty Token Auth Error', token: '', expectedFailure: true },
      { name: 'Valid Token Success', token: this.accessToken, expectedFailure: false }
    ];

    for (const scenario of errorScenarios) {
      try {
        const client = new ResilientWebSocketTestClient(scenario.token, {
          maxReconnectAttempts: 1, // Limit attempts for faster testing
          reconnectInterval: 300
        });

        let connectionResult;
        let connectionError;

        try {
          connectionResult = await client.connect();
        } catch (error) {
          connectionError = error;
        }

        const didFail = !!connectionError;
        const expectedOutcome = scenario.expectedFailure === didFail;

        this.results.push({
          testName: `Error Recovery - ${scenario.name}`,
          success: expectedOutcome,
          details: scenario.expectedFailure 
            ? `Expected failure: ${didFail ? connectionError.message : 'No error occurred'}`
            : `Expected success: ${connectionResult ? 'Connected successfully' : 'Connection failed'}`,
          data: { expectedFailure: scenario.expectedFailure, actualFailure: didFail }
        });

        client.close();

      } catch (error) {
        this.results.push({
          testName: `Error Recovery - ${scenario.name} Setup`,
          success: false,
          details: error.message,
          data: { error: error.message }
        });
      }
    }
  }

  async testConnectionLimits() {
    console.log('📊 Testing Connection Limits and Resource Management...');

    try {
      // Test multiple concurrent connections (resource usage)
      const concurrentClients = [];
      const connectionPromises = [];

      for (let i = 0; i < 3; i++) {
        const client = new ResilientWebSocketTestClient(this.accessToken);
        concurrentClients.push(client);
        connectionPromises.push(client.connect().catch(error => ({ error: error.message, index: i })));
      }

      const results = await Promise.allSettled(connectionPromises);
      const successfulConnections = results.filter(r => r.status === 'fulfilled' && r.value.connected).length;

      this.results.push({
        testName: 'Connection Limits - Concurrent Connections',
        success: successfulConnections >= 2, // At least 2 should succeed
        details: `${successfulConnections}/3 concurrent connections succeeded`,
        data: { successfulConnections, totalAttempted: 3 }
      });

      // Clean up
      concurrentClients.forEach(client => client.close());

    } catch (error) {
      this.results.push({
        testName: 'Connection Limits Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 WEBSOCKET RESILIENCE TEST REPORT');
    console.log('='.repeat(80));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${successRate}%`);

    console.log('\n📊 DETAILED RESULTS:');
    console.log('-'.repeat(80));

    this.results.forEach(result => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${result.testName}`);
      console.log(`   ${result.details}`);
      console.log('');
    });

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS SUMMARY:');
      console.log('-'.repeat(80));
      this.results
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`- ${result.testName}: ${result.details}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log(passedTests === totalTests ? '✅ ALL RESILIENCE TESTS PASSED' : '❌ SOME RESILIENCE TESTS FAILED');
    console.log('='.repeat(80));

    return passedTests === totalTests;
  }
}

// Main execution
async function main() {
  const accessToken = process.argv[2];

  if (!accessToken) {
    console.log('❌ Please provide an access token as argument');
    console.log('Usage: node test-websocket-resilience.js [ACCESS_TOKEN]');
    console.log('Get token by running: node test-auth.js');
    process.exit(1);
  }

  try {
    const testSuite = new ResilienceTestSuite(accessToken);
    const allTestsPassed = await testSuite.runAllTests();

    process.exit(allTestsPassed ? 0 : 1);

  } catch (error) {
    console.error('❌ Resilience test suite execution failed:', error.message);
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  ResilientWebSocketTestClient,
  ResilienceTestSuite
};

// Run if called directly
if (require.main === module) {
  main();
}