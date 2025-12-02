import type { OptionChainData } from '@client/types/option-chain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type WebSocketMessage = { type: 'optionChain'; data: OptionChainData };

export function useWebSocket(subscribedSymbols?: string[]) {
  const [optionChainData, setOptionChainData] = useState<OptionChainData>({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribedSymbolsRef = useRef<string[]>(subscribedSymbols ?? []);
  const pendingSubscriptionsRef = useRef<string[]>([]);

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

        // Send subscription message for initial symbols
        if (subscribedSymbolsRef.current.length > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', symbols: subscribedSymbolsRef.current }));
          console.log('Subscribed to symbols:', subscribedSymbolsRef.current);
        }

        // Send any pending subscriptions that were queued before connection opened
        if (pendingSubscriptionsRef.current.length > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', symbols: pendingSubscriptionsRef.current }));
          console.log('Subscribed to pending symbols:', pendingSubscriptionsRef.current);
          subscribedSymbolsRef.current = [
            ...new Set([...subscribedSymbolsRef.current, ...pendingSubscriptionsRef.current]),
          ];
          pendingSubscriptionsRef.current = [];
        }
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
    pendingSubscriptionsRef.current = [];
    subscribedSymbolsRef.current = [];
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Update subscribed symbols when they change
  useEffect(() => {
    subscribedSymbolsRef.current = subscribedSymbols ?? [];

    // If already connected, send new subscription
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      subscribedSymbols &&
      subscribedSymbols.length > 0
    ) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbols: subscribedSymbols }));
      console.log('Updated subscription to symbols:', subscribedSymbols);
    }
  }, [subscribedSymbols]);

  const subscribe = useCallback((symbols: string[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Connection is open, send immediately
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbols }));
      subscribedSymbolsRef.current = [...new Set([...subscribedSymbolsRef.current, ...symbols])];
      console.log('Subscribed to symbols:', symbols);
    } else {
      // Connection not open yet, queue for later
      pendingSubscriptionsRef.current = [...new Set([...pendingSubscriptionsRef.current, ...symbols])];
      console.log('Queued subscription for symbols (connection not ready):', symbols);
    }
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', symbols }));
      console.log('Unsubscribed from symbols:', symbols);
    }
  }, []);

  const updateSdMultiplier = useCallback((value: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'updateSdMultiplier', value }));
      console.log('Sent SD multiplier update:', value);
    } else {
      console.warn('Cannot update SD multiplier: WebSocket not connected');
      toast.error('WebSocket not connected. Please try again.');
    }
  }, []);

  return {
    optionChainData,
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    updateSdMultiplier,
  };
}
