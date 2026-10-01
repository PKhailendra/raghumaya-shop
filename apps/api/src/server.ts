import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';
import { initRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { closeQueues } from './lib/queue';

async function main() {
  const redisOk = await initRedis();
  // eslint-disable-next-line no-console
  console.log(`[server] redis ${redisOk ? 'connected' : 'unavailable — running with in-process job fallback'}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] RaghuMayaShop API listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log('[server] shutting down…');
    server.close(async () => {
      await closeQueues();
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal', err);
  process.exit(1);
});
