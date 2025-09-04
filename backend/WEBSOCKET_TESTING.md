# WebSocket Testing Suite

This directory contains comprehensive testing tools for the WebSocket real-time communication system in the Financial Intelligence Platform.

## Quick Start

```bash
# Get authentication token
node test-auth.js

# Run basic WebSocket connectivity test
node test-websocket-suite.js [TOKEN] basic

# Run comprehensive test suite
node test-websocket-suite.js [TOKEN] integration

# Run all tests
node test-websocket-suite.js [TOKEN] all
```

## Test Files Overview

### Core Test Files

| File | Purpose | Scope |
|------|---------|-------|
| `test-websocket-flow.js` | Basic connection and message flow | Essential connectivity |
| `test-websocket-comprehensive.js` | Full functionality test suite | All WebSocket features |
| `test-websocket-resilience.js` | Error handling and reconnection | Network resilience |
| `test-websocket-heartbeat.js` | Connection health monitoring | Heartbeat mechanism |
| `test-websocket-integration.js` | Orchestrates all test suites | Integration testing |
| `test-websocket-suite.js` | **Main test runner** | Unified test interface |

### Test Architecture

```
test-websocket-suite.js (Main Runner)
├── basic → test-websocket-flow.js
├── comprehensive → test-websocket-comprehensive.js  
├── resilience → test-websocket-resilience.js
├── heartbeat → test-websocket-heartbeat.js
└── integration → test-websocket-integration.js
                 └── Runs comprehensive + resilience + heartbeat
```

## Available Test Commands

### Individual Test Suites

```bash
# Basic connectivity (30 seconds)
node test-websocket-suite.js [TOKEN] basic

# Complete functionality tests (2-3 minutes)  
node test-websocket-suite.js [TOKEN] comprehensive

# Network resilience and reconnection (1-2 minutes)
node test-websocket-suite.js [TOKEN] resilience

# Heartbeat and health monitoring (1-2 minutes)
node test-websocket-suite.js [TOKEN] heartbeat

# Integrated test runner (4-6 minutes)
node test-websocket-suite.js [TOKEN] integration
```

### Batch Test Commands

```bash
# Run all tests sequentially (6-8 minutes)
node test-websocket-suite.js [TOKEN] all

# Quick tests only (1-2 minutes) - good for CI/CD
node test-websocket-suite.js [TOKEN] quick

# CI-friendly with proper exit codes
node test-websocket-suite.js [TOKEN] ci
```

## Test Coverage

### 🔌 Basic Connectivity (`test-websocket-flow.js`)
- WebSocket connection establishment
- JWT authentication validation
- Channel subscription (transactions, budgets, notifications)
- Live data requests
- Transaction creation triggers live updates

### 🧪 Comprehensive Testing (`test-websocket-comprehensive.js`)
- **Connection Management**: Establishment, authentication, cleanup
- **Message Flow**: Send/receive, parsing, error handling
- **Subscription System**: Subscribe/unsubscribe to channels
- **Live Data**: Recent transactions, budget status, household activity
- **Real-time Events**: Transaction broadcasts, budget alerts
- **Integration**: REST API + WebSocket coordination

### 🛡️ Resilience Testing (`test-websocket-resilience.js`)
- **Basic Resilience**: Connection recovery after disruption
- **Exponential Backoff**: Reconnection timing validation
- **Network Disruption**: Simulated connection failures
- **Error Recovery**: Invalid tokens, auth failures, connection limits
- **Resource Management**: Concurrent connections, cleanup

### 💓 Heartbeat Testing (`test-websocket-heartbeat.js`)
- **Ping/Pong Mechanism**: Send pings, receive pongs
- **Response Time Tracking**: Latency measurement and averaging
- **Health Monitoring**: Connection health assessment
- **Failure Detection**: Missed pongs, consecutive failures
- **Recovery Testing**: Health check recovery after failures

## Integration with Existing Tests

### Current Test Workflow

```bash
# Phase 2 Tests (EventBridge + REST API)
node test-phase2.js [TOKEN]

# WebSocket Tests (Real-time Communication)
node test-websocket-suite.js [TOKEN] integration

# Authentication Setup
node test-auth.js
```

### Recommended Test Sequence

```bash
# 1. Get authentication token
TOKEN=$(node test-auth.js | grep "Access Token:" | cut -d' ' -f3)

# 2. Run Phase 2 tests (REST API + EventBridge)
node test-phase2.js $TOKEN

# 3. Run WebSocket integration tests
node test-websocket-suite.js $TOKEN integration

# 4. Optional: Run all WebSocket tests
node test-websocket-suite.js $TOKEN all
```

## Test Results and Exit Codes

All test files follow consistent patterns:

- **Exit Code 0**: All tests passed
- **Exit Code 1**: Some tests failed or error occurred
- **Detailed Reports**: Every test suite provides comprehensive result summaries

### Example Success Output

```
✅ ALL WEBSOCKET TESTS PASSED
📊 OVERALL RESULTS:
   Total Tests Executed: 25
   Tests Passed: 25
   Tests Failed: 0
   Success Rate: 100.0%
   Total Execution Time: 45230ms
```

## Debugging Failed Tests

### Common Issues and Solutions

1. **Connection Authentication Failures**
   ```bash
   # Regenerate fresh token
   node test-auth.js
   
   # Check token validity
   node test-websocket-suite.js [TOKEN] basic
   ```

2. **WebSocket Endpoint Issues**
   - Verify `WS_BASE_URL` in test files matches deployed WebSocket API
   - Check AWS API Gateway WebSocket API deployment status

3. **EventBridge Integration Problems**
   ```bash
   # First run Phase 2 tests to validate EventBridge
   node test-phase2.js [TOKEN]
   ```

4. **IAM Permission Issues**
   - Review CloudWatch logs for Lambda function errors
   - Verify DynamoDB permissions for WebSocket connection management

### Debug Mode

Enable verbose logging by modifying test files:

```javascript
// Add to any test file for detailed logging
const DEBUG = true;
if (DEBUG) console.log('Detailed debug info:', data);
```

## CI/CD Integration

### Quick CI Tests (1-2 minutes)

```bash
# In CI pipeline
node test-websocket-suite.js $ACCESS_TOKEN ci
```

### Full Test Suite (6-8 minutes)

```bash
# For comprehensive validation
node test-websocket-suite.js $ACCESS_TOKEN all
```

### GitHub Actions Example

```yaml
- name: Test WebSocket Integration
  run: |
    TOKEN=$(node test-auth.js | grep "Access Token:" | cut -d' ' -f3)
    node test-websocket-suite.js $TOKEN ci
```

## Monitoring and Maintenance

### Regular Test Schedule

- **Pre-deployment**: `node test-websocket-suite.js [TOKEN] integration`
- **Post-deployment**: `node test-websocket-suite.js [TOKEN] quick`
- **Weekly**: `node test-websocket-suite.js [TOKEN] all`

### Performance Benchmarks

| Test Suite | Expected Duration | Test Count |
|------------|------------------|------------|
| Basic | 30-60 seconds | 1 test |
| Comprehensive | 2-3 minutes | 8 tests |
| Resilience | 1-2 minutes | 5 tests |
| Heartbeat | 1-2 minutes | 5 tests |
| Integration | 4-6 minutes | 18+ tests |
| All | 6-8 minutes | 19+ tests |

## Next Steps

After WebSocket testing is complete and passing:

1. **Frontend Integration**: Connect React components to WebSocket API
2. **Real-time UI**: Implement live transaction feeds and budget alerts
3. **Household Features**: Multi-user real-time collaboration
4. **Production Monitoring**: Set up CloudWatch metrics for WebSocket connections
5. **Performance Optimization**: Connection pooling and message batching

---

**Last Updated**: January 2025  
**WebSocket API Endpoint**: `wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev`  
**Authentication**: JWT via Cognito User Pool