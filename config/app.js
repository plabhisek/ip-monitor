/**
 * Main application file
 * Sets up Express server and middleware
 */
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const config = require('./config/environment');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const apiRoutes = require('./routes/api');
const viewRoutes = require('./routes/views');

// Create Express application
const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure middleware
app.use(morgan('combined', { stream: logger.stream }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Set up routes
app.use('/', viewRoutes);
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    title: '404 - Not Found',
    message: 'The requested page does not exist',
    error: { status: 404 }
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;