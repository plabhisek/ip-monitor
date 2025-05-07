/**
 * IP Controller
 * Handles API endpoints for IP management
 */
const IP = require('../models/IP');
const csvService = require('../services/csvService');
const logger = require('../utils/logger');

/**
 * Get all IP addresses with optional filtering
 */
exports.getAllIPs = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      location: req.query.location,
      search: req.query.search,
      since: req.query.since
    };
    
    const ips = await IP.findWithFilters(filters);
    
    res.json({
      success: true,
      count: ips.length,
      data: ips
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get status counts for dashboard
 */
exports.getStatusCounts = async (req, res, next) => {
  try {
    const counts = await IP.getStatusCounts();
    
    // Convert to object for easier consumption
    const result = {};
    counts.forEach(item => {
      result[item._id] = item.count;
    });
    
    // Ensure all statuses are represented
    const statuses = ['Up', 'Down', 'Unknown'];
    statuses.forEach(status => {
      if (!result[status]) result[status] = 0;
    });
    
    // Add total
    result.Total = statuses.reduce((sum, status) => sum + (result[status] || 0), 0);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single IP by address
 */
exports.getIPByAddress = async (req, res, next) => {
  try {
    const ip = await IP.findOne({ address: req.params.address });
    
    if (!ip) {
      return res.status(404).json({
        success: false,
        message: 'IP address not found'
      });
    }
    
    // Get downtime history for this IP
    const history = await ip.getDowntimeHistory(10);
    
    res.json({
      success: true,
      data: {
        ...ip.toObject(),
        downtimeHistory: history
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new IP
 */
exports.createIP = async (req, res, next) => {
  try {
    // Check if IP already exists
    const existing = await IP.findOne({ address: req.body.address });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'IP address already exists'
      });
    }
    
    // Create new IP
    const ip = new IP({
      address: req.body.address,
      location: req.body.location || ''
    });
    
    await ip.save();
    
    res.status(201).json({
      success: true,
      data: ip
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an IP
 */
exports.updateIP = async (req, res, next) => {
  try {
    // Don't allow changing the IP address itself
    delete req.body.address;
    
    // Find and update
    const ip = await IP.findOneAndUpdate(
      { address: req.params.address },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!ip) {
      return res.status(404).json({
        success: false,
        message: 'IP address not found'
      });
    }
    
    res.json({
      success: true,
      data: ip
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an IP
 */
exports.deleteIP = async (req, res, next) => {
  try {
    const result = await IP.deleteOne({ address: req.params.address });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'IP address not found'
      });
    }
    
    res.json({
      success: true,
      message: 'IP address deleted'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Import IPs from CSV
 */
exports.importIPs = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    // Process CSV
    const filePath = req.file.path;
    const results = await csvService.importIPsFromCSV(filePath);
    
    res.json({
      success: true,
      message: `Imported ${results.imported} IPs, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export IPs to CSV
 */
exports.exportIPs = async (req, res, next) => {
  try {
    // Get filters from query params
    const filters = {
      status: req.query.status,
      location: req.query.location,
      search: req.query.search
    };
    
    // Get IPs with filters
    const ips = await IP.findWithFilters(filters);
    
    // Generate CSV
    const csvData = await csvService.generateIPsCSV(ips);
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ip-addresses.csv');
    
    // Send CSV data
    res.send(csvData);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all unique locations for filtering
 */
exports.getLocations = async (req, res, next) => {
  try {
    const locations = await IP.distinct('location');
    
    // Filter out empty locations
    const filteredLocations = locations.filter(location => location.trim() !== '');
    
    res.json({
      success: true,
      count: filteredLocations.length,
      data: filteredLocations
    });
  } catch (error) {
    next(error);
  }
};