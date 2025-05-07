/**
 * Environment Configuration
 * Loads and validates environment variables for the application
 */
require('dotenv').config();

// Default values for development
const defaults = {
  PORT: 9990,
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://localhost/ipMonitor',
  PING_INTERVAL: 5000, // milliseconds
  WORKER_COUNT: 'auto', // 'auto' or a number
  LOG_LEVEL: 'info',
  MAX_POOL_SIZE: 10,
  SOCKET_TIMEOUT: 45000,  // ms
  PING_TIMEOUT: 2, // seconds
  MAX_BATCH_SIZE: 50 // max IPs per worker
};

// Load environment variables with fallbacks to defaults
const config = {
  PORT: process.env.PORT || defaults.PORT,
  NODE_ENV: process.env.NODE_ENV || defaults.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI || defaults.MONGODB_URI,
  PING_INTERVAL: parseInt(process.env.PING_INTERVAL || defaults.PING_INTERVAL, 10),
  WORKER_COUNT: process.env.WORKER_COUNT || defaults.WORKER_COUNT,
  LOG_LEVEL: process.env.LOG_LEVEL || defaults.LOG_LEVEL,
  MAX_POOL_SIZE: parseInt(process.env.MAX_POOL_SIZE || defaults.MAX_POOL_SIZE, 10),
  SOCKET_TIMEOUT: parseInt(process.env.SOCKET_TIMEOUT || defaults.SOCKET_TIMEOUT, 10),
  PING_TIMEOUT: parseInt(process.env.PING_TIMEOUT || defaults.PING_TIMEOUT, 10),
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || defaults.MAX_BATCH_SIZE, 10)
};

// Compute WORKER_COUNT if set to 'auto'
if (config.WORKER_COUNT === 'auto') {
  const os = require('os');
  // Use number of CPU cores, but limit to 4 to avoid overwhelming the system
  config.WORKER_COUNT = Math.min(os.cpus().length, 4);
} else {
  config.WORKER_COUNT = parseInt(config.WORKER_COUNT, 10);
}

// Validate configuration
function validateConfig() {
  if (isNaN(config.PORT) || config.PORT <= 0) {
    throw new Error('Invalid PORT: must be a positive number');
  }
  
  if (isNaN(config.PING_INTERVAL) || config.PING_INTERVAL < 1000) {
    throw new Error('Invalid PING_INTERVAL: must be at least 1000ms');
  }
  
  if (isNaN(config.WORKER_COUNT) || config.WORKER_COUNT <= 0) {
    throw new Error('Invalid WORKER_COUNT: must be a positive number');
  }
  
  if (!['development', 'production', 'test'].includes(config.NODE_ENV)) {
    throw new Error('Invalid NODE_ENV: must be development, production, or test');
  }
  
  if (!['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].includes(config.LOG_LEVEL)) {
    throw new Error('Invalid LOG_LEVEL');
  }
}

// Run validation
validateConfig();

module.exports = config;