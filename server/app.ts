import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { logger } from '@server/lib/logger';
import { tickerService } from '@server/lib/services/ticker';
import { httpLogger } from '@server/middlewares/http-logger';
import { userRoute } from '@server/routes/user';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use('*', httpLogger());

const apiRoutes = app
  .basePath('/api')
  .route('/user', userRoute)
  .get(
    '/ws',
    upgradeWebSocket((c) => ({
      onOpen: (_event, ws) => {
        tickerService.addClient(ws);
      },
      onClose: () => {
        tickerService.removeClient();
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
