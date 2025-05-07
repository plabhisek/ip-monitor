/**
 * View Routes
 * Defines all web view endpoints for the application
 */
const express = require('express');
const router = express.Router();
const IP = require('../models/IP');
const Downtime = require('../models/Downtime');
const logger = require('../utils/logger');

// Dashboard page
router.get('/', async (req, res, next) => {
  try {
    // Get status counts
    const statusCounts = await IP.getStatusCounts();
    
    // Convert to object for easier consumption
    const counts = {};
    statusCounts.forEach(item => {
      counts[item._id] = item.count;
    });
    
    // Ensure all statuses are represented
    const statuses = ['Up', 'Down', 'Unknown'];
    statuses.forEach(status => {
      if (!counts[status]) counts[status] = 0;
    });
    
    // Add total
    counts.Total = statuses.reduce((sum, status) => sum + (counts[status] || 0), 0);
    
    // Get latest IP status for dashboard
    const latestIPs = await IP.find()
      .sort({ lastChecked: -1 })
      .limit(10)
      .lean();
    
    // Get recent downtime events
    const recentDowntime = await Downtime.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
    
    // Get all locations for filtering
    const locations = await IP.distinct('location');
    const filteredLocations = locations.filter(location => location.trim() !== '');
    
    res.render('index', {
      title: 'IP Monitor Dashboard',
      counts,
      latestIPs,
      recentDowntime,
      locations: filteredLocations
    });
  } catch (error) {
    next(error);
  }
});

// IP List page
router.get('/ips', async (req, res, next) => {
  try {
    // Get all locations for filtering
    const locations = await IP.distinct('location');
    const filteredLocations = locations.filter(location => location.trim() !== '');
    
    res.render('ips', {
      title: 'IP Address List',
      locations: filteredLocations,
      filters: req.query
    });
  } catch (error) {
    next(error);
  }
});

// IP Detail page
router.get('/ips/:address', async (req, res, next) => {
  try {
    const ip = await IP.findOne({ address: req.params.address });
    
    if (!ip) {
      return res.status(404).render('error', {
        title: '404 - Not Found',
        message: 'IP address not found',
        error: { status: 404 }
      });
    }
    
    // Get downtime history
    const downtimeHistory = await Downtime.find({ ipAddress: ip.address })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    
    // Format downtime duration
    downtimeHistory.forEach(dt => {
      if (dt.duration) {
        dt.durationFormatted = formatDuration(dt.duration);
      } else {
        dt.durationFormatted = 'Ongoing';
      }
    });
    
    res.render('ip-detail', {
      title: `IP: ${ip.address}`,
      ip: ip.toObject(),
      downtimeHistory
    });
  } catch (error) {
    next(error);
  }
});

// Downtime report page
router.get('/downtime', async (req, res, next) => {
  try {
    // Get all locations for filtering
    const locations = await IP.distinct('location');
    const filteredLocations = locations.filter(location => location.trim() !== '');
    
    // Get all IP addresses for filtering
    const ipAddresses = await IP.find({}, 'address')
      .sort({ address: 1 })
      .lean();
    
    res.render('downtime', {
      title: 'Downtime Reports',
      locations: filteredLocations,
      ips: ipAddresses,
      filters: req.query
    });
  } catch (error) {
    next(error);
  }
});

// Settings page
router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Settings',
    pingInterval: process.env.PING_INTERVAL || 5000,
    workerCount: process.env.WORKER_COUNT || 'auto',
    maxBatchSize: process.env.MAX_BATCH_SIZE || 50
  });
});

// Helper function to format duration
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

module.exports = router;