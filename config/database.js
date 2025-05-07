/**
 * Database configuration
 * Handles MongoDB connection and setup
 */
const mongoose = require('mongoose');
const config = require('./environment');
const logger = require('../utils/logger');

// MongoDB connection options
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Connection pool configuration
  poolSize: config.MAX_POOL_SIZE,
  socketTimeoutMS: config.SOCKET_TIMEOUT,
  // Write concern for better performance/reliability balance
  w: 1,
  wtimeout: 2500,
  // Auto-create indexes
  autoIndex: config.NODE_ENV !== 'production'
};

/**
 * Connect to MongoDB and setup event handlers
 */
async function connectToDatabase() {
  try {
    // If already connected, return the connection
    if (mongoose.connection.readyState === 1) {
      logger.info('Using existing MongoDB connection');
      return mongoose.connection;
    }

    // Log connection attempt
    logger.info(`Connecting to MongoDB at ${config.MONGODB_URI}`);
    
    // Set up connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting to reconnect...');
      setTimeout(connectToDatabase, 5000);
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI, mongoOptions);
    logger.info('Successfully connected to MongoDB');

    // Setup database indexes on first connection
    if (mongoose.connection.readyState === 1) {
      await setupIndexes();
    }
    
    return mongoose.connection;
  } catch (error) {
    logger.error(`Failed to connect to MongoDB: ${error.message}`, { error });
    
    // Retry connection after delay
    logger.info('Retrying MongoDB connection in 5 seconds...');
    setTimeout(connectToDatabase, 5000);
    
    // Rethrow the error if in test environment
    if (config.NODE_ENV === 'test') {
      throw error;
    }
  }
}

/**
 * Setup database indexes
 */
async function setupIndexes() {
  try {
    logger.info('Setting up database indexes...');
    
    // Import models here to avoid circular dependencies
    const IP = require('../models/IP');
    const Downtime = require('../models/Downtime');
    
    // Ensure indexes are created or validated
    await IP.createIndexes();
    await Downtime.createIndexes();
    
    logger.info('Database indexes setup complete');
  } catch (error) {
    logger.error(`Error setting up database indexes: ${error.message}`, { error });
    // Non-critical error, continue application startup
  }
}

/**
 * Close the database connection
 */
async function closeDatabaseConnection() {
  try {
    if (mongoose.connection.readyState !== 0) { // 0 = disconnected
      logger.info('Closing MongoDB connection');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }
  } catch (error) {
    logger.error(`Error closing MongoDB connection: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  connect: connectToDatabase,
  close: closeDatabaseConnection,
  connection: mongoose.connection
};