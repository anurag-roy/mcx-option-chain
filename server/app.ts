import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { logger } from '@server/lib/logger';
import { httpLogger } from '@server/middlewares/http-logger';
import { userRoute } from '@server/routes/user';
import type { OptionChain } from '@shared/types/types';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { WSContext } from 'hono/ws';

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use('*', httpLogger());

// Multi-client WebSocket management with per-client symbol filtering
// Map of client -> Set of subscribed symbols (empty set = all symbols)
const connectedClients = new Map<WSContext, Set<string>>();
let latestOptionChain: Record<number, OptionChain> = {};

/**
 * Filter option chain data for a specific set of symbols
 */
function filterDataForSymbols(data: Record<number, OptionChain>, symbols: Set<string>): Record<number, OptionChain> {
  // If no symbols specified, return all data
  if (symbols.size === 0) {
    return data;
  }

  return Object.fromEntries(Object.entries(data).filter(([_, option]) => symbols.has(option.name)));
}

/**
 * Set the aggregated option chain data from coordinator.
 * This data will be filtered and sent to all connected clients based on their subscriptions.
 */
export function setOptionChainData(data: Record<number, OptionChain>) {
  latestOptionChain = data;

  // Send filtered data to each connected client
  for (const [client, symbols] of connectedClients) {
    try {
      const filteredData = filterDataForSymbols(latestOptionChain, symbols);
      client.send(JSON.stringify({ type: 'optionChain', data: filteredData }));
    } catch (error) {
      logger.error('Failed to send option chain to client:', error);
    }
  }
}

const apiRoutes = app
  .basePath('/api')
  .route('/user', userRoute)
  .get(
    '/ws',
    upgradeWebSocket(() => ({
      onOpen: (_event, ws) => {
        // Add client with empty symbol set (will receive all data until they subscribe)
        connectedClients.set(ws, new Set());
        logger.info(`Client connected. Total clients: ${connectedClients.size}`);
      },
      onMessage: (event, ws) => {
        try {
          const message = JSON.parse(event.data.toString());

          if (message.type === 'subscribe' && Array.isArray(message.symbols)) {
            const symbols = new Set<string>(message.symbols);
            connectedClients.set(ws, symbols);
            logger.info(`Client subscribed to symbols: ${message.symbols.join(', ')}`);

            // Send initial filtered data immediately
            if (Object.keys(latestOptionChain).length > 0) {
              const filteredData = filterDataForSymbols(latestOptionChain, symbols);
              ws.send(JSON.stringify({ type: 'optionChain', data: filteredData }));
              logger.info(`Sent initial data: ${Object.keys(filteredData).length} instruments`);
            }
          }
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      },
      onClose: (_event, ws) => {
        connectedClients.delete(ws);
        logger.info(`Client disconnected. Total clients: ${connectedClients.size}`);
      },
    }))
  );

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    if (err.cause instanceof Error) {
      err.message = err.message + ': ' + err.cause.message;
    }
    return err.getResponse();
  } else if (err instanceof Error) {
    logger.error(err.message);
  } else {
    logger.error(err);
  }
  return c.json({ message: 'Internal server error. Please try again later.' }, 500);
});

// Serve static files
app.get('*', serveStatic({ root: './client/dist' }));
app.get('*', serveStatic({ path: './client/dist/index.html' }));

export { injectWebSocket };
export type ApiRoutes = typeof apiRoutes;
export default app;
