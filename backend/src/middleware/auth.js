const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { redis } = require('../config/database');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7);

    // Check blacklist (optional)
    try {
      const isBlacklisted = await redis.exists(`blacklist:${token}`);

      if (isBlacklisted) {
        return res.status(401).json({
          error: 'Token has been revoked',
          message: 'Please login again'
        });
      }
    } catch (redisError) {
      logger.warn('Redis blacklist check failed:', redisError);
    }

    // Decode without verification to get user id
    const decodedToken = jwt.decode(token);

    if (!decodedToken || !decodedToken.id) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token structure is invalid'
      });
    }

    // ALWAYS load fresh user from database
    const user = await User.findById(decodedToken.id);

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'Invalid token'
      });
    }

    if (!user.jwt_secret) {
      logger.error('User JWT secret is missing', {
        userId: user.id
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User secret not configured'
      });
    }

    logger.debug('JWT verification', {
      userId: user.id,
      username: user.username,
      hasJwtSecret: !!user.jwt_secret
    });

    // Verify token using user's secret
    jwt.verify(
      token,
      user.jwt_secret,
      {
        issuer: 'chatflow',
        audience: 'evolution-client'
      },
      (err, decoded) => {
        if (err) {
          logger.warn('Token verification failed:', {
            userId: user.id,
            error: err.message,
            name: err.name
          });

          return res.status(401).json({
            error: 'Token is not valid',
            message: err.message
          });
        }

        req.user = decoded;
        req.userDetails = user;

        next();
      }
    );
  } catch (error) {
    logger.error('Auth middleware error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

// API Key authentication middleware
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');

    if (!apiKey) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No API key provided'
      });
    }

    const user = await User.findByApiKey(apiKey);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Authentication failed'
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email
    };

    req.userDetails = user;

    next();
  } catch (error) {
    logger.error('API Key auth error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

// Phone ownership middleware
const phoneOwnership = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const phoneId = req.params.phoneId;

    const query = `
      SELECT id
      FROM phone_numbers
      WHERE id = $1
      AND user_id = $2
    `;

    const { db } = require('../config/database');

    const phone = await db.getOne(query, [phoneId, userId]);

    if (!phone) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Phone not found or access denied'
      });
    }

    next();
  } catch (error) {
    logger.error('Phone ownership error:', error);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

module.exports = {
  auth: authMiddleware,
  authenticateToken: authMiddleware,
  apiKey: apiKeyAuth,
  phoneOwnership
};