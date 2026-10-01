/**
 * BullMQ worker process. Run with: npm run worker
 * Requires Redis (REDIS_URL). Exits if Redis is unavailable — the API's
 * in-process fallback keeps features working without the worker.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import { isRedisAvailable, getRedis } from '../lib/redis';
import { runInline } from './fallback';

async function main() {
  if (!isRedisAvailable()) {
    console.error('[worker] Redis not available — worker cannot start. Jobs will run via the in-process fallback.');
    process.exit(1);
  }
  const connection = getRedis()!;

  const makeWorker = (queueName: string) =>
    new Worker(
      queueName,
      async (job) => {
        console.log(`[worker] ${queueName}/${job.name} ${job.id}`);
        await runInline(queueName, job.name as string, job.data as Record<string, unknown>);
      },
      { connection, concurrency: 5 },
    );

  const workers = ['sms', 'notifications', 'pdf', 'reminders'].map(makeWorker);

  const shutdown = async () => {
    console.log('[worker] shutting down…');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[worker] listening on queues: sms, notifications, pdf, reminders');
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
