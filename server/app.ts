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

// Client WebSocket management for coordinator mode
let connectedClient: WSContext | null = null;
let latestOptionChain: Record<number, OptionChain> = {};

/**
 * Set the aggregated option chain data from coordinator.
 * This data will be sent to connected clients.
 */
export function setOptionChainData(data: Record<number, OptionChain>) {
  latestOptionChain = data;

  // Send to connected client if any
  if (connectedClient) {
    try {
      connectedClient.send(JSON.stringify({ type: 'optionChain', data: latestOptionChain }));
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
        if (connectedClient) {
          logger.warn('New client connected, replacing existing client');
        }
        connectedClient = ws;
        logger.info('Client connected to WebSocket');

        // Send latest data immediately if available
        if (Object.keys(latestOptionChain).length > 0) {
          ws.send(JSON.stringify({ type: 'optionChain', data: latestOptionChain }));
        }
      },
      onClose: () => {
        connectedClient = null;
        logger.info('Client disconnected from WebSocket');
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
