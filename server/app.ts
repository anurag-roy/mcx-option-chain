import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { logger } from '@server/lib/logger';
import { httpLogger } from '@server/middlewares/http-logger';
import { userRoute } from '@server/routes/user';
import type { Symbol } from '@server/shared/config';
import type { OptionChain } from '@shared/types/types';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { WSContext } from 'hono/ws';
import { randomUUID } from 'node:crypto';

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use('*', httpLogger());

// Client WebSocket management for coordinator mode
interface ClientSubscription {
  ws: WSContext;
  symbols: Set<Symbol>;
}

const connectedClients = new Map<string, ClientSubscription>();
let latestOptionChain: Record<number, OptionChain> = {};

/**
 * Set the aggregated option chain data from coordinator.
 * This data will be sent to connected clients based on their subscriptions.
 */
export function setOptionChainData(data: Record<number, OptionChain>) {
  latestOptionChain = data;

  // Send to all connected clients based on their subscriptions
  for (const [clientId, subscription] of connectedClients.entries()) {
    try {
      // Filter data based on client's subscribed symbols
      const filteredData: Record<number, OptionChain> = {};
      for (const [token, option] of Object.entries(data)) {
        if (subscription.symbols.has(option.name as Symbol)) {
          filteredData[Number(token)] = option;
        }
      }

      // Only send if there's data for this client
      if (Object.keys(filteredData).length > 0) {
        subscription.ws.send(JSON.stringify({ type: 'optionChain', data: filteredData }));
      }
    } catch (error) {
      logger.error(`Failed to send option chain to client ${clientId}:`, error);
      // Remove dead client
      connectedClients.delete(clientId);
    }
  }
}

const apiRoutes = app
  .basePath('/api')
  .route('/user', userRoute)
  .get(
    '/ws',
    upgradeWebSocket(() => {
      let clientId: string;

      return {
        onOpen: (_event, ws) => {
          clientId = randomUUID();
          connectedClients.set(clientId, {
            ws,
            symbols: new Set(),
          });
          logger.info(`Client ${clientId} connected to WebSocket. Total clients: ${connectedClients.size}`);
        },
        onMessage: (event, ws) => {
          try {
            const message = JSON.parse(event.data.toString());

            if (message.type === 'subscribe' && Array.isArray(message.symbols)) {
              const subscription = connectedClients.get(clientId);
              if (subscription) {
                // Add symbols to subscription
                for (const symbol of message.symbols) {
                  subscription.symbols.add(symbol as Symbol);
                }
                logger.info(`Client ${clientId} subscribed to: ${message.symbols.join(', ')}`);

                // Send initial data for subscribed symbols
                const filteredData: Record<number, OptionChain> = {};
                for (const [token, option] of Object.entries(latestOptionChain)) {
                  if (subscription.symbols.has(option.name as Symbol)) {
                    filteredData[Number(token)] = option;
                  }
                }

                if (Object.keys(filteredData).length > 0) {
                  ws.send(JSON.stringify({ type: 'optionChain', data: filteredData }));
                  logger.info(`Sent initial data to client ${clientId}: ${Object.keys(filteredData).length} instruments`);
                }
              }
            } else if (message.type === 'unsubscribe' && Array.isArray(message.symbols)) {
              const subscription = connectedClients.get(clientId);
              if (subscription) {
                for (const symbol of message.symbols) {
                  subscription.symbols.delete(symbol as Symbol);
                }
                logger.info(`Client ${clientId} unsubscribed from: ${message.symbols.join(', ')}`);
              }
            }
          } catch (error) {
            logger.error(`Error processing message from client ${clientId}:`, error);
          }
        },
        onClose: () => {
          connectedClients.delete(clientId);
          logger.info(`Client ${clientId} disconnected from WebSocket. Total clients: ${connectedClients.size}`);
        },
      };
    })
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
