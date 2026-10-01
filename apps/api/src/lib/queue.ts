import { Queue } from 'bullmq';
import { getRedis, isRedisAvailable } from './redis';

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue | null {
  if (!isRedisAvailable()) return null;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getRedis()! });
    queues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a job. When Redis is unavailable, run the handler inline via the
 * in-process fallback (see jobs/fallback.ts) so features keep working.
 */
export async function enqueue(queueName: string, jobName: string, data: Record<string, unknown>): Promise<{ queued: boolean; inline: boolean }> {
  const q = getQueue(queueName);
  if (q) {
    await q.add(jobName, data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 });
    return { queued: true, inline: false };
  }
  const { runInline } = await import('../jobs/fallback');
  await runInline(queueName, jobName, data);
  return { queued: false, inline: true };
}

export async function closeQueues(): Promise<void> {
  for (const q of queues.values()) await q.close();
  queues.clear();
}
