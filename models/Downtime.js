/**
 * Downtime Model
 * Tracks downtime events for monitored IP addresses
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Optimize downtime schema for time-series data
const downtimeSchema = new mongoose.Schema({
  ipAddress: { 
    type: String, 
    required: true,
    index: true
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  duration: { 
    type: Number, 
    default: null,
    min: 0
  },
  reason: {
    type: String,
    default: 'Ping timeout'
  }
}, { 
  // Use time-series optimization if supported by MongoDB (4.4+)
  // This is commented out as it requires MongoDB 5.0+ in production
  // timeseries: {
  //   timeField: 'timestamp',
  //   metaField: 'ipAddress',
  //   granularity: 'seconds'
  // },
  // Disable version key for better performance
  versionKey: false
});

// Create compound index for efficient queries
downtimeSchema.index({ ipAddress: 1, timestamp: -1 });

// Static method to count downtimes by IP address
downtimeSchema.statics.countByIpAddress = async function(ipAddress) {
  try {
    return await this.countDocuments({ ipAddress });
  } catch (error) {
    logger.error(`Error counting downtimes for IP ${ipAddress}: ${error.message}`);
    throw error;
  }
};

// Static method to get downtime history with filters
downtimeSchema.statics.getDowntimeHistory = async function(filters = {}) {
  try {
    const query = {};
    
    if (filters.ipAddress && filters.ipAddress !== 'All') {
      query.ipAddress = filters.ipAddress;
    }
    
    if (filters.startDate && filters.endDate) {
      query.timestamp = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    } else if (filters.startDate) {
      query.timestamp = { $gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      query.timestamp = { $lte: new Date(filters.endDate) };
    }
    
    // Use lean() for better performance, limit results if specified
    const limit = filters.limit ? parseInt(filters.limit, 10) : 0;
    
    return await this.find(query)
      .sort({ timestamp: -1 })
      .limit(limit || 0)
      .lean();
  } catch (error) {
    logger.error(`Error fetching downtime history: ${error.message}`);
    throw error;
  }
};

// Static method to create a new downtime record
downtimeSchema.statics.recordDowntime = async function(ipAddress) {
  try {
    const downtimeRecord = new this({
      ipAddress,
      timestamp: new Date(),
      duration: null // Will be updated when IP comes back online
    });
    
    await downtimeRecord.save();
    return downtimeRecord;
  } catch (error) {
    logger.error(`Error recording downtime for IP ${ipAddress}: ${error.message}`);
    throw error;
  }
};

// Static method to update duration when IP comes back online
downtimeSchema.statics.updateDuration = async function(ipAddress) {
  try {
    // Find the latest downtime record without a duration
    const latestDowntime = await this.findOne({ 
      ipAddress, 
      duration: null 
    }).sort({ timestamp: -1 });
    
    if (latestDowntime) {
      // Calculate duration in milliseconds
      const duration = Date.now() - latestDowntime.timestamp.getTime();
      
      // Update the record with the calculated duration
      await this.findByIdAndUpdate(latestDowntime._id, { 
        duration 
      });
      
      return { updated: true, duration };
    }
    
    return { updated: false };
  } catch (error) {
    logger.error(`Error updating downtime duration for IP ${ipAddress}: ${error.message}`);
    throw error;
  }
};

const Downtime = mongoose.model('Downtime', downtimeSchema);

module.exports = Downtime;