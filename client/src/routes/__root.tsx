import { Header } from '@client/components/header/header';
import { Toaster } from '@client/components/ui/sonner';
import { useWebSocketContext, WebSocketProvider } from '@client/contexts/websocket-context';
import { useTheme } from '@client/hooks/use-theme';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import '../index.css';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <WebSocketProvider>
      <RootLayout />
    </WebSocketProvider>
  );
}

function RootLayout() {
  const { theme } = useTheme();
  const { isConnected } = useWebSocketContext();

  return (
    <>
      <div className='dark:bg-background flex min-h-screen flex-col bg-zinc-50'>
        <Header isConnected={isConnected} />
        <main className='h-full flex-1 py-6'>
          <Outlet />
        </main>
      </div>
      <Toaster richColors theme={theme} />
    </>
  );
}
