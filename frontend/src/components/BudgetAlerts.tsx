import { useState, useEffect } from 'react';
import { WebSocketClient, ConnectionState } from '../services/websocket';

interface BudgetAlert {
  id: string;
  budgetId: string;
  category: string;
  currentAmount: number;
  budgetLimit: number;
  utilizationPercentage: number;
  thresholdType: 'warning' | 'exceeded';
  severity: 'medium' | 'high';
  timestamp: string;
}

interface BudgetAlertsProps {
  webSocketClient: WebSocketClient | null;
  maxAlerts?: number;
}

export const BudgetAlerts = ({ webSocketClient, maxAlerts = 5 }: BudgetAlertsProps) => {
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);

  useEffect(() => {
    if (!webSocketClient) return;

    // Listen for connection changes
    const unsubscribeConnection = webSocketClient.onConnectionChange((connected) => {
      setIsConnected(connected);
      
      if (connected) {
        // Request current budget status
        webSocketClient.requestLiveData('budget_status');
        
        // Subscribe to budget alert channels
        webSocketClient.subscribeToChannels(['budgets', 'notifications']);
      }
    });

    // Subscribe to budget alert events
    const unsubscribeBudgetAlerts = webSocketClient.subscribe('budget_alert', (message) => {
      console.log('🚨 Budget alert received:', message);
      
      if (message.type === 'budget_threshold_alert') {
        handleBudgetAlert(message.data);
      }
    });

    // Subscribe to live data responses for budget status
    const unsubscribeLiveData = webSocketClient.subscribe('live_data', (message) => {
      if (message.data?.dataType === 'budget_status') {
        console.log('📊 Budget status received:', message.data);
        // Handle existing budget alerts if any
        if (message.data.alerts) {
          setAlerts(message.data.alerts.slice(0, maxAlerts));
        }
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeBudgetAlerts();
      unsubscribeLiveData();
    };
  }, [webSocketClient, maxAlerts]);

  const handleBudgetAlert = (data: any) => {
    const newAlert: BudgetAlert = {
      id: `${data.budgetId}-${Date.now()}`,
      budgetId: data.budgetId,
      category: data.category,
      currentAmount: data.currentAmount,
      budgetLimit: data.budgetLimit,
      utilizationPercentage: data.utilizationPercentage,
      thresholdType: data.thresholdType,
      severity: data.severity,
      timestamp: new Date().toISOString()
    };

    setAlerts(prev => {
      // Remove any existing alert for the same budget to avoid duplicates
      const filtered = prev.filter(alert => alert.budgetId !== data.budgetId);
      const updated = [newAlert, ...filtered];
      return updated.slice(0, maxAlerts);
    });
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getAlertIcon = (severity: string, thresholdType: string) => {
    if (thresholdType === 'exceeded') {
      return '🚨'; // Red alert
    } else {
      return '⚠️'; // Warning
    }
  };

  const getAlertColor = (severity: string, thresholdType: string) => {
    if (thresholdType === 'exceeded') {
      return 'border-red-200 bg-red-50';
    } else {
      return 'border-yellow-200 bg-yellow-50';
    }
  };

  const getProgressColor = (utilizationPercentage: number) => {
    if (utilizationPercentage >= 100) return 'bg-red-500';
    if (utilizationPercentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
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
          Budget Alerts
        </h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-500">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">✅</div>
          <div>All budgets are on track</div>
          {!isConnected && (
            <div className="text-sm mt-1">Connecting to live monitoring...</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 ${getAlertColor(alert.severity, alert.thresholdType)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-2xl">
                    {getAlertIcon(alert.severity, alert.thresholdType)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {alert.category} Budget Alert
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        alert.thresholdType === 'exceeded' 
                          ? 'bg-red-200 text-red-800' 
                          : 'bg-yellow-200 text-yellow-800'
                      }`}>
                        {alert.thresholdType === 'exceeded' ? 'Over Budget' : 'Warning'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-700 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span>Spent: {formatAmount(alert.currentAmount)}</span>
                        <span>Budget: {formatAmount(alert.budgetLimit)}</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(alert.utilizationPercentage)}`}
                          style={{ width: `${Math.min(alert.utilizationPercentage, 100)}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{alert.utilizationPercentage.toFixed(1)}% used</span>
                        <span>{formatTime(alert.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                  aria-label="Dismiss alert"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};