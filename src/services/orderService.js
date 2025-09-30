import { supabase } from '../config/database.js';
import { SearchService } from './searchService.js';
import config from '../config/environment.js';

/**
 * Enterprise Order Management Service
 * Handles order creation, tracking, inventory management, and business logic
 */
export class OrderService {
  /**
   * Create comprehensive order with validation and inventory management
   */
  static async createOrder(userId, items, metadata = {}) {
    const transaction = supabase;
    
    try {
      // Step 1: Validate and enrich order items
      const validatedItems = await this.validateOrderItems(items);
      if (validatedItems.errors.length > 0) {
        throw new Error(`Order validation failed: ${validatedItems.errors.join(', ')}`);
      }

      // Step 2: Check stock availability for all items
      const stockChecks = await Promise.all(
        validatedItems.items.map(item => 
          SearchService.checkStock(item.itemId, item.quantity, { suggestAlternatives: true })
        )
      );

      const outOfStockItems = stockChecks
        .filter(check => !check.available)
        .map(check => check.itemName || 'Unknown item');

      if (outOfStockItems.length > 0) {
        const alternatives = stockChecks
          .filter(check => check.alternatives && check.alternatives.length > 0)
          .map(check => check.alternatives)
          .flat();

        throw {
          code: 'INSUFFICIENT_STOCK',
          message: `Items out of stock: ${outOfStockItems.join(', ')}`,
          outOfStockItems,
          suggestedAlternatives: alternatives
        };
      }

      // Step 3: Calculate comprehensive pricing
      const pricing = await this.calculateOrderPricing(validatedItems.items, metadata);

      // Step 4: Generate unique order number
      const orderNumber = await this.generateOrderNumber();

      // Step 5: Create order record
      const orderData = {
        order_number: orderNumber,
        user_id: userId,
        pharmacy_id: metadata.pharmacyId || null,
        items: validatedItems.items.map(item => ({
          itemId: item.itemId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          category: item.category,
          isPrescription: item.isPrescription
        })),
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        shipping: pricing.shipping,
        discount: pricing.discount || 0,
        total: pricing.total,
        status: this.determineInitialStatus(validatedItems.items),
        payment_status: 'pending',
        shipping_address: metadata.shippingAddress || null,
        notes: metadata.notes || null,
        created_by_ai: metadata.createdByAI || false,
        metadata: {
          userAgent: metadata.userAgent,
          sessionId: metadata.sessionId,
          channel: metadata.channel || 'api',
          ...metadata.additionalData
        }
      };

      const { data: order, error: orderError } = await transaction
        .from('orders')
        .insert(orderData)
        .select()
        .single();

      if (orderError) throw orderError;

      // Step 6: Update inventory
      await this.updateInventoryForOrder(validatedItems.items, 'decrement');

      // Step 7: Update user profile
      await this.updateUserProfile(userId, order);

      // Step 8: Create order analytics record
      if (config.FEATURES.ENABLE_ANALYTICS) {
        await this.recordOrderAnalytics(order, metadata);
      }

      return {
        ...order,
        estimatedDelivery: this.calculateEstimatedDelivery(order),
        paymentInstructions: this.generatePaymentInstructions(order),
        trackingInfo: this.initializeTracking(order)
      };
      
    } catch (error) {
      console.error('Error creating order:', error);
      
      if (error.code === 'INSUFFICIENT_STOCK') {
        throw error; // Re-throw with alternatives
      }
      
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Validate and enrich order items
   */
  static async validateOrderItems(items) {
    const errors = [];
    const validatedItems = [];

    if (!Array.isArray(items) || items.length === 0) {
      return { items: [], errors: ['No items provided'] };
    }

    for (const item of items) {
      try {
        // Validate basic structure
        if (!item.itemId || !item.quantity) {
          errors.push('Item must have itemId and quantity');
          continue;
        }

        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          errors.push(`Invalid quantity for item ${item.itemId}`);
          continue;
        }

        // Get item details from database
        const itemDetails = await SearchService.getItemById(item.itemId);
        if (!itemDetails) {
          errors.push(`Item not found: ${item.itemId}`);
          continue;
        }

        // Check if item is active
        if (!itemDetails.isActive) {
          errors.push(`Item is not available: ${itemDetails.name}`);
          continue;
        }

        // Enrich with database details
        validatedItems.push({
          itemId: item.itemId,
          sku: itemDetails.sku,
          name: itemDetails.name,
          description: itemDetails.description,
          category: itemDetails.category,
          quantity: item.quantity,
          unitPrice: itemDetails.price,
          subtotal: itemDetails.price * item.quantity,
          isPrescription: itemDetails.isPrescription,
          brand: itemDetails.brand,
          dosage: itemDetails.dosage,
          currentStock: itemDetails.stock
        });

      } catch (itemError) {
        errors.push(`Error validating item ${item.itemId}: ${itemError.message}`);
      }
    }

    return { items: validatedItems, errors };
  }

  /**
   * Calculate comprehensive order pricing
   */
  static async calculateOrderPricing(items, metadata = {}) {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Tax calculation (configurable by region)
    const taxRate = metadata.taxRate || 0.1; // 10% default
    const tax = subtotal * taxRate;
    
    // Shipping calculation
    let shipping = 0;
    if (metadata.requiresShipping !== false) {
      shipping = this.calculateShipping(items, metadata);
    }
    
    // Discount calculation
    let discount = 0;
    if (metadata.discountCode) {
      discount = await this.calculateDiscount(subtotal, metadata.discountCode);
    }
    
    const total = subtotal + tax + shipping - discount;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      breakdown: {
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        prescriptionItemsCount: items.filter(item => item.isPrescription).length,
        averageItemPrice: subtotal / items.reduce((sum, item) => sum + item.quantity, 0)
      }
    };
  }

  /**
   * Calculate shipping costs based on items and location
   */
  static calculateShipping(items, metadata) {
    const baseShipping = 5.99;
    const freeShippingThreshold = 50.00;
    
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    
    if (subtotal >= freeShippingThreshold) {
      return 0;
    }
    
    // Express shipping option
    if (metadata.expressShipping) {
      return baseShipping + 9.99;
    }
    
    return baseShipping;
  }

  /**
   * Generate unique order number using database function
   */
  static async generateOrderNumber() {
    try {
      const { data, error } = await supabase.rpc('generate_order_number');
      if (error) throw error;
      return data;
    } catch (error) {
      // Fallback to timestamp-based generation
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${random}`;
    }
  }

  /**
   * Determine initial order status based on items
   */
  static determineInitialStatus(items) {
    const hasPrescriptionItems = items.some(item => item.isPrescription);
    return hasPrescriptionItems ? 'pending_verification' : 'confirmed';
  }

  /**
   * Update inventory using database functions
   */
  static async updateInventoryForOrder(items, operation = 'decrement') {
    const inventoryUpdates = items.map(async (item) => {
      try {
        const { data, error } = await supabase.rpc(
          operation === 'decrement' ? 'decrement_stock' : 'increment_stock',
          {
            item_id: item.itemId,
            quantity: item.quantity
          }
        );

        if (error) throw error;
        return { itemId: item.itemId, success: true, data };
      } catch (error) {
        console.error(`Failed to ${operation} stock for item ${item.itemId}:`, error);
        return { itemId: item.itemId, success: false, error: error.message };
      }
    });

    const results = await Promise.all(inventoryUpdates);
    const failures = results.filter(r => !r.success);
    
    if (failures.length > 0) {
      console.warn('Some inventory updates failed:', failures);
      // Could implement compensating transactions here
    }

    return results;
  }

  /**
   * Update user profile with order data
   */
  static async updateUserProfile(userId, order) {
    try {
      const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('total_orders, lifetime_value, purchase_history')
        .eq('user_id', userId)
        .single();

      let updateData;
      
      if (fetchError && fetchError.code === 'PGRST116') {
        // Create new profile
        updateData = {
          user_id: userId,
          total_orders: 1,
          lifetime_value: parseFloat(order.total),
          purchase_history: [order.id]
        };
        
        await supabase.from('user_profiles').insert(updateData);
      } else if (!fetchError) {
        // Update existing profile
        const purchaseHistory = profile.purchase_history || [];
        updateData = {
          total_orders: (profile.total_orders || 0) + 1,
          lifetime_value: (parseFloat(profile.lifetime_value) || 0) + parseFloat(order.total),
          purchase_history: [...purchaseHistory, order.id].slice(-50) // Keep last 50 orders
        };
        
        await supabase
          .from('user_profiles')
          .update(updateData)
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Error updating user profile:', error);
      // Don't fail the order for profile update errors
    }
  }

  /**
   * Get comprehensive order status with tracking
   */
  static async getOrderStatus(orderId, userId = null) {
    try {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('id', orderId);
        
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: order, error } = await query.single();
      if (error) throw error;

      return {
        ...order,
        statusDetails: this.getStatusDetails(order.status),
        timeline: await this.getOrderTimeline(orderId),
        trackingInfo: this.getTrackingInfo(order),
        estimatedDelivery: this.calculateEstimatedDelivery(order),
        canCancel: this.canCancelOrder(order),
        canReturn: this.canReturnOrder(order)
      };
      
    } catch (error) {
      console.error('Error getting order status:', error);
      return null;
    }
  }

  /**
   * Get detailed status information
   */
  static getStatusDetails(status) {
    const statusMap = {
      'pending': {
        message: 'Order received and being processed',
        color: 'yellow',
        progress: 10
      },
      'pending_verification': {
        message: 'Prescription verification in progress',
        color: 'orange',
        progress: 20
      },
      'confirmed': {
        message: 'Order confirmed and being prepared',
        color: 'blue',
        progress: 30
      },
      'processing': {
        message: 'Order is being prepared for shipment',
        color: 'blue',
        progress: 50
      },
      'shipped': {
        message: 'Order has been shipped',
        color: 'green',
        progress: 80
      },
      'delivered': {
        message: 'Order successfully delivered',
        color: 'green',
        progress: 100
      },
      'cancelled': {
        message: 'Order has been cancelled',
        color: 'red',
        progress: 0
      },
      'refunded': {
        message: 'Order has been refunded',
        color: 'red',
        progress: 0
      }
    };

    return statusMap[status] || {
      message: 'Status unknown',
      color: 'gray',
      progress: 0
    };
  }

  /**
   * Get user's order history with filtering and pagination
   */
  static async getUserOrders(userId, options = {}) {
    const {
      limit = 10,
      offset = 0,
      status = null,
      dateRange = null,
      includeItems = true
    } = options;

    try {
      let query = supabase
        .from('orders')
        .select(includeItems ? '*' : 'id, order_number, total, status, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }

      if (dateRange) {
        if (dateRange.start) {
          query = query.gte('created_at', dateRange.start.toISOString());
        }
        if (dateRange.end) {
          query = query.lte('created_at', dateRange.end.toISOString());
        }
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      return (orders || []).map(order => ({
        ...order,
        statusDetails: this.getStatusDetails(order.status),
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        totalQuantity: Array.isArray(order.items) 
          ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) 
          : 0
      }));
      
    } catch (error) {
      console.error('Error getting user orders:', error);
      return [];
    }
  }

  /**
   * Cancel order with business logic validation
   */
  static async cancelOrder(orderId, userId, reason = null) {
    try {
      // Get order details
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (fetchError) throw new Error('Order not found');

      // Check if cancellation is allowed
      if (!this.canCancelOrder(order)) {
        throw new Error(`Order cannot be cancelled. Current status: ${order.status}`);
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          status: 'cancelled',
          notes: order.notes ? `${order.notes}\n\nCancelled: ${reason || 'User request'}` : `Cancelled: ${reason || 'User request'}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Restore inventory
      await this.updateInventoryForOrder(order.items, 'increment');

      // Update user profile (reduce totals)
      await this.updateUserProfileForCancellation(userId, order);

      return {
        success: true,
        message: 'Order cancelled successfully',
        refundAmount: order.payment_status === 'paid' ? order.total : 0
      };
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw error;
    }
  }

  /**
   * Check if order can be cancelled
   */
  static canCancelOrder(order) {
    const cancellableStatuses = ['pending', 'pending_verification', 'confirmed'];
    return cancellableStatuses.includes(order.status);
  }

  /**
   * Check if order can be returned
   */
  static canReturnOrder(order) {
    if (order.status !== 'delivered') return false;
    
    const deliveryDate = new Date(order.updated_at);
    const daysSinceDelivery = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceDelivery <= 30; // 30-day return policy
  }

  /**
   * Calculate estimated delivery date
   */
  static calculateEstimatedDelivery(order) {
    const baseDeliveryDays = 3;
    const expressMultiplier = order.shipping > 10 ? 0.5 : 1;
    
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (baseDeliveryDays * expressMultiplier));
    
    return {
      date: deliveryDate.toISOString().split('T')[0],
      businessDays: Math.ceil(baseDeliveryDays * expressMultiplier),
      isExpress: expressMultiplier < 1
    };
  }

  /**
   * Initialize order tracking
   */
  static initializeTracking(order) {
    return {
      trackingNumber: `TRK-${order.order_number.replace('ORD-', '')}`,
      trackingUrl: `https://track.example.com/${order.id}`,
      updates: [{
        timestamp: order.created_at,
        status: 'Order Placed',
        description: 'Your order has been received and is being processed'
      }]
    };
  }

  /**
   * Generate payment instructions
   */
  static generatePaymentInstructions(order) {
    return {
      total: order.total,
      currency: 'USD',
      methods: ['credit_card', 'paypal', 'bank_transfer'],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      instructions: 'Please complete payment within 7 days to avoid order cancellation.'
    };
  }

  /**
   * Record order analytics
   */
  static async recordOrderAnalytics(order, metadata) {
    try {
      const analyticsData = {
        user_id: order.user_id,
        session_id: metadata.sessionId,
        order_id: order.id,
        order_total: order.total,
        item_count: order.items.length,
        channel: metadata.channel || 'api',
        has_prescription_items: order.items.some(item => item.isPrescription),
        created_by_ai: order.created_by_ai || false
      };

      await supabase.from('order_analytics').insert(analyticsData);
    } catch (error) {
      console.error('Failed to record order analytics:', error);
      // Don't fail order creation for analytics errors
    }
  }

  /**
   * Get order analytics and insights
   */
  static async getOrderAnalytics(options = {}) {
    const {
      timeRange = 30,
      userId = null,
      groupBy = 'day'
    } = options;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      let query = supabase
        .from('orders')
        .select('total, status, created_at, items')
        .gte('created_at', startDate.toISOString());

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      return this.processOrderAnalytics(orders, groupBy);
    } catch (error) {
      console.error('Error getting order analytics:', error);
      return null;
    }
  }

  /**
   * Process order data for analytics
   */
  static processOrderAnalytics(orders, groupBy) {
    const analytics = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, order) => sum + parseFloat(order.total), 0),
      averageOrderValue: 0,
      statusBreakdown: {},
      timeSeriesData: {},
      topCategories: {}
    };

    if (analytics.totalOrders > 0) {
      analytics.averageOrderValue = analytics.totalRevenue / analytics.totalOrders;
    }

    // Status breakdown
    orders.forEach(order => {
      analytics.statusBreakdown[order.status] = (analytics.statusBreakdown[order.status] || 0) + 1;
    });

    // Time series data (simplified)
    orders.forEach(order => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      analytics.timeSeriesData[date] = (analytics.timeSeriesData[date] || 0) + 1;
    });

    return analytics;
  }
}
