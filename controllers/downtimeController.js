/**
 * Downtime Controller
 * Handles API endpoints for downtime data
 */
const Downtime = require('../models/Downtime');
const IP = require('../models/IP');
const logger = require('../utils/logger');

/**
 * Get downtime history with filters
 */
exports.getDowntimeHistory = async (req, res, next) => {
  try {
    const filters = {
      ipAddress: req.query.ipAddress,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit || 100
    };
    
    const downtimes = await Downtime.getDowntimeHistory(filters);
    
    res.json({
      success: true,
      count: downtimes.length,
      data: downtimes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get downtime statistics
 */
exports.getDowntimeStats = async (req, res, next) => {
  try {
    // Time range for stats
    const timeFilter = {};
    if (req.query.startDate) {
      timeFilter.timestamp = { $gte: new Date(req.query.startDate) };
    }
    if (req.query.endDate) {
      if (!timeFilter.timestamp) timeFilter.timestamp = {};
      timeFilter.timestamp.$lte = new Date(req.query.endDate);
    }
    
    // Get IPs with most downtime events
    const topDowntimeIPs = await Downtime.aggregate([
      { $match: timeFilter },
      { $group: {
        _id: "$ipAddress",
        count: { $sum: 1 },
        totalDuration: { $sum: { $ifNull: ["$duration", 0] } }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get IP details for the results
    const ipAddresses = topDowntimeIPs.map(item => item._id);
    const ipDetails = await IP.find({ address: { $in: ipAddresses }}, 'address location');
    
    // Create a map for quick lookup
    const ipMap = {};
    ipDetails.forEach(ip => {
      ipMap[ip.address] = ip.toObject();
    });
    
    // Combine data
    const enrichedData = topDowntimeIPs.map(item => ({
      address: item._id,
      location: (ipMap[item._id] && ipMap[item._id].location) || '',
      downtimeCount: item.count,
      totalDurationMs: item.totalDuration,
      averageDurationMs: item.count > 0 ? (item.totalDuration / item.count) : 0
    }));
    
    // Get total downtime events
    const totalDowntime = await Downtime.countDocuments(timeFilter);
    
    // Get average duration
    const durationStats = await Downtime.aggregate([
      { $match: { ...timeFilter, duration: { $ne: null } } },
      { $group: {
        _id: null,
        averageDuration: { $avg: "$duration" },
        maxDuration: { $max: "$duration" },
        minDuration: { $min: "$duration" }
      }}
    ]);
    
    const stats = {
      totalEvents: totalDowntime,
      durationStats: durationStats.length > 0 ? {
        averageMs: durationStats[0].averageDuration,
        maxMs: durationStats[0].maxDuration,
        minMs: durationStats[0].minDuration
      } : { averageMs: 0, maxMs: 0, minMs: 0 },
      topIPs: enrichedData
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get downtime timeline data for charts
 */
exports.getDowntimeTimeline = async (req, res, next) => {
  try {
    // Default to last 24 hours if no date range specified
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate ? 
      new Date(req.query.startDate) : 
      new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
    
    // Calculate time interval based on date range
    const rangeHours = (endDate - startDate) / (1000 * 60 * 60);
    
    // Choose grouping interval based on range
    let groupByFormat;
    let intervalName;
    
    if (rangeHours <= 24) {
      // For ranges <= 24 hours, group by hour
      groupByFormat = { $dateToString: { format: "%Y-%m-%d %H:00", date: "$timestamp" } };
      intervalName = 'hour';
    } else if (rangeHours <= 168) {
      // For ranges <= 7 days, group by day
      groupByFormat = { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } };
      intervalName = 'day';
    } else {
      // For longer ranges, group by week
      groupByFormat = { 
        $dateToString: { 
          format: "%Y-%U", // Year and week number
          date: "$timestamp" 
        } 
      };
      intervalName = 'week';
    }
    
    // Filter by time range and optional IP address
    const matchFilter = {
      timestamp: { $gte: startDate, $lte: endDate }
    };
    
    if (req.query.ipAddress && req.query.ipAddress !== 'All') {
      matchFilter.ipAddress = req.query.ipAddress;
    }
    
    // Aggregate downtime events by time interval
    const timeline = await Downtime.aggregate([
      { $match: matchFilter },
      { $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        avgDuration: { $avg: { $ifNull: ["$duration", 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Format results for chart display
    const chartData = timeline.map(item => ({
      interval: item._id,
      count: item.count,
      avgDurationMs: Math.round(item.avgDuration)
    }));
    
    res.json({
      success: true,
      meta: {
        interval: intervalName,
        startDate: startDate,
        endDate: endDate
      },
      data: chartData
    });
  } catch (error) {
    next(error);
  }
};