const WebSocket = require('ws');
const axios = require('axios');

// Configuration
const WEBSOCKET_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';
const API_BASE_URL = 'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com';

const ACCESS_TOKEN = process.argv[2];

if (!ACCESS_TOKEN) {
  console.log('Usage: node test-realtime-flow.js <ACCESS_TOKEN>');
  console.log('Get token from: node test-auth.js');
  process.exit(1);
}

console.log('=== Real-time WebSocket Flow Test ===\n');

let ws;
let receivedMessages = [];

async function testRealTimeFlow() {
  console.log('Step 1: Connecting to WebSocket...');
  
  const wsUrl = `${WEBSOCKET_URL}?token=${ACCESS_TOKEN}`;
  ws = new WebSocket(wsUrl);

  return new Promise((resolve, reject) => {
    
    ws.on('open', async () => {
      console.log('✅ WebSocket connected!');
      
      // Subscribe to all channels
      console.log('Step 2: Subscribing to channels...');
      ws.send(JSON.stringify({
        action: 'subscribe',
        data: { channels: ['transactions', 'budgets', 'notifications'] }
      }));
      
      // Wait for subscription confirmation
      setTimeout(async () => {
        console.log('Step 3: Creating transaction to test real-time flow...\n');
        
        try {
          const headers = {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          };
          
          const testTransaction = {
            amount: 89.99,
            category: 'realtime_test',
            description: `Real-time flow test - ${new Date().toLocaleTimeString()}`,
            type: 'expense',
          };
          
          console.log('🔄 Creating transaction:', testTransaction);
          
          const response = await axios.post(
            `${API_BASE_URL}/transactions`,
            testTransaction,
            { headers }
          );
          
          console.log('✅ Transaction created:', {
            id: response.data.transaction.transactionId,
            amount: response.data.transaction.amount
          });
          
          console.log('\n📡 Listening for WebSocket notifications...');
          console.log('Expected: transaction_created event should arrive within 5-10 seconds\n');
          
          // Wait 15 seconds for notifications
          setTimeout(() => {
            console.log('=== Test Results ===');
            console.log(`Total WebSocket messages received: ${receivedMessages.length}`);
            
            if (receivedMessages.length > 0) {
              console.log('\n📨 Messages received:');
              receivedMessages.forEach((msg, index) => {
                console.log(`${index + 1}. Type: ${msg.type}`);
                if (msg.type === 'transaction_created') {
                  console.log('   ✅ REAL-TIME TRANSACTION NOTIFICATION RECEIVED!');
                  console.log('   📊 Data:', JSON.stringify(msg.data, null, 6));
                }
              });
            } else {
              console.log('❌ No WebSocket messages received');
              console.log('\n🔍 Possible issues:');
              console.log('   1. EventBridge → Lambda trigger not working');
              console.log('   2. budgetCalculator not processing events');
              console.log('   3. WebSocket connection not stored in DynamoDB');
              console.log('   4. WebSocket broadcast function failing');
            }
            
            ws.close();
            resolve();
          }, 15000);
          
        } catch (error) {
          console.error('❌ Failed to create transaction:', error.response?.data || error.message);
          ws.close();
          reject(error);
        }
      }, 3000);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 [${new Date().toLocaleTimeString()}] WebSocket message:`, message.type);
        
        receivedMessages.push(message);
        
        if (message.type === 'transaction_created') {
          console.log('🎉 REAL-TIME NOTIFICATION RECEIVED!');
          console.log('📊 Transaction data:', JSON.stringify(message.data, null, 2));
        }
        
      } catch (error) {
        console.log('📨 Raw message:', data.toString());
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`\n🔌 WebSocket closed. Code: ${code}`);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      reject(error);
    });
  });
}

// Run the test
testRealTimeFlow().catch(console.error);