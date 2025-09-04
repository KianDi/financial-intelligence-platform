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
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private isIntentionallyClosed: boolean = false;
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private subscribedChannels: Set<string> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  constructor(options: ConnectionOptions) {
    this.token = options.token;
    this.url = 'wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev';
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this.isIntentionallyClosed = false;

      try {
        const wsUrl = `${this.url}?token=${this.token}`;
        console.log('🔌 Connecting to WebSocket...');
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.notifyConnectionListeners(true);
          
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
          this.isConnecting = false;
          this.notifyConnectionListeners(false);
          
          if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.isConnecting = false;
          
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    this.reconnectAttempts++;
    console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
    
    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('❌ Reconnection failed:', error);
      });
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('📨 Received WebSocket message:', message);

    // Handle different message types
    switch (message.type) {
      case 'pong':
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

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected);
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

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionListeners.add(callback);
    
    return () => {
      this.connectionListeners.delete(callback);
    };
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