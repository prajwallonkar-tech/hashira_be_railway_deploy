import 'reflect-metadata';
import { app, setAnchorQueue } from './app';
import { env } from './config/env';
import { AppDataSource } from './config/database';
import {
  createRedisConnection,
  createAnchorQueue,
  createAnchorWorker,
} from './queues/anchor.queue';
import { BlockchainAnchoringService } from './services/BlockchainAnchoringService';
import {
  createBlockchainConfig,
  createBlockchainPublicClient,
  createBlockchainWalletClient,
} from './config/blockchain.config';
import {
  createProcessor,
  registerWorkerListeners,
} from './workers/anchoring.worker';
import { EventProcessingService } from './services/event/event-processing.service';
import { setEventProcessingService } from './services/event/event-ingestion.service';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connection established');

  const blockchainConfig = createBlockchainConfig();
  const walletClient = createBlockchainWalletClient(blockchainConfig);
  const publicClient = createBlockchainPublicClient(blockchainConfig);
  const anchoringService = new BlockchainAnchoringService(
    walletClient as never,
    publicClient as never,
    blockchainConfig,
  );

  const redisConnection = createRedisConnection(env.REDIS_URL);
  const anchorQueue = createAnchorQueue(redisConnection);
  const processor = createProcessor(anchoringService);
  const anchorWorker = createAnchorWorker(redisConnection, processor);
  registerWorkerListeners(anchorWorker);
  setAnchorQueue(anchorQueue);

  const processingService = new EventProcessingService(anchorQueue);
  setEventProcessingService(processingService);

  console.log('Anchor worker started');

  const server = app.listen(env.PORT, () => {
    console.log(`server listening on port ${env.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      anchorWorker
        .close()
        .then(() => {
          console.log('Anchor worker closed');
          return anchorQueue.close();
        })
        .then(() => {
          console.log('Anchor queue closed');
          if (AppDataSource.isInitialized) return AppDataSource.destroy();
        })
        .then(() => {
          console.log('Database connection closed');
          process.exit(0);
        })
        .catch(() => {
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
