/**
 * CSV Service
 * Handles import and export of data in CSV format
 */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { stringify } = require('csv-stringify/sync');
const IP = require('../models/IP');
const logger = require('../utils/logger');

/**
 * Import IP addresses from a CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Object>} Import results
 */
exports.importIPsFromCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };
    
    const ips = [];
    
    fs.createReadStream(filePath)
      .pipe(csv({
        skipLines: 0,
        headers: ['address', 'location']
      }))
      .on('data', (data) => {
        // Validate IP address
        const ipAddress = data.address ? data.address.trim() : '';
        const location = data.location ? data.location.trim() : '';
        
        if (!ipAddress) {
          results.skipped++;
          results.errors.push(`Empty IP address in row: ${JSON.stringify(data)}`);
          return;
        }
        
        ips.push({
          address: ipAddress,
          location: location
        });
      })
      .on('end', async () => {
        try {
          // Process IPs in batches to avoid overwhelming DB
          const batchSize = 50;
          
          for (let i = 0; i < ips.length; i += batchSize) {
            const batch = ips.slice(i, i + batchSize);
            
            // Process each IP in batch
            for (const ip of batch) {
              try {
                // Check if IP already exists
                const existing = await IP.findOne({ address: ip.address });
                
                if (existing) {
                  // Update location if provided
                  if (ip.location && ip.location !== existing.location) {
                    await IP.updateOne(
                      { address: ip.address },
                      { $set: { location: ip.location } }
                    );
                  }
                  
                  results.skipped++;
                } else {
                  // Create new IP
                  const newIP = new IP({
                    address: ip.address,
                    location: ip.location
                  });
                  
                  await newIP.save();
                  results.imported++;
                }
              } catch (error) {
                results.skipped++;
                results.errors.push(`Error processing ${ip.address}: ${error.message}`);
                logger.error(`CSV import error for IP ${ip.address}: ${error.message}`);
              }
            }
          }
          
          // Delete the temporary file
          fs.unlink(filePath, (err) => {
            if (err) logger.warn(`Failed to delete temporary CSV file: ${err.message}`);
          });
          
          resolve(results);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

/**
 * Generate CSV data from IP addresses
 * @param {Array} ips - Array of IP objects
 * @returns {Promise<Buffer>} CSV data as buffer
 */
exports.generateIPsCSV = async (ips) => {
  const csvData = ips.map(ip => ({
    address: ip.address,
    location: ip.location || '',
    status: ip.status,
    responseTime: ip.responseTime || '',
    lastChecked: ip.lastChecked ? ip.lastChecked.toISOString() : '',
    downtimeCount: ip.downtimeCount,
    lastDowntime: ip.lastDowntime ? ip.lastDowntime.toISOString() : ''
  }));
  
  // Generate CSV string
  const csvString = stringify(csvData, {
    header: true,
    quoted: true,
    columns: [
      'address',
      'location',
      'status',
      'responseTime',
      'lastChecked',
      'downtimeCount',
      'lastDowntime'
    ]
  });
  
  return Buffer.from(csvString);
};

/**
 * Export downtime data to CSV
 * @param {Array} downtimes - Array of downtime objects
 * @returns {Promise<Buffer>} CSV data as buffer
 */
exports.exportDowntimeCSV = async (downtimes) => {
  const csvData = downtimes.map(dt => ({
    ipAddress: dt.ipAddress,
    timestamp: dt.timestamp ? dt.timestamp.toISOString() : '',
    duration: dt.duration || '',
    durationFormatted: dt.duration ? formatDuration(dt.duration) : 'Ongoing',
    reason: dt.reason || ''
  }));
  
  // Generate CSV string
  const csvString = stringify(csvData, {
    header: true,
    quoted: true,
    columns: [
      'ipAddress',
      'timestamp',
      'durationFormatted',
      'reason'
    ]
  });
  
  return Buffer.from(csvString);
};

/**
 * Format duration in milliseconds to a readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms) return '';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}