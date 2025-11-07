import { DisplayError } from '@client/components/error';
import { DisplayLoading } from '@client/components/loading';
import { NotFound } from '@client/components/not-found';
import { ThemeProvider } from '@client/components/theme-provider';
import { routeTree } from '@client/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

// Create a client
const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: DisplayError,
  defaultPendingComponent: DisplayLoading,
  defaultNotFoundComponent: NotFound,
  context: {
    queryClient: queryClient,
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <ThemeProvider defaultTheme='dark'>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

// Render the app
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
