import { useWebSocket } from '@client/hooks/use-websocket';
import { PAGE_CONFIGS, type OptionChainData } from '@client/types/option-chain';
import { useLocation } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

interface WebSocketContextType {
  optionChainData: OptionChainData;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  subscribe: (symbols: string[]) => void;
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
}

/**
 * Get all symbols for the current route from PAGE_CONFIGS
 */
function getSymbolsForPath(pathname: string): string[] {
  const pageConfig = PAGE_CONFIGS.find((config) => config.path === pathname);
  if (!pageConfig) {
    // Home page or unknown route - return all symbols
    return [];
  }

  // Flatten all symbols from all tables in this page
  return pageConfig.tables.flatMap((table) => [...table.symbols]);
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const location = useLocation();

  // Determine symbols based on current route
  const symbols = useMemo(() => getSymbolsForPath(location.pathname), [location.pathname]);

  const webSocketData = useWebSocket({ symbols });

  // Re-subscribe when route changes
  const { subscribe, isConnected } = webSocketData;
  useEffect(() => {
    if (isConnected && symbols.length > 0) {
      subscribe(symbols);
    }
  }, [isConnected, symbols, subscribe]);

  return <WebSocketContext.Provider value={webSocketData}>{children}</WebSocketContext.Provider>;
}
