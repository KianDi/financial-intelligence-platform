import { useState, useEffect } from 'react';
import { WebSocketClient } from '../services/websocket';

interface Transaction {
  transactionId: string;
  amount: number;
  category: string;
  description: string;
  timestamp: string;
}

interface TransactionFeedProps {
  webSocketClient: WebSocketClient | null;
  maxItems?: number;
}

export const TransactionFeed = ({ webSocketClient, maxItems = 10 }: TransactionFeedProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!webSocketClient) return;

    // Listen for connection changes
    const unsubscribeConnection = webSocketClient.onConnectionChange((connected) => {
      setIsConnected(connected);
      
      if (connected) {
        // Request live transaction data on connection
        webSocketClient.requestLiveData('recent_transactions');
        
        // Subscribe to transaction channels
        webSocketClient.subscribeToChannels(['transactions']);
      }
    });

    // Subscribe to transaction events
    const unsubscribeTransactions = webSocketClient.subscribe('transaction', (message) => {
      console.log('📊 Transaction event received:', message);
      
      switch (message.type) {
        case 'transaction_created':
          handleTransactionCreated(message.data);
          break;
        case 'transaction_updated':
          handleTransactionUpdated(message.data);
          break;
        case 'transaction_deleted':
          handleTransactionDeleted(message.data);
          break;
      }
    });

    // Subscribe to live data responses
    const unsubscribeLiveData = webSocketClient.subscribe('live_data', (message) => {
      if (message.data?.dataType === 'recent_transactions') {
        console.log('📋 Live transaction data received:', message.data);
        setTransactions(message.data.transactions || []);
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeTransactions();
      unsubscribeLiveData();
    };
  }, [webSocketClient]);

  const handleTransactionCreated = (data: any) => {
    console.log('Processing transaction created:', data);
    
    const newTransaction: Transaction = {
      transactionId: data.transactionId,
      amount: data.amount,
      category: data.category,
      description: data.description,
      timestamp: data.timestamp
    };

    setTransactions(prev => {
      // Check if transaction already exists to prevent duplicates
      const exists = prev.some(t => t.transactionId === newTransaction.transactionId);
      if (exists) {
        console.log('Transaction already exists, skipping:', newTransaction.transactionId);
        return prev;
      }
      
      const updated = [newTransaction, ...prev];
      return updated.slice(0, maxItems);
    });
  };

  const handleTransactionUpdated = (data: any) => {
    const updatedTransaction = data.updatedTransaction;
    
    setTransactions(prev => 
      prev.map(transaction => 
        transaction.transactionId === updatedTransaction.transactionId
          ? updatedTransaction
          : transaction
      )
    );
  };

  const handleTransactionDeleted = (data: any) => {
    setTransactions(prev => 
      prev.filter(transaction => 
        transaction.transactionId !== data.transactionId
      )
    );
  };

  const formatAmount = (amount: number) => {
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    return {
      formatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(absAmount),
      isNegative
    };
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Recent Transactions
        </h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-500">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {isConnected ? 'No recent transactions' : 'Connecting to live feed...'}
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((transaction) => {
            const { formatted: amount, isNegative } = formatAmount(transaction.amount);
            
            return (
              <div
                key={transaction.transactionId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {transaction.description}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {transaction.category}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {formatTime(transaction.timestamp)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                    {isNegative ? '-' : '+'}{amount}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};