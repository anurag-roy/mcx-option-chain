import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type SpreadsData = {
  callSpread: {
    maxProfit: number;
    maxLoss: number;
    creditOrDebit: number;
    breakEven: number;
  };
  putSpread: {
    maxProfit: number;
    maxLoss: number;
    creditOrDebit: number;
    breakEven: number;
  };
};

type OrderStatusData = {
  ordersEnabled: boolean;
  orderPlaced: boolean;
  entryPrice: number | null;
  success?: boolean;
  error?: string;
};

type WebSocketMessage = { type: 'spreads'; data: SpreadsData } | { type: 'order-status'; data: OrderStatusData };

export function useWebSocket() {
  const [spreadsData, setSpreadsData] = useState<SpreadsData | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatusData>({
    ordersEnabled: false,
    orderPlaced: false,
    entryPrice: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = () => {
    try {
      // Use the Hono RPC client to get the WebSocket URL
      const wsUrl = new URL('/api/ws', window.location.href);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        console.log('WebSocket connected');
      });

      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          if (message.type === 'spreads') {
            setSpreadsData(message.data);
          } else if (message.type === 'order-status') {
            setOrderStatus(message.data);

            // Handle order placement notifications
            if (message.data.orderPlaced && message.data.success !== undefined) {
              if (message.data.success) {
                toast.success('Order placed successfully!');
                // Play success sound
                const audio = new Audio('/notification.mp3');
                audio.play().catch(console.error);
              } else {
                toast.error(`Order placement failed: ${message.data.error || 'Unknown error'}`);
                // Play error sound (you can use different sound or same)
                const audio = new Audio('/notification.mp3');
                audio.play().catch(console.error);
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          toast.error('Failed to parse WebSocket message');
        }
      });

      ws.addEventListener('close', () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        const maxAttempts = 5;
        const baseDelay = 1000; // 1 second

        if (reconnectAttemptsRef.current < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect (attempt ${reconnectAttemptsRef.current}/${maxAttempts})`);
            connect();
          }, delay);
        } else {
          toast.error('WebSocket connection lost. Please refresh the page.');
        }
      });

      ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        toast.error('WebSocket connection error');
        setIsConnected(false);
      });
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      toast.error('Failed to create WebSocket connection');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setSpreadsData(null);
    setOrderStatus({
      ordersEnabled: false,
      orderPlaced: false,
      entryPrice: null,
    });
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  return {
    spreadsData,
    orderStatus,
    isConnected,
    connect,
    disconnect,
  };
}
