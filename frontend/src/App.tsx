import { useState, useEffect } from 'react';
import './App.css';
import { getWebSocketClient, WebSocketClient } from './services/websocket';
import { TransactionFeed } from './components/TransactionFeed';
import { BudgetAlerts } from './components/BudgetAlerts';

function App() {
  const [webSocketClient, setWebSocketClient] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check for existing token in localStorage
    const savedToken = localStorage.getItem('budget_tracker_token');
    if (savedToken) {
      setAuthToken(savedToken);
      initializeWebSocket(savedToken);
    }
  }, []);

  const initializeWebSocket = async (token: string) => {
    try {
      setIsConnecting(true);
      setConnectionError(null);
      
      const client = getWebSocketClient(token);
      if (!client) {
        throw new Error('Failed to create WebSocket client');
      }

      // Listen for connection changes
      client.onConnectionChange((connected) => {
        setIsConnected(connected);
        setIsConnecting(false);
        
        if (!connected) {
          setConnectionError('Connection lost. Attempting to reconnect...');
        } else {
          setConnectionError(null);
        }
      });

      // Connect to WebSocket
      await client.connect();
      setWebSocketClient(client);
      
      // Save token to localStorage
      localStorage.setItem('budget_tracker_token', token);
      
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnecting(false);
    }
  };

  const handleConnect = () => {
    if (authToken.trim()) {
      initializeWebSocket(authToken.trim());
    }
  };

  const handleDisconnect = () => {
    if (webSocketClient) {
      webSocketClient.disconnect();
      setWebSocketClient(null);
      setIsConnected(false);
      setConnectionError(null);
      localStorage.removeItem('budget_tracker_token');
    }
  };

  const testConnection = () => {
    if (webSocketClient && isConnected) {
      webSocketClient.ping();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Personal Budget Tracker
          </h1>
          <p className="text-center text-gray-600 mt-2">
            Real-time financial monitoring with WebSocket integration
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Connection Panel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">WebSocket Connection</h2>
          
          {!webSocketClient ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="auth-token" className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Token
                </label>
                <div className="flex gap-2">
                  <input
                    id="auth-token"
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Enter your JWT token..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!authToken.trim() || isConnecting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
              
              {connectionError && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                  {connectionError}
                </div>
              )}
              
              <div className="text-sm text-gray-500">
                <p className="mb-2">To get a token for testing:</p>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                  cd backend && node test-auth.js
                </code>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">
                  {isConnected ? 'Connected to WebSocket' : 'Disconnected'}
                </span>
                {connectionError && (
                  <span className="text-red-600 text-sm">({connectionError})</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={testConnection}
                  disabled={!isConnected}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  Test Ping
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Dashboard */}
        {webSocketClient && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <TransactionFeed webSocketClient={webSocketClient} />
            <BudgetAlerts webSocketClient={webSocketClient} />
          </div>
        )}

        {/* Instructions */}
        {!webSocketClient && (
          <div className="bg-blue-50 rounded-lg p-6 mt-8">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">
              Getting Started
            </h3>
            <div className="text-blue-800 space-y-2">
              <p>1. Run the backend authentication test to get a JWT token:</p>
              <code className="block bg-blue-100 p-2 rounded text-sm font-mono">
                cd backend && node test-auth.js
              </code>
              
              <p>2. Copy the access token and paste it above to connect</p>
              
              <p>3. Once connected, you'll see real-time:</p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Transaction feeds as they happen</li>
                <li>Budget threshold alerts (80% warning, 100% exceeded)</li>
                <li>Live system notifications</li>
              </ul>
              
              <p>4. Test the system with backend operations:</p>
              <code className="block bg-blue-100 p-2 rounded text-sm font-mono">
                cd backend && node test-phase2.js [your-token]
              </code>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
