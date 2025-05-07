/**
 * Global error handler middleware
 * Handles errors in a consistent way
 */
const logger = require('./logger');
const config = require('../config/environment');

/**
 * Error handler middleware
 */
module.exports = (err, req, res, next) => {
  // Default status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Log the error
  if (statusCode >= 500) {
    logger.error(`Server error: ${err.message}`, { 
      error: err,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  } else {
    logger.warn(`Client error: ${err.message}`, {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  }
  
  // Determine if we should send the stack trace
  const showStack = config.NODE_ENV !== 'production';
  
  // Different handling for API vs web requests
  if (req.path.startsWith('/api')) {
    // API response
    res.status(statusCode).json({
      error: {
        message: err.message,
        code: err.code || statusCode,
        stack: showStack ? err.stack : undefined
      }
    });
  } else {
    // Web response
    res.status(statusCode).render('error', {
      title: `Error ${statusCode}`,
      message: err.message || 'An unexpected error occurred',
      error: {
        status: statusCode,
        stack: showStack ? err.stack : undefined
      }
    });
  }
};