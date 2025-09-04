interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
  channel?: string;
}

interface ConnectionOptions {
  token: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

interface SubscriptionCallback {
  (message: WebSocketMessage): void;
}

interface ConnectionError {
  type: 'AUTH_FAILED' | 'NETWORK_ERROR' | 'SERVER_ERROR' | 'UNKNOWN';
  message: string;
  code?: number;
  retryable: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private heartbeatInterval: number;
  private reconnectAttempts: number = 0;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private isIntentionallyClosed: boolean = false;
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private subscribedChannels: Set<string> = new Set();
  private connectionListeners: Set<(state: ConnectionState, error?: ConnectionError) => void> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongReceived: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: ConnectionOptions) {
    this.token = options.token;
    this.url = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
  }

  private updateConnectionState(state: ConnectionState, error?: ConnectionError) {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.notifyConnectionListeners(state, error);
    }
  }

  private createConnectionError(type: ConnectionError['type'], message: string, code?: number): ConnectionError {
    return {
      type,
      message,
      code,
      retryable: type !== 'AUTH_FAILED'
    };
  }

  private parseWebSocketError(event: Event, code?: number): ConnectionError {
    if (code === 4001 || code === 401) {
      return this.createConnectionError('AUTH_FAILED', 'Authentication failed. Please refresh your token.', code);
    } else if (code === 4000 || (code && code >= 4000 && code < 5000)) {
      return this.createConnectionError('SERVER_ERROR', 'Server error. Please try again later.', code);
    } else if (!navigator.onLine) {
      return this.createConnectionError('NETWORK_ERROR', 'No internet connection.', code);
    } else {
      return this.createConnectionError('NETWORK_ERROR', 'Connection failed. Check your internet connection.', code);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === ConnectionState.CONNECTING || 
          this.connectionState === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.updateConnectionState(ConnectionState.CONNECTING);
      this.isIntentionallyClosed = false;
      this.clearTimers();

      try {
        const wsUrl = `${this.url}?token=${this.token}`;
        console.log('🔌 Connecting to WebSocket...');
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          this.reconnectAttempts = 0;
          this.updateConnectionState(ConnectionState.CONNECTED);
          this.startHeartbeat();
          
          // Re-subscribe to channels if any
          if (this.subscribedChannels.size > 0) {
            this.subscribeToChannels(Array.from(this.subscribedChannels));
          }
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`🔌 WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
          this.clearTimers();
          
          const error = this.parseWebSocketError(event, event.code);
          
          if (!this.isIntentionallyClosed && error.retryable && 
              this.reconnectAttempts < this.maxReconnectAttempts) {
            this.updateConnectionState(ConnectionState.RECONNECTING, error);
            this.attemptReconnect();
          } else {
            this.updateConnectionState(
              error.retryable ? ConnectionState.DISCONNECTED : ConnectionState.FAILED, 
              error
            );
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          const connectionError = this.parseWebSocketError(error);
          
          if (this.reconnectAttempts === 0) {
            this.updateConnectionState(ConnectionState.FAILED, connectionError);
            reject(connectionError);
          }
        };

      } catch (error) {
        const connectionError = this.createConnectionError('UNKNOWN', 
          error instanceof Error ? error.message : 'Failed to create WebSocket connection');
        this.updateConnectionState(ConnectionState.FAILED, connectionError);
        reject(connectionError);
      }
    });
  }

  private attemptReconnect() {
    this.reconnectAttempts++;
    console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
    
    // Exponential backoff with jitter
    const baseDelay = this.reconnectInterval;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const finalDelay = Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        console.error('❌ Reconnection failed:', error);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.updateConnectionState(ConnectionState.FAILED, 
            this.createConnectionError('NETWORK_ERROR', 'Maximum reconnection attempts exceeded'));
        }
      });
    }, finalDelay);
  }

  private startHeartbeat() {
    this.lastPongReceived = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPongReceived;
        if (timeSinceLastPong > this.heartbeatInterval * 2) {
          console.warn('⚠️ WebSocket heartbeat timeout - connection may be stale');
          this.ws.close(1000, 'Heartbeat timeout');
          return;
        }
        
        // Send ping
        this.ping();
      }
    }, this.heartbeatInterval);
  }

  private clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('📨 Received WebSocket message:', message);

    // Handle different message types
    switch (message.type) {
      case 'pong':
        this.lastPongReceived = Date.now();
        this.notifySubscribers('ping', message);
        break;
      case 'subscription_confirmed':
        this.notifySubscribers('subscription', message);
        break;
      case 'live_data_response':
        this.notifySubscribers('live_data', message);
        break;
      case 'transaction_created':
      case 'transaction_updated':
      case 'transaction_deleted':
        this.notifySubscribers('transaction', message);
        break;
      case 'budget_threshold_alert':
        this.notifySubscribers('budget_alert', message);
        break;
      case 'broadcast':
        if (message.channel) {
          this.notifySubscribers(message.channel, message);
        }
        break;
      case 'error':
        this.notifySubscribers('error', message);
        break;
      default:
        console.log('📋 Unhandled message type:', message.type);
        this.notifySubscribers('unknown', message);
    }
  }

  private notifySubscribers(eventType: string, message: WebSocketMessage) {
    const subscribers = this.subscriptions.get(eventType);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error('❌ Error in subscription callback:', error);
        }
      });
    }
  }

  private notifyConnectionListeners(state: ConnectionState, error?: ConnectionError) {
    this.connectionListeners.forEach(callback => {
      try {
        callback(state, error);
      } catch (error) {
        console.error('❌ Error in connection listener:', error);
      }
    });
  }

  // Public methods
  subscribe(eventType: string, callback: SubscriptionCallback) {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(callback);

    return () => {
      this.unsubscribe(eventType, callback);
    };
  }

  unsubscribe(eventType: string, callback: SubscriptionCallback) {
    const subscribers = this.subscriptions.get(eventType);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscriptions.delete(eventType);
      }
    }
  }

  onConnectionChange(callback: (state: ConnectionState, error?: ConnectionError) => void) {
    this.connectionListeners.add(callback);
    
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  isConnecting(): boolean {
    return this.connectionState === ConnectionState.CONNECTING;
  }

  isReconnecting(): boolean {
    return this.connectionState === ConnectionState.RECONNECTING;
  }

  subscribeToChannels(channels: string[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        action: 'subscribe',
        data: { channels }
      });
      channels.forEach(channel => this.subscribedChannels.add(channel));
    } else {
      console.warn('⚠️ Cannot subscribe - WebSocket not connected');
    }
  }

  unsubscribeFromChannels(channels: string[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        action: 'unsubscribe', 
        data: { channels }
      });
      channels.forEach(channel => this.subscribedChannels.delete(channel));
    }
  }

  requestLiveData(dataType: string) {
    this.send({
      action: 'get_live_data',
      data: { dataType }
    });
  }

  ping() {
    this.send({
      action: 'ping',
      data: { message: 'Frontend ping' }
    });
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ Cannot send message - WebSocket not connected');
    }
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    this.reconnectAttempts = this.maxReconnectAttempts;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.subscriptions.clear();
    this.subscribedChannels.clear();
    this.connectionListeners.clear();
  }

  isConnected(): boolean {
    return this.ws ? this.ws.readyState === WebSocket.OPEN : false;
  }
}

// Singleton instance
let webSocketClient: WebSocketClient | null = null;

export const getWebSocketClient = (token?: string): WebSocketClient | null => {
  if (!webSocketClient && token) {
    webSocketClient = new WebSocketClient({ token });
  }
  return webSocketClient;
};

export const disconnectWebSocket = () => {
  if (webSocketClient) {
    webSocketClient.disconnect();
    webSocketClient = null;
  }
};