const WebSocket = require('ws');

const WS_BASE_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';

// Specialized WebSocket client for heartbeat and health monitoring tests
class HeartbeatTestClient {
  constructor(token, options = {}) {
    this.token = token;
    this.url = WS_BASE_URL;
    this.options = {
      heartbeatInterval: options.heartbeatInterval || 30000, // Default 30 seconds
      healthCheckInterval: options.healthCheckInterval || 10000, // Health check every 10 seconds
      responseTimeout: options.responseTimeout || 5000, // 5 second timeout for pong responses
      ...options
    };
    
    this.ws = null;
    this.heartbeatTimer = null;
    this.healthCheckTimer = null;
    this.connectionHealth = {
      isHealthy: false,
      lastHeartbeatSent: null,
      lastPongReceived: null,
      consecutiveFailures: 0,
      totalPingsSent: 0,
      totalPongsReceived: 0,
      averageResponseTime: 0,
      responseTimes: [],
      healthChecks: []
    };
    
    this.pendingPings = new Map(); // Track pending ping requests
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
      const wsUrl = `${this.url}?token=${this.token}`;
      this.log('HEARTBEAT_CLIENT_CONNECTING', { url: wsUrl });

      this.ws = new WebSocket(wsUrl);
      let resolved = false;

      this.ws.on('open', () => {
        this.log('HEARTBEAT_CLIENT_CONNECTED');
        this.connectionHealth.isHealthy = true;
        
        // Start heartbeat and health monitoring
        this.startHeartbeat();
        this.startHealthMonitoring();
        
        if (!resolved) {
          resolved = true;
          resolve({ connected: true });
        }
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.log('HEARTBEAT_MESSAGE_PARSE_ERROR', { error: error.message });
        }
      });

      this.ws.on('close', (code, reason) => {
        this.log('HEARTBEAT_CLIENT_CLOSED', { code, reason: reason.toString() });
        this.connectionHealth.isHealthy = false;
        this.stopHeartbeat();
        this.stopHealthMonitoring();
      });

      this.ws.on('error', (error) => {
        this.log('HEARTBEAT_CLIENT_ERROR', { error: error.message });
        this.connectionHealth.isHealthy = false;
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  handleMessage(message) {
    const now = Date.now();
    
    if (message.type === 'pong') {
      this.handlePongResponse(message, now);
    } else {
      this.log('HEARTBEAT_OTHER_MESSAGE', { type: message.type });
    }
  }

  handlePongResponse(message, now) {
    const pingId = message.data?.pingId || message.data?.timestamp;
    
    if (pingId && this.pendingPings.has(pingId)) {
      const pingData = this.pendingPings.get(pingId);
      const responseTime = now - pingData.sentAt;
      
      this.connectionHealth.lastPongReceived = now;
      this.connectionHealth.totalPongsReceived++;
      this.connectionHealth.consecutiveFailures = 0; // Reset failure counter
      this.connectionHealth.responseTimes.push(responseTime);
      
      // Calculate moving average (last 10 responses)
      const recentTimes = this.connectionHealth.responseTimes.slice(-10);
      this.connectionHealth.averageResponseTime = 
        recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length;
      
      this.pendingPings.delete(pingId);
      
      this.log('PONG_RECEIVED', {
        pingId,
        responseTime,
        averageResponseTime: Math.round(this.connectionHealth.averageResponseTime),
        totalReceived: this.connectionHealth.totalPongsReceived
      });
      
    } else {
      this.log('PONG_RECEIVED_UNEXPECTED', { pingId, hasPending: this.pendingPings.size > 0 });
    }
  }

  sendPing(customData = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('PING_FAILED_NOT_CONNECTED');
      return false;
    }

    const now = Date.now();
    const pingId = `ping_${now}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pingData = {
      action: 'ping',
      data: {
        timestamp: now,
        pingId,
        heartbeat: true,
        ...customData
      }
    };

    // Track this ping
    this.pendingPings.set(pingId, { sentAt: now });
    this.connectionHealth.lastHeartbeatSent = now;
    this.connectionHealth.totalPingsSent++;

    this.ws.send(JSON.stringify(pingData));
    
    this.log('PING_SENT', {
      pingId,
      timestamp: now,
      pendingCount: this.pendingPings.size
    });

    // Set timeout for this ping
    setTimeout(() => {
      if (this.pendingPings.has(pingId)) {
        this.pendingPings.delete(pingId);
        this.connectionHealth.consecutiveFailures++;
        this.log('PING_TIMEOUT', { 
          pingId, 
          consecutiveFailures: this.connectionHealth.consecutiveFailures 
        });
      }
    }, this.options.responseTimeout);

    return true;
  }

  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.log('HEARTBEAT_STARTED', { interval: this.options.heartbeatInterval });
    
    this.heartbeatTimer = setInterval(() => {
      this.sendPing({ source: 'heartbeat_timer' });
    }, this.options.heartbeatInterval);

    // Send initial ping
    this.sendPing({ source: 'initial_heartbeat' });
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.log('HEARTBEAT_STOPPED');
    }
  }

  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.log('HEALTH_MONITORING_STARTED', { interval: this.options.healthCheckInterval });

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.log('HEALTH_MONITORING_STOPPED');
    }
  }

  performHealthCheck() {
    const now = Date.now();
    const timeSinceLastPong = this.connectionHealth.lastPongReceived 
      ? now - this.connectionHealth.lastPongReceived 
      : null;
    
    const isHealthy = this.connectionHealth.consecutiveFailures < 3 &&
                     this.ws && 
                     this.ws.readyState === WebSocket.OPEN &&
                     (timeSinceLastPong === null || timeSinceLastPong < (this.options.heartbeatInterval * 2));

    const healthCheck = {
      timestamp: now,
      isHealthy,
      consecutiveFailures: this.connectionHealth.consecutiveFailures,
      timeSinceLastPong,
      wsReadyState: this.ws ? this.ws.readyState : null,
      pendingPings: this.pendingPings.size
    };

    this.connectionHealth.healthChecks.push(healthCheck);
    this.connectionHealth.isHealthy = isHealthy;

    this.log('HEALTH_CHECK', healthCheck);

    // Trigger immediate ping if connection seems unhealthy
    if (!isHealthy && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendPing({ source: 'health_check_recovery' });
    }
  }

  getHealthReport() {
    const now = Date.now();
    const totalTime = this.connectionHealth.lastHeartbeatSent 
      ? now - (this.eventLog.find(e => e.event === 'HEARTBEAT_CLIENT_CONNECTED')?.timestamp || now)
      : 0;

    const successRate = this.connectionHealth.totalPingsSent > 0
      ? (this.connectionHealth.totalPongsReceived / this.connectionHealth.totalPingsSent) * 100
      : 0;

    return {
      isCurrentlyHealthy: this.connectionHealth.isHealthy,
      totalPingsSent: this.connectionHealth.totalPingsSent,
      totalPongsReceived: this.connectionHealth.totalPongsReceived,
      successRate: Math.round(successRate * 100) / 100,
      consecutiveFailures: this.connectionHealth.consecutiveFailures,
      averageResponseTime: Math.round(this.connectionHealth.averageResponseTime || 0),
      pendingPings: this.pendingPings.size,
      connectionUptime: totalTime,
      healthChecks: this.connectionHealth.healthChecks,
      responseTimes: this.connectionHealth.responseTimes,
      eventLog: this.eventLog
    };
  }

  close() {
    this.stopHeartbeat();
    this.stopHealthMonitoring();
    if (this.ws) {
      this.log('HEARTBEAT_CLIENT_CLOSING');
      this.ws.close(1000, 'Heartbeat test completed');
    }
  }
}

// Test Suite for Heartbeat and Health Monitoring
class HeartbeatTestSuite {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.results = [];
  }

  async runAllTests() {
    console.log('💓 Starting WebSocket Heartbeat & Health Monitoring Test Suite\n');

    await this.testBasicHeartbeat();
    await this.testHeartbeatFrequency();
    await this.testHealthMonitoring();
    await this.testResponseTimeTracking();
    await this.testFailureRecovery();

    return this.generateReport();
  }

  async testBasicHeartbeat() {
    console.log('🔄 Testing Basic Heartbeat Functionality...');

    try {
      const client = new HeartbeatTestClient(this.accessToken, {
        heartbeatInterval: 3000, // 3 seconds for testing
        healthCheckInterval: 2000,
        responseTimeout: 2000
      });

      await client.connect();

      // Wait for a few heartbeats
      await new Promise(resolve => setTimeout(resolve, 8000));

      const report = client.getHealthReport();
      const basicFunctionalityWorks = report.totalPingsSent >= 2 && 
                                     report.totalPongsReceived >= 1 &&
                                     report.successRate > 50;

      this.results.push({
        testName: 'Basic Heartbeat - Send/Receive',
        success: basicFunctionalityWorks,
        details: `Sent: ${report.totalPingsSent}, Received: ${report.totalPongsReceived}, Success Rate: ${report.successRate}%`,
        data: report
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Basic Heartbeat Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testHeartbeatFrequency() {
    console.log('⏱️  Testing Heartbeat Frequency and Timing...');

    try {
      const heartbeatInterval = 2000; // 2 seconds
      const client = new HeartbeatTestClient(this.accessToken, {
        heartbeatInterval,
        healthCheckInterval: 1000,
        responseTimeout: 1500
      });

      await client.connect();
      const startTime = Date.now();

      // Wait for multiple heartbeats
      await new Promise(resolve => setTimeout(resolve, 7000));

      const report = client.getHealthReport();
      const expectedPings = Math.floor(7000 / heartbeatInterval);
      const actualPings = report.totalPingsSent;
      const timingAccuracy = Math.abs(actualPings - expectedPings) <= 1; // Allow 1 ping variance

      this.results.push({
        testName: 'Heartbeat Frequency - Timing Accuracy',
        success: timingAccuracy && actualPings >= 2,
        details: `Expected: ~${expectedPings} pings, Actual: ${actualPings} pings`,
        data: { expectedPings, actualPings, timingAccuracy }
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Heartbeat Frequency Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testHealthMonitoring() {
    console.log('🏥 Testing Connection Health Monitoring...');

    try {
      const client = new HeartbeatTestClient(this.accessToken, {
        heartbeatInterval: 4000,
        healthCheckInterval: 1500,
        responseTimeout: 1000
      });

      await client.connect();

      // Wait for health checks to run
      await new Promise(resolve => setTimeout(resolve, 6000));

      const report = client.getHealthReport();
      const healthChecksPerformed = report.healthChecks.length >= 3;
      const healthStatusTracked = report.isCurrentlyHealthy !== undefined;

      this.results.push({
        testName: 'Health Monitoring - Status Tracking',
        success: healthChecksPerformed && healthStatusTracked,
        details: `Health checks: ${report.healthChecks.length}, Currently healthy: ${report.isCurrentlyHealthy}`,
        data: { healthChecksCount: report.healthChecks.length, isHealthy: report.isCurrentlyHealthy }
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Health Monitoring Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testResponseTimeTracking() {
    console.log('⏰ Testing Response Time Measurement...');

    try {
      const client = new HeartbeatTestClient(this.accessToken, {
        heartbeatInterval: 2000,
        responseTimeout: 3000
      });

      await client.connect();

      // Send several pings manually to get response time data
      for (let i = 0; i < 3; i++) {
        client.sendPing({ testPing: i + 1 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, 3000));

      const report = client.getHealthReport();
      const responseTimesRecorded = report.responseTimes.length > 0;
      const averageCalculated = report.averageResponseTime > 0;
      const reasonableResponseTimes = report.responseTimes.every(time => time < 5000); // Under 5 seconds

      this.results.push({
        testName: 'Response Time Tracking - Measurement Accuracy',
        success: responseTimesRecorded && averageCalculated && reasonableResponseTimes,
        details: `Response times recorded: ${report.responseTimes.length}, Average: ${report.averageResponseTime}ms`,
        data: { 
          responseTimes: report.responseTimes, 
          averageResponseTime: report.averageResponseTime,
          reasonableResponseTimes 
        }
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Response Time Tracking Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  async testFailureRecovery() {
    console.log('🔧 Testing Heartbeat Failure Detection and Recovery...');

    try {
      const client = new HeartbeatTestClient(this.accessToken, {
        heartbeatInterval: 2000,
        healthCheckInterval: 1000,
        responseTimeout: 500 // Very short timeout to simulate failures
      });

      await client.connect();
      
      // Let some pings timeout (due to short timeout)
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      const midReport = client.getHealthReport();
      const hasFailures = midReport.consecutiveFailures > 0;
      
      // Now increase timeout to allow recovery
      client.options.responseTimeout = 3000;
      
      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const finalReport = client.getHealthReport();
      const recovered = finalReport.totalPongsReceived > midReport.totalPongsReceived;

      this.results.push({
        testName: 'Failure Recovery - Detection and Recovery',
        success: hasFailures && recovered,
        details: `Initial failures: ${midReport.consecutiveFailures}, Final failures: ${finalReport.consecutiveFailures}, Recovered: ${recovered}`,
        data: { 
          initialFailures: midReport.consecutiveFailures, 
          finalFailures: finalReport.consecutiveFailures,
          totalPingsAtEnd: finalReport.totalPingsSent,
          totalPongsAtEnd: finalReport.totalPongsReceived,
          recovered
        }
      });

      client.close();

    } catch (error) {
      this.results.push({
        testName: 'Failure Recovery Test',
        success: false,
        details: error.message,
        data: { error: error.message }
      });
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('💓 WEBSOCKET HEARTBEAT & HEALTH MONITORING TEST REPORT');
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
    console.log(passedTests === totalTests ? '✅ ALL HEARTBEAT TESTS PASSED' : '❌ SOME HEARTBEAT TESTS FAILED');
    console.log('='.repeat(80));

    return passedTests === totalTests;
  }
}

// Main execution
async function main() {
  const accessToken = process.argv[2];

  if (!accessToken) {
    console.log('❌ Please provide an access token as argument');
    console.log('Usage: node test-websocket-heartbeat.js [ACCESS_TOKEN]');
    console.log('Get token by running: node test-auth.js');
    process.exit(1);
  }

  try {
    const testSuite = new HeartbeatTestSuite(accessToken);
    const allTestsPassed = await testSuite.runAllTests();

    process.exit(allTestsPassed ? 0 : 1);

  } catch (error) {
    console.error('❌ Heartbeat test suite execution failed:', error.message);
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  HeartbeatTestClient,
  HeartbeatTestSuite
};

// Run if called directly
if (require.main === module) {
  main();
}