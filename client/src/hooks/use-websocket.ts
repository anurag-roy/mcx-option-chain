import type { OptionChainData } from '@client/types/option-chain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type WebSocketMessage = { type: 'optionChain'; data: OptionChainData };

export function useWebSocket() {
  const [optionChainData, setOptionChainData] = useState<OptionChainData>({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    try {
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

          if (message.type === 'optionChain') {
            setOptionChainData(message.data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.addEventListener('close', () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        const maxAttempts = 5;
        const baseDelay = 1000;

        if (reconnectAttemptsRef.current < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = window.setTimeout(() => {
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
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setOptionChainData({});
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    optionChainData,
    isConnected,
    connect,
    disconnect,
  };
}
