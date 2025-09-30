import validator from 'validator';
import config from '../config/environment.js';

/**
 * Advanced Request Validation Middleware
 * Provides comprehensive input validation with security focus
 */

/**
 * Validate chat request with comprehensive checks
 */
export function validateChatRequest(req, res, next) {
  const { message, sessionId, userId, metadata } = req.body;
  const errors = [];
  const warnings = [];

  // Validate message
  if (!message || typeof message !== 'string') {
    errors.push('Message is required and must be a string');
  } else {
    const trimmedMessage = message.trim();
    
    if (trimmedMessage.length === 0) {
      errors.push('Message cannot be empty');
    } else if (trimmedMessage.length > config.CONVERSATION.MAX_MESSAGE_LENGTH) {
      errors.push(`Message too long (max ${config.CONVERSATION.MAX_MESSAGE_LENGTH} characters)`);
    }

    // Security checks
    if (containsSuspiciousContent(trimmedMessage)) {
      warnings.push('Message contains potentially suspicious content');
    }

    if (containsPII(trimmedMessage)) {
      warnings.push('Message may contain personal identifiable information');
    }
  }

  // Validate sessionId
  if (sessionId) {
    if (!validator.isUUID(sessionId) && !isValidSessionId(sessionId)) {
      errors.push('Invalid session ID format');
    }
  }

  // Validate userId for authenticated requests
  if (userId && !req.user?.isAnonymous) {
    if (userId !== req.user?.id) {
      errors.push('User ID mismatch');
    }
  }

  // Validate metadata
  if (metadata && typeof metadata !== 'object') {
    errors.push('Metadata must be an object');
  } else if (metadata) {
    const validatedMetadata = validateMetadata(metadata);
    if (validatedMetadata.errors.length > 0) {
      errors.push(...validatedMetadata.errors);
    }
    req.body.metadata = validatedMetadata.cleaned;
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  }

  // Sanitize and attach cleaned data
  req.body.message = validator.escape(message.trim());
  req.validationWarnings = warnings;

  next();
}

/**
 * Validate order request with comprehensive business logic
 */
export function validateOrderRequest(req, res, next) {
  const { items, shippingAddress, notes, metadata } = req.body;
  const errors = [];

  // Validate items array
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Items array is required and cannot be empty');
  } else {
    const itemValidation = validateOrderItems(items);
    if (itemValidation.errors.length > 0) {
      errors.push(...itemValidation.errors);
    }
    req.body.items = itemValidation.validatedItems;
  }

  // Validate shipping address if provided
  if (shippingAddress) {
    const addressValidation = validateAddress(shippingAddress);
    if (addressValidation.errors.length > 0) {
      errors.push(...addressValidation.errors.map(e => `Shipping address: ${e}`));
    }
    req.body.shippingAddress = addressValidation.cleaned;
  }

  // Validate notes
  if (notes) {
    if (typeof notes !== 'string') {
      errors.push('Notes must be a string');
    } else if (notes.length > 1000) {
      errors.push('Notes cannot exceed 1000 characters');
    } else {
      req.body.notes = validator.escape(notes.trim());
    }
  }

  // Validate metadata
  if (metadata) {
    const metadataValidation = validateMetadata(metadata);
    if (metadataValidation.errors.length > 0) {
      errors.push(...metadataValidation.errors);
    }
    req.body.metadata = metadataValidation.cleaned;
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Order validation failed',
      code: 'ORDER_VALIDATION_ERROR',
      details: errors
    });
  }

  next();
}

/**
 * Validate UUID parameter
 */
export function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!value) {
      return res.status(400).json({
        error: `${paramName} is required`,
        code: 'MISSING_PARAMETER'
      });
    }

    if (!validator.isUUID(value)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format`,
        code: 'INVALID_UUID',
        parameter: paramName,
        value: value
      });
    }

    next();
  };
}

/**
 * Validate search request parameters
 */
export function validateSearchRequest(req, res, next) {
  const { q, query, category, limit, threshold } = req.query;
  const errors = [];

  // Validate search query
  const searchQuery = q || query;
  if (!searchQuery) {
    errors.push('Search query (q or query) is required');
  } else if (typeof searchQuery !== 'string') {
    errors.push('Search query must be a string');
  } else if (searchQuery.trim().length < 2) {
    errors.push('Search query must be at least 2 characters');
  } else if (searchQuery.length > 200) {
    errors.push('Search query cannot exceed 200 characters');
  }

  // Validate category filter
  if (category) {
    const validCategories = ['medicine', 'vitamins', 'supplements', 'equipment', 'personal-care'];
    if (!validCategories.includes(category.toLowerCase())) {
      errors.push(`Invalid category. Valid options: ${validCategories.join(', ')}`);
    }
  }

  // Validate limit
  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > config.SEARCH.MAX_LIMIT) {
      errors.push(`Limit must be between 1 and ${config.SEARCH.MAX_LIMIT}`);
    }
    req.query.limit = limitNum;
  }

  // Validate similarity threshold
  if (threshold) {
    const thresholdNum = parseFloat(threshold);
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
      errors.push('Threshold must be between 0 and 1');
    }
    req.query.threshold = thresholdNum;
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Search validation failed',
      code: 'SEARCH_VALIDATION_ERROR',
      details: errors
    });
  }

  // Sanitize query
  req.query.q = validator.escape(searchQuery.trim());
  req.query.query = req.query.q;

  next();
}

/**
 * Validate email address
 */
export function validateEmail(req, res, next) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'Email is required',
      code: 'MISSING_EMAIL'
    });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({
      error: 'Invalid email format',
      code: 'INVALID_EMAIL'
    });
  }

  req.body.email = validator.normalizeEmail(email);
  next();
}

/**
 * Validate pagination parameters
 */
export function validatePagination(req, res, next) {
  const { page, limit, offset } = req.query;
  const errors = [];

  if (page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.push('Page must be a positive integer');
    } else {
      req.query.page = pageNum;
    }
  }

  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      errors.push('Limit must be between 1 and 100');
    } else {
      req.query.limit = limitNum;
    }
  }

  if (offset) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      errors.push('Offset must be a non-negative integer');
    } else {
      req.query.offset = offsetNum;
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Pagination validation failed',
      code: 'PAGINATION_ERROR',
      details: errors
    });
  }

  next();
}

/**
 * Validate date range parameters
 */
export function validateDateRange(req, res, next) {
  const { startDate, endDate, dateRange } = req.query;
  const errors = [];

  if (startDate) {
    if (!validator.isISO8601(startDate)) {
      errors.push('Start date must be in ISO8601 format');
    } else {
      req.query.startDate = new Date(startDate);
    }
  }

  if (endDate) {
    if (!validator.isISO8601(endDate)) {
      errors.push('End date must be in ISO8601 format');
    } else {
      req.query.endDate = new Date(endDate);
    }
  }

  if (req.query.startDate && req.query.endDate) {
    if (req.query.startDate >= req.query.endDate) {
      errors.push('Start date must be before end date');
    }

    const daysDiff = (req.query.endDate - req.query.startDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 365) {
      errors.push('Date range cannot exceed 365 days');
    }
  }

  if (dateRange) {
    const validRanges = ['today', 'yesterday', 'last7days', 'last30days', 'last90days'];
    if (!validRanges.includes(dateRange)) {
      errors.push(`Invalid date range. Valid options: ${validRanges.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Date range validation failed',
      code: 'DATE_VALIDATION_ERROR',
      details: errors
    });
  }

  next();
}

/**
 * Generic JSON schema validator
 */
export function validateSchema(schema) {
  return (req, res, next) => {
    try {
      const validationResult = validateAgainstSchema(req.body, schema);
      
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Schema validation failed',
          code: 'SCHEMA_VALIDATION_ERROR',
          details: validationResult.errors,
          schema: schema.title || 'Unknown schema'
        });
      }

      req.body = validationResult.cleaned;
      next();
    } catch (error) {
      console.error('Schema validation error:', error);
      res.status(500).json({
        error: 'Validation service error',
        code: 'VALIDATION_SERVICE_ERROR'
      });
    }
  };
}

/**
 * Helper Functions
 */

/**
 * Validate order items structure
 */
function validateOrderItems(items) {
  const errors = [];
  const validatedItems = [];

  items.forEach((item, index) => {
    const itemErrors = [];

    if (!item.itemId) {
      itemErrors.push(`Item ${index + 1}: itemId is required`);
    } else if (!validator.isUUID(item.itemId)) {
      itemErrors.push(`Item ${index + 1}: invalid itemId format`);
    }

    if (!item.quantity) {
      itemErrors.push(`Item ${index + 1}: quantity is required`);
    } else if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      itemErrors.push(`Item ${index + 1}: quantity must be a positive integer`);
    } else if (item.quantity > 100) {
      itemErrors.push(`Item ${index + 1}: quantity cannot exceed 100`);
    }

    if (itemErrors.length === 0) {
      validatedItems.push({
        itemId: item.itemId,
        quantity: item.quantity
      });
    } else {
      errors.push(...itemErrors);
    }
  });

  return { errors, validatedItems };
}

/**
 * Validate shipping address
 */
function validateAddress(address) {
  const errors = [];
  const cleaned = {};

  if (!address.street || typeof address.street !== 'string') {
    errors.push('Street address is required');
  } else {
    cleaned.street = validator.escape(address.street.trim());
  }

  if (!address.city || typeof address.city !== 'string') {
    errors.push('City is required');
  } else {
    cleaned.city = validator.escape(address.city.trim());
  }

  if (!address.country || typeof address.country !== 'string') {
    errors.push('Country is required');
  } else {
    cleaned.country = validator.escape(address.country.trim());
  }

  if (address.postalCode) {
    if (typeof address.postalCode !== 'string') {
      errors.push('Postal code must be a string');
    } else {
      cleaned.postalCode = validator.escape(address.postalCode.trim());
    }
  }

  if (address.state) {
    cleaned.state = validator.escape(address.state.trim());
  }

  return { errors, cleaned };
}

/**
 * Validate metadata object
 */
function validateMetadata(metadata) {
  const errors = [];
  const cleaned = {};

  // Check for dangerous keys
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(metadata)) {
    if (dangerousKeys.includes(key)) {
      errors.push(`Dangerous metadata key: ${key}`);
      continue;
    }

    // Sanitize string values
    if (typeof metadata[key] === 'string') {
      cleaned[key] = validator.escape(metadata[key]);
    } else if (typeof metadata[key] === 'object' && metadata[key] !== null) {
      // Recursively validate nested objects (limit depth)
      if (Object.keys(metadata).length < 10) {
        const nested = validateMetadata(metadata[key]);
        if (nested.errors.length > 0) {
          errors.push(`Nested metadata error in ${key}: ${nested.errors.join(', ')}`);
        } else {
          cleaned[key] = nested.cleaned;
        }
      } else {
        errors.push(`Metadata object too deeply nested in ${key}`);
      }
    } else {
      cleaned[key] = metadata[key];
    }
  }

  return { errors, cleaned };
}

/**
 * Check for suspicious content patterns
 */
function containsSuspiciousContent(text) {
  const suspiciousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /expression\s*\(/i
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

/**
 * Check for potential PII
 */
function containsPII(text) {
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ // Phone number
  ];

  return piiPatterns.some(pattern => pattern.test(text));
}

/**
 * Check if session ID format is valid
 */
function isValidSessionId(sessionId) {
  return /^sess_\d+_[a-z0-9]{12}$/.test(sessionId) || 
         /^session_[a-f0-9]{32}$/.test(sessionId);
}

/**
 * Validate against JSON schema (simplified)
 */
function validateAgainstSchema(data, schema) {
  // Simplified schema validation - in production use ajv or similar
  const errors = [];
  const cleaned = { ...data };

  // Basic type checking
  if (schema.type && typeof data !== schema.type) {
    errors.push(`Expected type ${schema.type}, got ${typeof data}`);
  }

  // Required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Required field missing: ${field}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned
  };
}

export default {
  validateChatRequest,
  validateOrderRequest,
  validateUUID,
  validateSearchRequest,
  validateEmail,
  validatePagination,
  validateDateRange,
  validateSchema
};
