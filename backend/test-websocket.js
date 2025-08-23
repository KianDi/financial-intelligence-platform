const WebSocket = require('ws');

// Configuration
const WEBSOCKET_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';

// Use the access token from test-auth.js output
const ACCESS_TOKEN = process.argv[2];

if (!ACCESS_TOKEN) {
  console.log('Usage: node test-websocket.js <ACCESS_TOKEN>');
  console.log('\nTo get an access token, run: node test-auth.js');
  process.exit(1);
}

console.log('=== WebSocket Connection Test ===\n');

async function testWebSocketConnection() {
  try {
    // Connect to WebSocket with JWT token in query parameter
    const wsUrl = `${WEBSOCKET_URL}?token=${ACCESS_TOKEN}`;
    console.log('Connecting to:', wsUrl.replace(ACCESS_TOKEN, '[TOKEN]'));
    
    const ws = new WebSocket(wsUrl);

    // Connection opened
    ws.on('open', () => {
      console.log('✅ WebSocket connection established!');
      console.log('Connection ID will be logged by the server\n');
      
      // Test 1: Ping/Pong
      console.log('Test 1: Sending ping...');
      ws.send(JSON.stringify({
        action: 'ping',
        data: { message: 'Hello WebSocket!' }
      }));
      
      // Test 2: Subscribe to channels
      setTimeout(() => {
        console.log('\nTest 2: Subscribing to channels...');
        ws.send(JSON.stringify({
          action: 'subscribe',
          data: { 
            channels: ['transactions', 'budgets', 'notifications'] 
          }
        }));
      }, 1000);
      
      // Test 3: Request live data
      setTimeout(() => {
        console.log('\nTest 3: Requesting live transaction data...');
        ws.send(JSON.stringify({
          action: 'get_live_data',
          data: { dataType: 'recent_transactions' }
        }));
      }, 2000);
      
      // Test 4: Request budget status
      setTimeout(() => {
        console.log('\nTest 4: Requesting budget status...');
        ws.send(JSON.stringify({
          action: 'get_live_data',
          data: { dataType: 'budget_status' }
        }));
      }, 3000);
      
      // Test 5: Test unknown action
      setTimeout(() => {
        console.log('\nTest 5: Testing error handling with unknown action...');
        ws.send(JSON.stringify({
          action: 'unknown_action',
          data: { test: true }
        }));
      }, 4000);
      
      // Close connection after tests
      setTimeout(() => {
        console.log('\n=== Closing connection ===');
        ws.close();
      }, 6000);
    });

    // Message received
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received message:');
        console.log('   Type:', message.type);
        console.log('   Data:', JSON.stringify(message, null, 2));
        console.log('');
      } catch (error) {
        console.log('📨 Received raw message:', data.toString());
      }
    });

    // Connection closed
    ws.on('close', (code, reason) => {
      console.log(`🔌 Connection closed. Code: ${code}, Reason: ${reason.toString()}`);
      console.log('Test complete!');
    });

    // Error occurred
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testWebSocketConnection();