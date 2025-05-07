/**
 * API Routes
 * Defines all API endpoints for the application
 */
const express = require('express');
const router = express.Router();
const ipController = require('../controllers/ipController');
const downtimeController = require('../controllers/downtimeController');

// IP routes
router.get('/ips', ipController.getAllIPs);
router.get('/ips/status-counts', ipController.getStatusCounts);
router.get('/ips/locations', ipController.getLocations);
router.get('/ips/export', ipController.exportIPs);
router.get('/ips/:address', ipController.getIPByAddress);
router.post('/ips', ipController.createIP);
router.put('/ips/:address', ipController.updateIP);
router.delete('/ips/:address', ipController.deleteIP);

// Import IPs from CSV file
router.post('/ips/import', (req, res, next) => {
  const upload = req.app.locals.upload;
  
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    // Continue to controller after file upload
    ipController.importIPs(req, res, next);
  });
});

// Downtime routes
router.get('/downtime/history', downtimeController.getDowntimeHistory);
router.get('/downtime/statistics', downtimeController.getDowntimeStats);
router.get('/downtime/timeline', downtimeController.getDowntimeTimeline);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

module.exports = router;