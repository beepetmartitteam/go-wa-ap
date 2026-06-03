const express = require('express');
const http = require('http');
require('dotenv').config();

const config = require('./config/database');
const logger = require('./utils/logger');
const { startCronJobs } = require('./utils/cron');
const { auth: authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const webhookController = require('./controllers/webhookController');

// Import routes
const authRoutes = require('./routes/auth');
const simpleAuthRoutes = require('./routes/simpleAuth');
const userRoutes = require('./routes/users');
const phoneRoutes = require('./routes/phones');
const messageRoutes = require('./routes/messages');
const webhookRoutes = require('./routes/webhooks');
const statsRoutes = require('./routes/stats');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Start cron jobs
startCronJobs();

// GOWA message polling disabled - using webhooks instead
// webhookController.startMessagePolling();

// Initialize broadcast worker after Socket.IO is defined
const { setSocketIO } = require('./workers/broadcastWorker');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ['http://localhost:3002', 'http://localhost:3000', 'http://127.0.0.1:3002', 'http://127.0.0.1:3000'];
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, Referer, Referrer-Policy');
  res.header('Access-Control-Expose-Headers', 'X-Total-Count');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/simple-auth', simpleAuthRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/phones', authMiddleware, phoneRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);
app.use('/api/contacts', authMiddleware, require('./routes/contacts'));
app.use('/api/categories', authMiddleware, require('./routes/categories'));
app.use('/api/templates', authMiddleware, require('./routes/templates'));
app.use('/api/schedules', authMiddleware, require('./routes/schedules'));
app.use('/api/external-whatsapp', authMiddleware, require('./routes/externalWhatsApp'));
app.use('/api/broadcasts', authMiddleware, require('./routes/broadcasts'));
app.use('/api/broadcast-templates', authMiddleware, require('./routes/broadcastTemplates'));
app.use('/api/webhooks', authMiddleware, webhookRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);
app.use('/api/auto-reply', authMiddleware, require('./routes/autoReply'));

// User Message API (v1) - Public API with API Key authentication
app.use('/v1', require('./routes/userMessage'));

// Webhook endpoints (no auth required)
app.use('/webhook', require('./routes/publicWebhook'));

// WebSocket for real-time updates
const io = require('socket.io')(server, {
  cors: {
    origin: ["http://localhost:3002", "http://localhost:3000", "http://127.0.0.1:3002", "http://127.0.0.1:3000","http://51.79.188.203:3001"],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"]
  }
});

// Initialize broadcast worker with Socket.IO
setSocketIO(io);

io.on('connection', (socket) => {
  logger.info('WebSocket client connected');
  
  socket.on('join-user-room', (userId) => {
    socket.join('user-' + userId);
    logger.info('User ' + userId + ' joined room');
  });
  
  socket.on('join-phone-room', (phoneId) => {
    socket.join('phone-' + phoneId);
    logger.info('Client joined phone room: ' + phoneId);
  });
  
  socket.on('disconnect', () => {
    logger.info('WebSocket client disconnected');
  });
});

// Phone status update function
const emitPhoneStatusUpdate = (phoneId, isConnected, userId) => {
  io.to('user-' + userId).emit('phone-status-update', {
    phoneId: phoneId,
    isConnected: isConnected,
    timestamp: new Date().toISOString()
  });
  
  logger.info('Phone status update emitted:', {
    phoneId: phoneId,
    isConnected: isConnected,
    userId: userId
  });
};

// Make function available globally
global.emitPhoneStatusUpdate = emitPhoneStatusUpdate;

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 8090;

server.listen(PORT, () => {
  logger.info('Server running on port ' + PORT);
});

module.exports = app;
