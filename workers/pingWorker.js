/**
 * Ping Worker Thread
 * Handles ping operations in a separate thread
 */
const { parentPort, workerData } = require('worker_threads');
const ping = require('ping');

// Get data passed from the main thread
const { ipAddresses, timeout } = workerData;

/**
 * Ping a single IP address
 * @param {string} ipAddress - IP address to ping
 * @returns {Promise<Object>} - Ping result
 */
async function pingIP(ipAddress) {
  try {
    const result = await ping.promise.probe(ipAddress, {
      timeout: timeout,
      min_reply: 1,
      extra: ['-c', '1'],  // Send only one packet
    });
    
    return {
      address: ipAddress,
      alive: result.alive,
      time: result.time,
      error: result.alive ? null : (result.output || 'Ping failed')
    };
  } catch (error) {
    return {
      address: ipAddress,
      alive: false,
      time: null,
      error: error.message
    };
  }
}

/**
 * Process all IP addresses in parallel
 */
async function processIPs() {
  try {
    // Ping each IP in parallel
    const pingPromises = ipAddresses.map(ip => pingIP(ip));
    const results = await Promise.all(pingPromises);
    
    // Send results back to main thread
    parentPort.postMessage(results);
  } catch (error) {
    // Send error to main thread
    parentPort.postMessage({
      error: error.message,
      stack: error.stack
    });
  }
}

// Start processing
processIPs();