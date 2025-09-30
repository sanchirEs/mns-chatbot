import jwt from 'jsonwebtoken';
import config from '../config/environment.js';

/**
 * Advanced Authentication Middleware with Multiple Auth Strategies
 */

/**
 * Verify JWT token with enhanced error handling
 */
export function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN',
        message: 'Please provide a valid authorization token'
      });
    }

    jwt.verify(token, config.SECURITY.JWT_SECRET, (err, decoded) => {
      if (err) {
        let errorResponse = {
          error: 'Authentication failed',
          code: 'INVALID_TOKEN'
        };

        if (err.name === 'TokenExpiredError') {
          errorResponse.code = 'TOKEN_EXPIRED';
          errorResponse.message = 'Token has expired, please login again';
        } else if (err.name === 'JsonWebTokenError') {
          errorResponse.code = 'MALFORMED_TOKEN';
          errorResponse.message = 'Invalid token format';
        } else if (err.name === 'NotBeforeError') {
          errorResponse.code = 'TOKEN_NOT_ACTIVE';
          errorResponse.message = 'Token not active yet';
        }

        return res.status(403).json(errorResponse);
      }

      // Add user info to request
      req.user = {
        id: decoded.id || decoded.sub,
        email: decoded.email,
        role: decoded.role || 'user',
        pharmacyId: decoded.pharmacyId,
        permissions: decoded.permissions || [],
        isAnonymous: false,
        tokenIssuedAt: decoded.iat,
        tokenExpiresAt: decoded.exp
      };

      // Log authentication for security monitoring
      if (config.LOGGING.LEVEL === 'debug') {
        console.log(`User authenticated: ${req.user.id}`);
      }

      next();
    });
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
}

/**
 * Optional authentication - allows both authenticated and anonymous users
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided - create anonymous user
      req.user = {
        id: generateAnonymousUserId(),
        isAnonymous: true,
        permissions: ['read'],
        sessionId: req.headers['x-session-id'] || generateSessionId()
      };
      return next();
    }

    // Verify token if provided
    jwt.verify(token, config.SECURITY.JWT_SECRET, (err, decoded) => {
      if (err) {
        // Invalid token - treat as anonymous
        req.user = {
          id: generateAnonymousUserId(),
          isAnonymous: true,
          permissions: ['read'],
          sessionId: req.headers['x-session-id'] || generateSessionId(),
          authError: err.name
        };
      } else {
        // Valid token
        req.user = {
          id: decoded.id || decoded.sub,
          email: decoded.email,
          role: decoded.role || 'user',
          pharmacyId: decoded.pharmacyId,
          permissions: decoded.permissions || ['read', 'write'],
          isAnonymous: false,
          tokenIssuedAt: decoded.iat,
          tokenExpiresAt: decoded.exp
        };
      }
      next();
    });
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    req.user = {
      id: generateAnonymousUserId(),
      isAnonymous: true,
      permissions: ['read'],
      sessionId: generateSessionId()
    };
    next();
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_USER'
      });
    }

    if (req.user.isAnonymous) {
      return res.status(403).json({
        error: 'This action requires authentication',
        code: 'ANONYMOUS_NOT_ALLOWED'
      });
    }

    const userRole = req.user.role || 'user';
    const roleHierarchy = {
      'user': 1,
      'pharmacist': 2,
      'admin': 3,
      'superadmin': 4
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 999;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: `Insufficient permissions. Required role: ${requiredRole}`,
        code: 'INSUFFICIENT_ROLE',
        userRole,
        requiredRole
      });
    }

    next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_USER'
      });
    }

    if (req.user.isAnonymous && permission !== 'read') {
      return res.status(403).json({
        error: 'This action requires authentication',
        code: 'ANONYMOUS_INSUFFICIENT_PERMISSION'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission) && !userPermissions.includes('all')) {
      return res.status(403).json({
        error: `Permission denied. Required permission: ${permission}`,
        code: 'INSUFFICIENT_PERMISSION',
        required: permission,
        userPermissions
      });
    }

    next();
  };
}

/**
 * API key authentication for service-to-service communication
 */
export function authenticateAPIKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        code: 'NO_API_KEY'
      });
    }

    // Validate API key format
    if (!apiKey.startsWith('ak_') || apiKey.length < 32) {
      return res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT'
      });
    }

    // In production, validate against database
    // For now, check against environment variable
    const validAPIKeys = (process.env.VALID_API_KEYS || '').split(',');
    
    if (!validAPIKeys.includes(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    req.user = {
      id: 'system',
      role: 'system',
      permissions: ['all'],
      isAPIKey: true,
      keyId: apiKey.slice(0, 10) + '...'
    };

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      error: 'API key authentication failed',
      code: 'API_KEY_AUTH_ERROR'
    });
  }
}

/**
 * Session-based authentication for web clients
 */
export function authenticateSession(req, res, next) {
  try {
    const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;

    if (!sessionId) {
      return res.status(401).json({
        error: 'Session ID required',
        code: 'NO_SESSION'
      });
    }

    // Validate session (implement session store in production)
    const sessionData = validateSession(sessionId);
    
    if (!sessionData) {
      return res.status(401).json({
        error: 'Invalid or expired session',
        code: 'INVALID_SESSION'
      });
    }

    req.user = {
      id: sessionData.userId,
      sessionId: sessionId,
      isAnonymous: !sessionData.userId,
      permissions: sessionData.permissions || ['read']
    };

    next();
  } catch (error) {
    console.error('Session authentication error:', error);
    res.status(500).json({
      error: 'Session authentication failed',
      code: 'SESSION_AUTH_ERROR'
    });
  }
}

/**
 * Generate JWT token with enhanced claims
 */
export function generateToken(user, options = {}) {
  const {
    expiresIn = config.SECURITY.JWT_EXPIRES_IN,
    issuer = 'pharmacy-ai-chatbot',
    audience = 'pharmacy-users'
  } = options;

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    pharmacyId: user.pharmacyId,
    permissions: user.permissions || ['read', 'write'],
    iss: issuer,
    aud: audience,
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, config.SECURITY.JWT_SECRET, { 
    expiresIn,
    algorithm: 'HS256'
  });
}

/**
 * Refresh token if it's about to expire
 */
export function refreshTokenIfNeeded(req, res, next) {
  if (!req.user || req.user.isAnonymous) {
    return next();
  }

  const now = Math.floor(Date.now() / 1000);
  const timeToExpiry = req.user.tokenExpiresAt - now;
  const refreshThreshold = 15 * 60; // 15 minutes

  if (timeToExpiry < refreshThreshold) {
    try {
      const newToken = generateToken(req.user);
      res.setHeader('X-Refreshed-Token', newToken);
    } catch (error) {
      console.error('Token refresh error:', error);
      // Don't fail the request, just log the error
    }
  }

  next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
  // Remove server identification
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (config.SERVER.IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
}

/**
 * Utility functions
 */
function generateAnonymousUserId() {
  return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function validateSession(sessionId) {
  // Implement session validation logic
  // For now, return dummy data
  return {
    userId: sessionId.includes('user') ? 'user123' : null,
    permissions: ['read', 'write']
  };
}

/**
 * Authentication strategy selector
 */
export function selectAuthStrategy(strategies = ['jwt']) {
  return (req, res, next) => {
    // Try authentication strategies in order
    const tryNextStrategy = (index = 0) => {
      if (index >= strategies.length) {
        return res.status(401).json({
          error: 'Authentication failed with all strategies',
          code: 'ALL_AUTH_FAILED',
          tried: strategies
        });
      }

      const strategy = strategies[index];
      const originalNext = next;
      const originalEnd = res.end;
      
      // Override next to try next strategy on auth failure
      const strategyNext = (error) => {
        if (error || res.statusCode >= 400) {
          tryNextStrategy(index + 1);
        } else {
          originalNext();
        }
      };

      switch (strategy) {
        case 'jwt':
          authenticateToken(req, res, strategyNext);
          break;
        case 'session':
          authenticateSession(req, res, strategyNext);
          break;
        case 'api_key':
          authenticateAPIKey(req, res, strategyNext);
          break;
        default:
          tryNextStrategy(index + 1);
      }
    };

    tryNextStrategy();
  };
}

export default {
  authenticateToken,
  optionalAuth,
  requireRole,
  requirePermission,
  authenticateAPIKey,
  authenticateSession,
  generateToken,
  refreshTokenIfNeeded,
  securityHeaders,
  selectAuthStrategy
};
