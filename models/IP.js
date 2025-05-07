/**
 * IP Model
 * Defines the schema and methods for IP addresses
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Validate IP address format
function validateIPAddress(address) {
  // Basic IPv4 validation
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Pattern.test(address)) return false;
  
  // Check each octet is within range
  return address.split('.').every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

// IP Schema definition with optimized field types and validation
const ipSchema = new mongoose.Schema({
  address: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    validate: {
      validator: validateIPAddress,
      message: props => `${props.value} is not a valid IPv4 address`
    }
  },
  location: { 
    type: String, 
    default: '',
    trim: true,
    index: true
  },
  status: { 
    type: String, 
    default: 'Unknown',
    enum: ['Up', 'Down', 'Unknown'],
    index: true
  },
  downtimeCount: { 
    type: Number, 
    default: 0,
    min: 0
  },
  lastDowntime: { 
    type: Date, 
    default: null 
  },
  lastChecked: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  responseTime: {
    type: Number,
    default: null,
    min: 0
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true 
  }
}, {
  // Add timestamp fields (updatedAt)
  timestamps: true,
  // Use this for better memory usage
  versionKey: false
});

// Create compound indexes for more efficient queries
ipSchema.index({ status: 1, lastChecked: -1 });
ipSchema.index({ createdAt: -1 });

// Instance method to get downtime history for an IP
ipSchema.methods.getDowntimeHistory = async function(limit = 10) {
  try {
    const Downtime = mongoose.model('Downtime');
    return await Downtime.find({ ipAddress: this.address })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    logger.error(`Error fetching downtime history for IP ${this.address}: ${error.message}`);
    throw error;
  }
};

// Static method to get status counts
ipSchema.statics.getStatusCounts = async function() {
  try {
    return await this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
  } catch (error) {
    logger.error(`Error getting status counts: ${error.message}`);
    throw error;
  }
};

// Static method to get IPs with filters
ipSchema.statics.findWithFilters = async function(filters = {}) {
  try {
    const query = {};
    
    // Apply filters if provided
    if (filters.status && filters.status !== 'All') {
      query.status = filters.status;
    }
    
    if (filters.location && filters.location !== 'All') {
      query.location = filters.location;
    }
    
    if (filters.search) {
      query.address = { $regex: filters.search, $options: 'i' };
    }
    
    // If since parameter exists, only return IPs updated after that timestamp
    if (filters.since) {
      query.lastChecked = { $gt: new Date(parseInt(filters.since)) };
    }
    
    // Use lean() for better performance
    return await this.find(query).sort({ address: 1 }).lean();
  } catch (error) {
    logger.error(`Error finding IPs with filters: ${error.message}`);
    throw error;
  }
};

// Static method to handle bulk IP status updates efficiently
ipSchema.statics.bulkUpdateStatus = async function(updates) {
  try {
    if (!updates || updates.length === 0) return { matchedCount: 0, modifiedCount: 0 };
    
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { address: update.address },
        update: {
          $set: {
            status: update.alive ? 'Up' : 'Down',
            lastChecked: new Date(),
            responseTime: update.time || null
          },
          $inc: update.alive ? {} : { downtimeCount: 1 },
          $setOnInsert: update.alive ? {} : { lastDowntime: new Date() }
        }
      }
    }));
    
    return await this.bulkWrite(bulkOps, { ordered: false });
  } catch (error) {
    logger.error(`Error during bulk status update: ${error.message}`);
    throw error;
  }
};

const IP = mongoose.model('IP', ipSchema);

module.exports = IP;