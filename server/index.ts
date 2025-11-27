/**
 * Coordinator process that spawns worker processes and aggregates their data.
 * Each worker handles a subset of symbols via its own KiteTicker connection.
 *
 * This allows us to work around Zerodha's 3000 instrument limit per connection
 * and distribute the tick processing load across multiple processes.
 */

import { serve } from '@hono/node-server';
import app, { injectWebSocket, setOptionChainData } from '@server/app';
import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';
import { WORKER_GROUPS } from '@server/shared/config';
import type { OptionChain } from '@shared/types/types';
import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoordinatorMessage, WorkerMessage } from './worker';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Aggregated option chain data from all workers
const aggregatedOptionChain: Record<number, OptionChain> = {};

// Track worker processes
const workers: ChildProcess[] = [];
const workerReadyPromises: Promise<void>[] = [];

// SD multiplier for subscriptions (can be made configurable)
const SD_MULTIPLIER = 2.05;

async function main() {
  // Verify Kite session before starting workers
  try {
    await kiteService.getProfile();
    logger.info(`Logged in as ${env.KITE_USER_ID}`);
  } catch (error) {
    logger.error('Session expired. Please login again using `npm run login`');
    process.exit(1);
  }

  // Spawn worker processes
  logger.info(`Starting ${WORKER_GROUPS.length} worker processes...`);

  for (let i = 0; i < WORKER_GROUPS.length; i++) {
    const symbols = WORKER_GROUPS[i]!;
    const workerEnv = {
      ...process.env,
      SYMBOLS: symbols.join(','),
      WORKER_ID: String(i + 1),
    };

    const worker = fork(path.join(__dirname, 'worker.ts'), [], {
      execArgv: ['--import', 'tsx'],
      env: workerEnv,
      stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
    });

    workers.push(worker);

    // Create a promise that resolves when worker is ready
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Worker ${i + 1} timed out during initialization`));
      }, 30000);

      worker.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeoutId);
          logger.info(`Worker ${i + 1} is ready (symbols: ${symbols.join(', ')})`);
          resolve();
        } else if (msg.type === 'optionChain') {
          // Merge option chain data from worker into aggregated data
          Object.assign(aggregatedOptionChain, msg.data);
        } else if (msg.type === 'error') {
          clearTimeout(timeoutId);
          reject(new Error(`Worker ${i + 1} error: ${msg.error}`));
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`Worker ${i + 1} exited with code ${code}`);
        }
      });
    });

    workerReadyPromises.push(readyPromise);
  }

  // Wait for all workers to be ready
  try {
    await Promise.all(workerReadyPromises);
    logger.info('All workers are ready');
  } catch (error) {
    logger.error('Failed to start workers:', error);
    // Kill all workers on failure
    for (const worker of workers) {
      worker.kill();
    }
    process.exit(1);
  }

  // Start HTTP server
  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info(`Server started on http://localhost:${info.port}`);
    }
  );
  injectWebSocket(server);

  // Wait for futures LTP data to be received before subscribing
  logger.info('Waiting 5 seconds for futures LTP data...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Send subscribe command to all workers
  logger.info(`Sending subscribe command to workers with sdMultiplier: ${SD_MULTIPLIER}`);
  for (const worker of workers) {
    worker.send({ type: 'subscribe', sdMultiplier: SD_MULTIPLIER } satisfies CoordinatorMessage);
  }

  // Update the app with aggregated option chain data periodically
  setInterval(() => {
    if (Object.keys(aggregatedOptionChain).length > 0) {
      setOptionChainData(aggregatedOptionChain);
    }
  }, 250);
}

// Handle graceful shutdown
async function shutdown() {
  logger.info('Shutting down coordinator...');

  // Send shutdown command to all workers
  for (const worker of workers) {
    worker.send({ type: 'shutdown' } satisfies CoordinatorMessage);
  }

  // Wait for workers to exit (with timeout)
  await Promise.race([
    Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve) => {
            worker.on('exit', () => resolve());
          })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);

  // Force kill any remaining workers
  for (const worker of workers) {
    if (!worker.killed) {
      worker.kill('SIGKILL');
    }
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((error) => {
  logger.error('Coordinator failed to start:', error);
  process.exit(1);
});
