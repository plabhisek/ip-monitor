/**
 * Server entry point
 * Bootstraps the application and starts the ping service
 */
const http = require('http');
const app = require('./app');
const db = require('./config/database');
const config = require('./config/environment');
const logger = require('./utils/logger');
const pingService = require('./services/pingService');

// Create HTTP server
const server = http.createServer(app);

// Set up interval for pinging IPs
let pingInterval;

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Connect to database and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await db.connect();
    
    // Start HTTP server
    server.listen(config.PORT, () => {
      logger.info(`Server listening on port ${config.PORT} in ${config.NODE_ENV} mode`);
      
      // Start ping cycle
      startPingService();
    });
    
    server.on('error', (error) => {
      logger.error(`Server error: ${error.message}`, { error });
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.PORT} is already in use`);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`, { error });
    process.exit(1);
  }
}

// Start ping service
function startPingService() {
  // Run first ping cycle immediately
  pingService.runPingCycle()
    .then(result => {
      logger.info(`Initial ping cycle completed: ${result.processed}/${result.total} IPs processed`);
    })
    .catch(error => {
      logger.error(`Error in initial ping cycle: ${error.message}`, { error });
    });
  
  // Set up interval for subsequent cycles
  pingInterval = setInterval(async () => {
    try {
      const result = await pingService.runPingCycle();
      logger.info(`Ping cycle completed: ${result.processed}/${result.total} IPs processed, ${result.up} up, ${result.down} down`);
    } catch (error) {
      logger.error(`Error in ping cycle: ${error.message}`, { error });
    }
  }, config.PING_INTERVAL);
  
  logger.info(`Ping service started with interval of ${config.PING_INTERVAL}ms`);
}

// Graceful shutdown logic
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  // Clear ping interval
  if (pingInterval) {
    clearInterval(pingInterval);
    logger.info('Ping service stopped');
  }
  
  // Terminate worker threads
  await pingService.terminateWorkers();
  
  // Close server
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close database connection
    try {
      await db.close();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error(`Error closing database: ${error.message}`, { error });
      process.exit(1);
    }
  });
  
  // Force exit if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Start the server
startServer();