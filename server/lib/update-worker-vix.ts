import type { Symbol } from '@server/shared/config';
import type { CoordinatorMessage, WorkerMessage } from '@server/worker';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Wait for the owning worker to apply VIX before reporting a successful save. */
export function updateWorkerVix(worker: ChildProcess, symbol: Symbol, value: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.off('message', onMessage);
      worker.off('exit', onExit);
      worker.off('error', finish);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (message: WorkerMessage) => {
      if (message.type === 'vixUpdated' && message.requestId === requestId) {
        finish(message.error ? new Error(message.error) : undefined);
      }
    };
    const onExit = () => finish(new Error(`Worker exited before applying VIX for ${symbol}`));
    const timeout = setTimeout(() => finish(new Error(`Worker timed out applying VIX for ${symbol}`)), 5000);

    worker.on('message', onMessage);
    worker.once('exit', onExit);
    worker.once('error', finish);

    try {
      worker.send({ type: 'updateVix', requestId, symbol, value } satisfies CoordinatorMessage, (error) => {
        if (error) finish(error);
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
