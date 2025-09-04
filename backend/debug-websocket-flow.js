const WebSocket = require('ws');
const axios = require('axios');

// Configuration
const WEBSOCKET_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';
const API_BASE_URL = 'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com';

const ACCESS_TOKEN = process.argv[2];

if (!ACCESS_TOKEN) {
  console.log('Usage: node debug-websocket-flow.js <ACCESS_TOKEN>');
  process.exit(1);
}

console.log('=== WebSocket + Transaction Flow Debug ===\n');

async function debugWebSocketFlow() {
  // Step 1: Connect to WebSocket
  const wsUrl = `${WEBSOCKET_URL}?token=${ACCESS_TOKEN}`;
  console.log('1. Connecting to WebSocket...');
  
  const ws = new WebSocket(wsUrl);
  
  let connected = false;
  
  ws.on('open', async () => {
    console.log('✅ WebSocket connected!');
    connected = true;
    
    // Step 2: Subscribe to channels
    console.log('2. Subscribing to transaction channels...');
    ws.send(JSON.stringify({
      action: 'subscribe',
      data: { channels: ['transactions', 'budgets', 'notifications'] }
    }));
    
    // Wait a moment for subscription to complete
    setTimeout(async () => {
      console.log('\n3. Creating a test transaction...');
      
      // Step 3: Create a transaction via REST API
      try {
        const headers = {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        };
        
        const newTransaction = {
          amount: 75.99,
          category: 'websocket_test',
          description: 'Real-time WebSocket flow test',
          type: 'expense',
        };
        
        const response = await axios.post(
          `${API_BASE_URL}/transactions`,
          newTransaction,
          { headers }
        );
        
        console.log('✅ Transaction created:', {
          transactionId: response.data.transaction.transactionId,
          amount: response.data.transaction.amount,
          description: response.data.transaction.description
        });
        
        console.log('\n4. Waiting for WebSocket notifications...');
        
      } catch (error) {
        console.error('❌ Failed to create transaction:', error.response?.data || error.message);
      }
    }, 2000);
    
    // Close connection after 10 seconds
    setTimeout(() => {
      console.log('\n=== Closing WebSocket connection ===');
      ws.close();
    }, 10000);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket Message Received:');
      console.log('   Type:', message.type);
      console.log('   Data:', JSON.stringify(message, null, 2));
      console.log('');
      
      // Log specific transaction events
      if (message.type === 'transaction_created') {
        console.log('🎯 TRANSACTION CREATED EVENT DETECTED!');
        console.log('   This should appear in your frontend!');
      }
      
    } catch (error) {
      console.log('📨 Raw message:', data.toString());
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
}

debugWebSocketFlow();