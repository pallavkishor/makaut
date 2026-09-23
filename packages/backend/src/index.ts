import { createApp } from './app';
import { config, validateConfig } from './config';
import { logger } from './lib/logger';

/**
 * Start the Express server
 */
async function startServer(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();

    // Create Express app
    const app = createApp();

    // Start listening
    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          environment: config.nodeEnv,
          logLevel: logger.level,
        },
        'Server started'
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received, closing server');

      server.close(() => {
        logger.info({ signal }, 'Server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error(
          { signal, timeoutMs: 10000 },
          'Forced shutdown after timeout'
        );
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Last-resort handlers: log the fault before the process dies so it is not
    // lost to an empty container log.
    process.on('unhandledRejection', (reason) => {
      logger.error(
        {
          errorMessage: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        },
        'Unhandled promise rejection'
      );
    });

    process.on('uncaughtException', (error) => {
      logger.error(
        { errorName: error.name, errorMessage: error.message, stack: error.stack },
        'Uncaught exception'
      );
      process.exit(1);
    });
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to start server'
    );
    process.exit(1);
  }
}

// Start server if this is the main module
if (require.main === module) {
  startServer();
}

export { createApp };
