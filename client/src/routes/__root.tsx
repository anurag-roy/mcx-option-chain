import { Header } from '@client/components/header/header';
import { useTheme } from '@client/components/theme-provider';
import { Toaster } from '@client/components/ui/sonner';
import { useWebSocket } from '@client/hooks/use-websocket';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import '../index.css';

interface MyRouterContext {
  queryClient: QueryClient;
}

// Create WebSocket context
interface WebSocketContextType {
  spreadsData: any;
  orderStatus: any;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
};

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const { theme } = useTheme();
  const webSocketData = useWebSocket();

  return (
    <WebSocketContext.Provider value={webSocketData}>
      <div className='dark:bg-background flex min-h-screen flex-col bg-zinc-50'>
        <Header isConnected={webSocketData.isConnected} />
        <main className='container mx-auto h-full flex-1'>
          <Outlet />
        </main>
      </div>
      <Toaster richColors theme={theme} />
    </WebSocketContext.Provider>
  );
}
