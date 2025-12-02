import { useWebSocket } from '@client/hooks/use-websocket';
import type { OptionChainData } from '@client/types/option-chain';
import { createContext, useContext, type ReactNode } from 'react';

interface WebSocketContextType {
  optionChainData: OptionChainData;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  updateSdMultiplier: (value: number) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: ReactNode;
  symbols?: string[];
}

export function WebSocketProvider({ children, symbols }: WebSocketProviderProps) {
  const webSocketData = useWebSocket(symbols);

  return <WebSocketContext.Provider value={webSocketData}>{children}</WebSocketContext.Provider>;
}
