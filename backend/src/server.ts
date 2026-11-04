/**
 * Process entry point. Configuration is validated on import, so it is loaded
 * dynamically here to turn an invalid environment into a clean, secret-free exit.
 */
let bootstrap: typeof import('./bootstrap.js');
let config: typeof import('./config/env.js');
try {
  config = await import('./config/env.js');
  bootstrap = await import('./bootstrap.js');
} catch (err) {
  // parseEnv errors list variable names only, never values.
  console.error(`Startup failed: ${(err as Error).message}`);
  process.exit(1);
}

const { logger } = await import('./shared/logger.js');

try {
  const running = await bootstrap.startServer({ port: config.env.PORT });

  const onSignal = (signal: NodeJS.Signals) => {
    running
      .shutdown(signal)
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'Shutdown failed');
        process.exit(1);
      });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
} catch (err) {
  logger.fatal({ code: (err as { code?: string }).code }, 'Server failed to start');
  process.exit(1);
}
