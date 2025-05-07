/**
 * Ping Service
 * Manages the ping operations and worker threads
 */
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const IP = require('../models/IP');
const Downtime = require('../models/Downtime');
const config = require('../config/environment');
const logger = require('../utils/logger');

// Track active workers
const activeWorkers = new Set();

/**
 * Ping IP addresses using worker threads
 * @param {Array} ipAddresses - List of IP addresses to ping
 * @returns {Promise<Array>} - Ping results for each IP
 */
function pingInWorker(ipAddresses) {
  return new Promise((resolve, reject) => {
    // Create worker with the worker file path
    const worker = new Worker(path.join(__dirname, '../workers/pingWorker.js'), {
      workerData: { 
        ipAddresses,
        timeout: config.PING_TIMEOUT
      }
    });
    
    // Track the worker
    activeWorkers.add(worker);
    
    // Set up event handlers
    worker.on('message', (results) => {
      activeWorkers.delete(worker);
      resolve(results);
    });
    
    worker.on('error', (error) => {
      activeWorkers.delete(worker);
      reject(error);
    });
    
    worker.on('exit', (code) => {
      activeWorkers.delete(worker);
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Process batch with retry capability
 * @param {Array} batch - Batch of IP addresses to process
 * @param {Number} retries - Number of retries left
 * @returns {Promise<Array>} - Ping results
 */
async function processBatchWithRetry(batch, retries = 2) {
  try {
    return await pingInWorker(batch);
  } catch (error) {
    logger.error(`Worker thread error (${retries} retries left): ${error.message}`, { error });
    
    if (retries > 0) {
      logger.info(`Retrying batch of ${batch.length} IPs...`);
      return processBatchWithRetry(batch, retries - 1);
    }
    
    // If all retries fail, return IPs as unreachable
    logger.error('All retries failed, marking IPs as down');
    return batch.map(ip => ({
      address: ip,
      alive: false,
      time: null,
      error: 'Worker thread failed after retries'
    }));
  }
}

/**
 * Update database with ping results
 * @param {Array} results - Ping results
 * @returns {Promise<Object>} - Status of the update operation
 */
async function updatePingResults(results) {
  try {
    // Group results by status for easier processing
    const ipStatusMap = new Map();
    const statusChanges = [];
    
    // Load current status from database for comparison
    const currentIps = await IP.find(
      { address: { $in: results.map(r => r.address) } },
      'address status'
    ).lean();
    
    // Create a map for quick lookups
    const currentStatusMap = new Map();
    currentIps.forEach(ip => {
      currentStatusMap.set(ip.address, ip.status);
    });
    
    // Process each result and detect status changes
    results.forEach(result => {
      const currentStatus = currentStatusMap.get(result.address);
      const newStatus = result.alive ? 'Up' : 'Down';
      
      ipStatusMap.set(result.address, result);
      
      // Detect status changes for downtime tracking
      if (currentStatus && currentStatus !== newStatus) {
        statusChanges.push({
          address: result.address,
          from: currentStatus,
          to: newStatus
        });
      }
    });
    
    // Handle status changes for downtime tracking
    for (const change of statusChanges) {
      if (change.to === 'Down') {
        // IP went down, record new downtime
        await Downtime.recordDowntime(change.address);
        
        // Update the IP record
        await IP.findOneAndUpdate(
          { address: change.address },
          { 
            lastDowntime: new Date(),
            $inc: { downtimeCount: 1 }
          }
        );
      } else if (change.to === 'Up' && change.from === 'Down') {
        // IP came back online, update duration
        await Downtime.updateDuration(change.address);
      }
    }
    
    // Bulk update all IP statuses
    const bulkUpdateResult = await IP.bulkUpdateStatus(results);
    
    return {
      total: results.length,
      updated: bulkUpdateResult.modifiedCount,
      statusChanges: statusChanges.length
    };
  } catch (error) {
    logger.error(`Error updating ping results: ${error.message}`, { error });
    throw error;
  }
}

/**
 * Run a complete ping cycle for all IPs in the database
 * @returns {Promise<Object>} - Results of the ping cycle
 */
async function runPingCycle() {
  try {
    // Get all IPs from DB - only fetch necessary fields
    const ips = await IP.find({}, 'address status').lean();
    
    if (ips.length === 0) {
      logger.info('No IPs to ping');
      return { total: 0, processed: 0 };
    }
    
    // Extract just the addresses
    const ipAddresses = ips.map(ip => ip.address);
    const ipCount = ipAddresses.length;
    
    logger.info(`Starting ping cycle for ${ipCount} IPs`);
    
    // Determine optimal worker and batch configuration
    const maxWorkers = config.WORKER_COUNT;
    const maxBatchSize = config.MAX_BATCH_SIZE;
    
    // Calculate how many workers to use based on IP count
    const optimalWorkerCount = Math.min(maxWorkers, Math.ceil(ipCount / maxBatchSize));
    
    // Distribute IPs evenly across workers
    const batchSize = Math.ceil(ipCount / optimalWorkerCount);
    const batches = [];
    
    for (let i = 0; i < ipCount; i += batchSize) {
      batches.push(ipAddresses.slice(i, i + batchSize));
    }
    
    logger.info(`Using ${batches.length} workers with batch size ~${batchSize}`);
    
    // Process batches in parallel with retry capability
    const batchPromises = batches.map(batch => processBatchWithRetry(batch));
    const batchResults = await Promise.all(batchPromises);
    
    // Flatten results
    const results = batchResults.flat();
    
    // Update database with results
    const updateResult = await updatePingResults(results);
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    logger.debug(`Memory usage: RSS ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    
    return {
      total: ips.length,
      processed: results.length,
      changes: updateResult.statusChanges,
      up: results.filter(r => r.alive).length,
      down: results.filter(r => !r.alive).length
    };
  } catch (error) {
    logger.error(`Error in ping cycle: ${error.message}`, { error });
    return { 
      total: 0,
      processed: 0,
      error: error.message
    };
  }
}

/**
 * Terminate all active worker threads
 * @returns {Promise<void>}
 */
async function terminateWorkers() {
  const promises = [];
  for (const worker of activeWorkers) {
    promises.push(new Promise((resolve) => {
      worker.once('exit', () => resolve());
      worker.terminate();
    }));
  }
  
  await Promise.all(promises);
  activeWorkers.clear();
  logger.info('All ping workers terminated');
}

module.exports = {
  runPingCycle,
  terminateWorkers
};