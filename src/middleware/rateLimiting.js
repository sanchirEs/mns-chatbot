import rateLimit from 'express-rate-limit';
import config from '../config/environment.js';

/**
 * Advanced Rate Limiting Middleware with Multiple Strategies
 * Implements sliding window, token bucket, and intelligent rate limiting
 */

/**
 * Memory store for rate limiting (use Redis in production)
 */
class MemoryStore {
  constructor() {
    this.store = new Map();
    this.cleanup();
  }

  async increment(key) {
    const now = Date.now();
    const record = this.store.get(key) || { count: 0, resetTime: now + this.windowMs };
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + this.windowMs;
    } else {
      record.count++;
    }
    
    this.store.set(key, record);
    
    return {
      totalHits: record.count,
      resetTime: new Date(record.resetTime)
    };
  }

  async decrement(key) {
    const record = this.store.get(key);
    if (record && record.count > 0) {
      record.count--;
      this.store.set(key, record);
    }
  }

  async resetKey(key) {
    this.store.delete(key);
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.store.entries()) {
        if (now > record.resetTime) {
          this.store.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }
}

const memoryStore = new MemoryStore();

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT.WINDOW_MS,
  max: config.RATE_LIMIT.MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(config.RATE_LIMIT.WINDOW_MS / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: config.RATE_LIMIT.SKIP_SUCCESSFUL,
  keyGenerator: (req) => {
    // Use user ID for authenticated users, IP for others
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for ${req.user?.id || req.ip}`);
    res.status(429).json({
      error: 'Too many requests, please slow down',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(config.RATE_LIMIT.WINDOW_MS / 1000),
      limit: config.RATE_LIMIT.MAX_REQUESTS,
      window: config.RATE_LIMIT.WINDOW_MS / 1000
    });
  }
});

/**
 * Chat-specific rate limiter with intelligent scaling
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Authenticated users get higher limits
    if (req.user?.isAnonymous === false) {
      return config.RATE_LIMIT.CHAT_MAX_REQUESTS;
    }
    // Anonymous users get lower limits
    return Math.floor(config.RATE_LIMIT.CHAT_MAX_REQUESTS / 2);
  },
  message: {
    error: 'Too many chat messages, please wait a moment',
    code: 'CHAT_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    return req.user?.id || `${req.ip}_chat`;
  },
  handler: (req, res) => {
    const isAnonymous = req.user?.isAnonymous !== false;
    res.status(429).json({
      error: 'Chat rate limit exceeded',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      message: isAnonymous 
        ? 'Anonymous users have lower rate limits. Consider signing up for higher limits.'
        : 'Please slow down your messages',
      retryAfter: 60,
      suggestion: isAnonymous ? 'Create an account for higher limits' : 'Wait before sending next message'
    });
  }
});

/**
 * Strict limiter for expensive operations
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.RATE_LIMIT.STRICT_MAX_REQUESTS,
  message: {
    error: 'Too many requests for this operation',
    code: 'STRICT_RATE_LIMIT_EXCEEDED'
  },
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    console.warn(`Strict rate limit exceeded for ${req.user?.id || req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Operation rate limit exceeded',
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      operation: req.path,
      retryAfter: 60
    });
  }
});

/**
 * Progressive rate limiter (increases penalties for repeat offenders)
 */
export const progressiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    const violations = getViolationCount(req.user?.id || req.ip);
    const baseLimit = 50;
    
    // Reduce limit for repeat offenders
    return Math.max(5, baseLimit - (violations * 10));
  },
  handler: (req, res) => {
    const key = req.user?.id || req.ip;
    incrementViolationCount(key);
    
    res.status(429).json({
      error: 'Progressive rate limit exceeded',
      code: 'PROGRESSIVE_RATE_LIMIT',
      message: 'Repeated violations result in stricter limits',
      retryAfter: 900 // 15 minutes
    });
  }
});

/**
 * Order creation rate limiter
 */
export const orderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Max 3 orders per 5 minutes
  message: {
    error: 'Too many order attempts',
    code: 'ORDER_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    // Always use user ID for orders
    return req.user?.id || `${req.ip}_orders`;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Order creation rate limit exceeded',
      code: 'ORDER_RATE_LIMIT_EXCEEDED',
      message: 'Please wait before creating another order',
      retryAfter: 300,
      contactSupport: 'If you need to place urgent orders, please contact support'
    });
  }
});

/**
 * Search rate limiter
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    error: 'Too many search requests',
    code: 'SEARCH_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    return `${req.user?.id || req.ip}_search`;
  }
});

/**
 * Registration/Authentication rate limiter
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Please wait before trying again',
      retryAfter: 900,
      securityNote: 'Multiple failed attempts may indicate malicious activity'
    });
  }
});

/**
 * Dynamic rate limiter based on server load
 */
export function dynamicLimiter(baseLimit = 100) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: (req) => {
      const serverLoad = getServerLoad();
      const adjustmentFactor = serverLoad > 0.8 ? 0.5 : serverLoad > 0.6 ? 0.7 : 1;
      return Math.floor(baseLimit * adjustmentFactor);
    },
    message: {
      error: 'Server under high load, rate limit reduced',
      code: 'DYNAMIC_RATE_LIMIT_EXCEEDED'
    },
    handler: (req, res) => {
      const load = getServerLoad();
      res.status(429).json({
        error: 'Rate limit exceeded due to high server load',
        code: 'DYNAMIC_RATE_LIMIT_EXCEEDED',
        serverLoad: Math.round(load * 100) + '%',
        retryAfter: 60
      });
    }
  });
}

/**
 * IP-based rate limiter for suspicious IPs
 */
export function ipBasedLimiter() {
  return (req, res, next) => {
    const ip = req.ip;
    
    if (isSuspiciousIP(ip)) {
      return strictLimiter(req, res, next);
    }
    
    if (isTrustedIP(ip)) {
      // Trusted IPs get higher limits
      return next();
    }
    
    return apiLimiter(req, res, next);
  };
}

/**
 * Token bucket rate limiter for burst handling
 */
export class TokenBucketLimiter {
  constructor(capacity = 10, refillRate = 1) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  middleware() {
    return (req, res, next) => {
      const now = Date.now();
      const timePassed = (now - this.lastRefill) / 1000;
      
      // Refill tokens
      this.tokens = Math.min(this.capacity, this.tokens + (timePassed * this.refillRate));
      this.lastRefill = now;
      
      if (this.tokens >= 1) {
        this.tokens--;
        next();
      } else {
        res.status(429).json({
          error: 'Token bucket rate limit exceeded',
          code: 'TOKEN_BUCKET_EXCEEDED',
          retryAfter: Math.ceil((1 - this.tokens) / this.refillRate)
        });
      }
    };
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowLimiter {
  constructor(windowSize = 60000, maxRequests = 100) {
    this.windowSize = windowSize;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  middleware() {
    return (req, res, next) => {
      const key = req.user?.id || req.ip;
      const now = Date.now();
      const windowStart = now - this.windowSize;
      
      // Clean old requests
      const userRequests = this.requests.get(key) || [];
      const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);
      
      if (recentRequests.length >= this.maxRequests) {
        const oldestRequest = Math.min(...recentRequests);
        const retryAfter = Math.ceil((oldestRequest + this.windowSize - now) / 1000);
        
        return res.status(429).json({
          error: 'Sliding window rate limit exceeded',
          code: 'SLIDING_WINDOW_EXCEEDED',
          retryAfter
        });
      }
      
      recentRequests.push(now);
      this.requests.set(key, recentRequests);
      
      next();
    };
  }
}

/**
 * Utility Functions
 */

// Violation tracking for progressive limiting
const violations = new Map();

function getViolationCount(key) {
  return violations.get(key) || 0;
}

function incrementViolationCount(key) {
  const current = violations.get(key) || 0;
  violations.set(key, current + 1);
  
  // Reset after 1 hour
  setTimeout(() => {
    violations.delete(key);
  }, 60 * 60 * 1000);
}

// Server load monitoring (simplified)
function getServerLoad() {
  try {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    return usedMem / totalMem;
  } catch (error) {
    return 0.5; // Default moderate load
  }
}

// IP reputation checking
const suspiciousIPs = new Set();
const trustedIPs = new Set(['127.0.0.1', '::1']);

function isSuspiciousIP(ip) {
  return suspiciousIPs.has(ip);
}

function isTrustedIP(ip) {
  return trustedIPs.has(ip);
}

function markIPSuspicious(ip, reason) {
  suspiciousIPs.add(ip);
  console.warn(`IP ${ip} marked as suspicious: ${reason}`);
  
  // Auto-remove after 24 hours
  setTimeout(() => {
    suspiciousIPs.delete(ip);
  }, 24 * 60 * 60 * 1000);
}

/**
 * Rate limit bypass for emergency situations
 */
export function emergencyBypass(req, res, next) {
  const bypassKey = req.headers['x-emergency-bypass'];
  const validBypassKey = process.env.EMERGENCY_BYPASS_KEY;
  
  if (bypassKey && validBypassKey && bypassKey === validBypassKey) {
    console.warn(`Emergency rate limit bypass used by ${req.user?.id || req.ip}`);
    return next();
  }
  
  next();
}

/**
 * Rate limit monitoring and alerting
 */
export function rateLimitMonitor(req, res, next) {
  const key = req.user?.id || req.ip;
  
  // Log high-frequency users
  if (req.rateLimit?.remaining < 5) {
    console.warn(`User ${key} approaching rate limit: ${req.rateLimit.remaining} remaining`);
  }
  
  // Alert on rate limit violations
  res.on('finish', () => {
    if (res.statusCode === 429) {
      console.warn(`Rate limit violation: ${key} - ${req.path}`);
      
      // Could send to monitoring system here
      if (process.env.NODE_ENV === 'production') {
        // sendToMonitoringSystem({ type: 'rate_limit_violation', key, path: req.path });
      }
    }
  });
  
  next();
}

export default {
  apiLimiter,
  chatLimiter,
  strictLimiter,
  progressiveLimiter,
  orderLimiter,
  searchLimiter,
  authLimiter,
  dynamicLimiter,
  ipBasedLimiter,
  TokenBucketLimiter,
  SlidingWindowLimiter,
  emergencyBypass,
  rateLimitMonitor,
  markIPSuspicious
};
