const axios = require('axios');
const WebSocket = require('ws');

const API_BASE_URL = 'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com';
const WS_BASE_URL = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';

// Use the token from test-auth.js
const ACCESS_TOKEN = 'eyJraWQiOiJBQjNwT2JZcEl0R0I4UEhzclVTK2Q0VWl1VGJPZEV0eWtxVGlvSGlvZ2pjPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJlNDU4MDQ1OC05MDAxLTcwMzMtZjA1Yy1hYjkwMDA2NDZmMTYiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9iRk93RnNJZFYiLCJjbGllbnRfaWQiOiI1dnNxZ2hpaGtqcWdtaGdxbjZjNmRnb21laSIsIm9yaWdpbl9qdGkiOiJjZjIwNzI4Mi00NGNhLTQ5NDgtYTJhOS01YTE4YmQzMzkwMmMiLCJldmVudF9pZCI6IjVmYjI5OWJmLWQyNmQtNDU1Yy05M2UxLWVjMmVmYzliMmZhYiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3NTY5NjAxOTAsImV4cCI6MTc1Njk2Mzc5MCwiaWF0IjoxNTY5NjAxOTAsImp0aSI6IjAzNDUxZmE4LTkwYmYtNDViNy04MzgzLTBhZWNiNWQxZTFlMyIsInVzZXJuYW1lIjoiZTQ1ODA0NTgtOTAwMS03MDMzLWYwNWMtYWI5MDAwNjQ2ZjE2In0.NWEAfCHB_ItTY7hDK7RqAZ_-liJySR-z0Qcm-5bgNJjHXDb9lMZ605b1r_gMlIEyMSyxUHf9JSPkpMMrBKFgycnNhm-JnXCNQzfbR-Ofe2U0PO1yYjTERhlwkGoHFGByghmIuQ61rv0VRz-Msadc2LSPKDwkCHZo44TvScPZMpRW3V4nnvFLbZ1UEq7uwll6EfuEDiuZZWLO1XNm5Mof73j-EkFU9YisZR9NozOL1XPZuafkX-FqdEasob-U-enDAumlxGTZLk-SJhVr-QEuD4WctBN7mOcA6QcRiQ0E9HxQY9cgfm4NuYsFelPUWdHLxEik43newL8i1r_iwa2uRA';

async function testWebSocketFlow() {
    console.log('🔌 Testing WebSocket Live Updates Flow\n');

    // Step 1: Connect to WebSocket
    console.log('Step 1: Connecting to WebSocket...');
    const wsUrl = `${WS_BASE_URL}?token=${ACCESS_TOKEN}`;
    const ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
        let messages = [];
        let connected = false;

        ws.on('open', () => {
            console.log('✅ WebSocket connected');
            connected = true;

            // Step 2: Subscribe to channels
            console.log('Step 2: Subscribing to channels...');
            ws.send(JSON.stringify({
                action: 'subscribe',
                data: { channels: ['transactions', 'budgets', 'notifications'] }
            }));

            // Step 3: Request live data
            setTimeout(() => {
                console.log('Step 3: Requesting live transaction data...');
                ws.send(JSON.stringify({
                    action: 'get_live_data',
                    data: { dataType: 'recent_transactions' }
                }));
            }, 500);

            // Step 4: Create a transaction to trigger events
            setTimeout(async () => {
                console.log('Step 4: Creating transaction to trigger events...');
                
                try {
                    const response = await axios.post(`${API_BASE_URL}/transactions`, {
                        amount: 55.99,
                        category: 'food',
                        description: 'WebSocket Test Transaction',
                        type: 'expense'
                    }, {
                        headers: {
                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log('✅ Transaction created:', response.data.transaction.transactionId);
                    
                } catch (error) {
                    console.error('❌ Failed to create transaction:', error.response?.data || error.message);
                }
            }, 1000);

            // Step 5: Wait and collect messages
            setTimeout(() => {
                console.log('\n📊 Messages received from WebSocket:');
                messages.forEach((msg, index) => {
                    console.log(`${index + 1}. ${JSON.stringify(msg, null, 2)}`);
                });
                
                if (messages.length === 0) {
                    console.log('❌ No messages received - this indicates an issue');
                }

                ws.close();
                resolve(messages);
            }, 5000);
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 WebSocket message received:', message.type || 'unknown');
                messages.push(message);
            } catch (error) {
                console.error('❌ Failed to parse message:', error);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            if (!connected) {
                reject(error);
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
        });
    });
}

// Run the test
testWebSocketFlow().then((messages) => {
    console.log(`\n✅ Test completed. Received ${messages.length} messages.`);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
});