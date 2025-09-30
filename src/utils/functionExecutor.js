import { SearchService } from '../services/searchService.js';
import { OrderService } from '../services/orderService.js';
import { validateFunctionParameters, functionCosts } from './functionDefinitions.js';
import config from '../config/environment.js';

/**
 * Advanced Function Executor with Security, Validation, and Monitoring
 * Safely executes AI-requested functions with comprehensive error handling
 */
export class FunctionExecutor {
  static executionStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalCost: 0
  };

  /**
   * Execute a single function call with full validation and monitoring
   */
  static async execute(functionName, args, context) {
    const startTime = Date.now();
    
    try {
      console.log(`Executing function: ${functionName}`, { args, userId: context.userId });

      // Validate function parameters
      const validation = validateFunctionParameters(functionName, args);
      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.error}`);
      }

      // Check user permissions
      if (!this.checkPermissions(functionName, context)) {
        throw new Error(`Insufficient permissions for function: ${functionName}`);
      }

      // Rate limiting for function calls
      if (!(await this.checkRateLimit(functionName, context))) {
        throw new Error(`Rate limit exceeded for function: ${functionName}`);
      }

      // Execute the function
      const result = await this.executeFunction(functionName, args, context);

      // Track execution metrics
      const executionTime = Date.now() - startTime;
      const cost = functionCosts[functionName] || 0;
      
      this.recordExecution(functionName, true, executionTime, cost, context);

      return {
        success: true,
        result,
        metadata: {
          executionTime,
          cost,
          functionName
        }
      };

    } catch (error) {
      console.error(`Error executing ${functionName}:`, error);
      
      const executionTime = Date.now() - startTime;
      this.recordExecution(functionName, false, executionTime, 0, context, error.message);

      return {
        success: false,
        error: error.message,
        functionName,
        metadata: {
          executionTime,
          errorType: error.constructor.name
        }
      };
    }
  }

  /**
   * Execute multiple function calls in parallel or sequence
   */
  static async executeMultiple(toolCalls, context, options = {}) {
    const { parallel = true, stopOnError = false } = options;
    const results = [];

    if (parallel) {
      // Execute all functions in parallel
      const promises = toolCalls.map(async (toolCall) => {
        const { id, function: func } = toolCall;
        const args = JSON.parse(func.arguments);

        const result = await this.execute(func.name, args, context);
        return {
          toolCallId: id,
          functionName: func.name,
          result
        };
      });

      const parallelResults = await Promise.allSettled(promises);
      
      parallelResults.forEach((settled, index) => {
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          results.push({
            toolCallId: toolCalls[index].id,
            functionName: toolCalls[index].function.name,
            result: {
              success: false,
              error: settled.reason?.message || 'Execution failed'
            }
          });
        }
      });

    } else {
      // Execute functions sequentially
      for (const toolCall of toolCalls) {
        const { id, function: func } = toolCall;
        const args = JSON.parse(func.arguments);

        const result = await this.execute(func.name, args, context);
        
        results.push({
          toolCallId: id,
          functionName: func.name,
          result
        });

        // Stop on first error if configured
        if (stopOnError && !result.success) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Route function execution to appropriate handler
   */
  static async executeFunction(functionName, args, context) {
    switch (functionName) {
      case 'searchItems':
        return await this.searchItems(args);

      case 'checkStock':
        return await this.checkStock(args);

      case 'createOrder':
        return await this.createOrder(args, context);

      case 'getOrderStatus':
        return await this.getOrderStatus(args, context);

      case 'getUserOrders':
        return await this.getUserOrders(context, args);

      case 'getRecommendations':
        return await this.getRecommendations(context.userId, args);

      case 'checkDrugInteractions':
        return await this.checkDrugInteractions(args);

      case 'getDosageInformation':
        return await this.getDosageInformation(args);

      case 'findNearbyPharmacies':
        return await this.findNearbyPharmacies(args);

      case 'scheduleConsultation':
        return await this.scheduleConsultation(args, context);

      case 'getPriceComparison':
        return await this.getPriceComparison(args);

      case 'checkInsuranceCoverage':
        return await this.checkInsuranceCoverage(args, context);

      case 'setMedicationReminder':
        return await this.setMedicationReminder(args, context);

      case 'reportSideEffect':
        return await this.reportSideEffect(args, context);

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  /**
   * SEARCH FUNCTIONS
   */
  
  static async searchItems(args) {
    const { query, category, prescriptionRequired, maxPrice, minStock = 0, limit = 5 } = args;

    const results = await SearchService.intelligentSearch(query, {
      category,
      prescriptionRequired,
      maxPrice,
      minStock,
      limit: Math.min(limit, config.SEARCH.MAX_LIMIT)
    });

    return {
      message: results.length > 0 
        ? `Found ${results.length} items matching "${query}"` 
        : `No items found matching "${query}"`,
      items: results.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: item.price,
        stock: item.stock || item.stock_quantity,
        brand: item.brand,
        isPrescription: item.isPrescription || item.is_prescription,
        relevanceScore: item.similarity || item.relevanceScore
      })),
      searchQuery: query,
      totalResults: results.length
    };
  }

  static async checkStock(args) {
    const { itemId, quantity = 1, suggestAlternatives = true } = args;

    const result = await SearchService.checkStock(itemId, quantity, { suggestAlternatives });

    return {
      available: result.available,
      currentStock: result.currentStock,
      requested: quantity,
      itemName: result.itemName,
      itemPrice: result.itemPrice,
      isLowStock: result.isLowStock,
      isPrescription: result.isPrescription,
      message: result.available
        ? `${result.itemName} is available (${result.currentStock} in stock)`
        : `${result.itemName} is ${result.currentStock === 0 ? 'out of stock' : 'insufficient quantity'}`,
      alternatives: result.alternatives || [],
      stockStatus: result.currentStock === 0 ? 'out_of_stock' : 
                   result.isLowStock ? 'low_stock' : 'in_stock'
    };
  }

  /**
   * ORDER FUNCTIONS
   */
  
  static async createOrder(args, context) {
    if (context.userId === 'anonymous' || context.user?.isAnonymous) {
      throw new Error('Authentication required to create orders. Please sign in first.');
    }

    const { items, shippingAddress, notes, expressShipping = false } = args;

    try {
      const order = await OrderService.createOrder(context.userId, items, {
        shippingAddress,
        notes,
        expressShipping,
        createdByAI: true,
        sessionId: context.sessionId,
        channel: 'ai_chat'
      });

      return {
        message: `Order ${order.order_number} created successfully!`,
        order: {
          id: order.id,
          orderNumber: order.order_number,
          total: parseFloat(order.total),
          status: order.status,
          paymentStatus: order.payment_status,
          items: order.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.unitPrice,
            subtotal: item.subtotal
          })),
          estimatedDelivery: order.estimatedDelivery,
          trackingInfo: order.trackingInfo
        },
        nextSteps: [
          'Complete payment to process your order',
          'You will receive email confirmation once payment is processed',
          'Track your order using the provided tracking information'
        ]
      };
    } catch (error) {
      if (error.code === 'INSUFFICIENT_STOCK') {
        return {
          success: false,
          error: error.message,
          outOfStockItems: error.outOfStockItems,
          suggestedAlternatives: error.suggestedAlternatives,
          message: 'Some items are out of stock. Would you like to see alternatives?'
        };
      }
      throw error;
    }
  }

  static async getOrderStatus(args, context) {
    const { orderId } = args;

    const order = await OrderService.getOrderStatus(orderId, context.userId);
    if (!order) {
      return {
        success: false,
        error: 'Order not found or access denied',
        message: 'Please check the order ID and try again'
      };
    }

    return {
      message: `Order ${order.order_number} status: ${order.status}`,
      order: {
        orderNumber: order.order_number,
        status: order.status,
        statusMessage: order.statusDetails?.message,
        paymentStatus: order.payment_status,
        total: parseFloat(order.total),
        orderDate: order.created_at,
        lastUpdated: order.updated_at,
        items: order.items,
        trackingInfo: order.trackingInfo,
        estimatedDelivery: order.estimatedDelivery,
        canCancel: order.canCancel,
        canReturn: order.canReturn
      }
    };
  }

  static async getUserOrders(context, args = {}) {
    if (context.user?.isAnonymous) {
      throw new Error('Authentication required to view order history');
    }

    const { limit = 10, status, days = 90 } = args;
    
    const dateRange = days ? {
      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    } : null;

    const orders = await OrderService.getUserOrders(context.userId, {
      limit,
      status,
      dateRange
    });

    return {
      message: `Found ${orders.length} orders`,
      orders: orders.map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        total: parseFloat(order.total),
        status: order.status,
        statusMessage: order.statusDetails?.message,
        orderDate: order.created_at,
        itemCount: order.itemCount,
        totalQuantity: order.totalQuantity
      })),
      totalOrders: orders.length,
      filters: { status, days }
    };
  }

  /**
   * RECOMMENDATION FUNCTIONS
   */
  
  static async getRecommendations(userId, args) {
    const { basedOn = 'popular', category, limit = 5, priceRange } = args;

    const recommendations = await SearchService.getRecommendations(userId, {
      basedOn,
      category,
      limit,
      maxPrice: priceRange?.max,
      minPrice: priceRange?.min
    });

    return {
      message: `Here are ${recommendations.length} recommended items`,
      recommendations: recommendations.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        brand: item.brand,
        reasonForRecommendation: this.getRecommendationReason(basedOn)
      })),
      basedOn,
      category: category || 'all categories'
    };
  }

  /**
   * MEDICAL INFORMATION FUNCTIONS
   */
  
  static async checkDrugInteractions(args) {
    const { medications, severity = 'moderate' } = args;

    // Simplified drug interaction checking
    const interactions = this.mockDrugInteractionCheck(medications, severity);

    return {
      message: interactions.length > 0 
        ? `Found ${interactions.length} potential interactions`
        : 'No significant interactions found',
      interactions,
      medications,
      severityChecked: severity,
      disclaimer: 'This is for informational purposes only. Always consult with a healthcare professional for medical advice.',
      recommendation: interactions.length > 0 
        ? 'Please consult with a pharmacist or doctor before taking these medications together'
        : 'These medications appear safe to take together, but always follow professional guidance'
    };
  }

  static async getDosageInformation(args) {
    const { medicationName, patientAge, patientWeight, condition } = args;

    const dosageInfo = this.mockDosageInformation(medicationName, { patientAge, patientWeight, condition });

    return {
      message: `Dosage information for ${medicationName}`,
      medication: medicationName,
      dosageInfo,
      patientFactors: {
        age: patientAge,
        weight: patientWeight,
        condition
      },
      disclaimer: 'This information is for reference only. Always follow your doctor\'s or pharmacist\'s specific instructions.',
      safetyNote: 'Never exceed recommended dosages without professional medical guidance'
    };
  }

  /**
   * LOCATION AND SERVICE FUNCTIONS
   */
  
  static async findNearbyPharmacies(args) {
    const { location, radius = 10, services = [] } = args;

    const pharmacies = this.mockNearbyPharmacies(location, radius, services);

    return {
      message: `Found ${pharmacies.length} pharmacies within ${radius}km`,
      pharmacies,
      searchLocation: location,
      searchRadius: radius,
      requiredServices: services
    };
  }

  static async scheduleConsultation(args, context) {
    if (context.user?.isAnonymous) {
      throw new Error('Authentication required to schedule consultations');
    }

    const { consultationType, preferredTime, urgency = 'routine', topic } = args;

    const consultation = this.mockScheduleConsultation(consultationType, {
      preferredTime,
      urgency,
      topic,
      userId: context.userId
    });

    return {
      message: 'Consultation scheduled successfully',
      consultation,
      nextSteps: [
        'You will receive a confirmation email shortly',
        'Please arrive 15 minutes before your appointment',
        'Bring any relevant medications or medical records'
      ]
    };
  }

  /**
   * PRICE AND INSURANCE FUNCTIONS
   */
  
  static async getPriceComparison(args) {
    const { medicationName, includeGenerics = true, includeBrands = true, packageSizes = true } = args;

    const comparison = this.mockPriceComparison(medicationName, {
      includeGenerics,
      includeBrands,
      packageSizes
    });

    return {
      message: `Price comparison for ${medicationName}`,
      medication: medicationName,
      options: comparison,
      savings: comparison.length > 1 ? {
        maxSavings: Math.max(...comparison.map(opt => opt.price)) - Math.min(...comparison.map(opt => opt.price)),
        bestValue: comparison.find(opt => opt.bestValue)
      } : null
    };
  }

  static async checkInsuranceCoverage(args, context) {
    const { medications, insurancePlan, membershipNumber } = args;

    if (context.user?.isAnonymous) {
      return {
        message: 'Insurance coverage check requires authentication',
        needsAuth: true,
        medications
      };
    }

    const coverage = this.mockInsuranceCoverage(medications, insurancePlan);

    return {
      message: 'Insurance coverage information',
      medications: coverage,
      plan: insurancePlan,
      disclaimer: 'Coverage information is subject to change. Please verify with your insurance provider.'
    };
  }

  /**
   * PERSONAL HEALTH MANAGEMENT
   */
  
  static async setMedicationReminder(args, context) {
    if (context.user?.isAnonymous) {
      throw new Error('Authentication required to set medication reminders');
    }

    const { medicationName, frequency, times, duration, notes } = args;

    const reminder = this.mockMedicationReminder(medicationName, {
      frequency,
      times,
      duration,
      notes,
      userId: context.userId
    });

    return {
      message: `Medication reminder set for ${medicationName}`,
      reminder,
      schedule: {
        frequency,
        times,
        duration: `${duration} days`
      }
    };
  }

  static async reportSideEffect(args, context) {
    if (context.user?.isAnonymous) {
      throw new Error('Authentication required to report side effects');
    }

    const { medicationName, sideEffects, severity, startDate, additionalInfo } = args;

    const report = this.mockSideEffectReport({
      medicationName,
      sideEffects,
      severity,
      startDate,
      additionalInfo,
      userId: context.userId
    });

    return {
      message: 'Side effect report submitted successfully',
      report,
      nextSteps: [
        'Your report has been recorded and will be reviewed',
        'If experiencing severe side effects, seek immediate medical attention',
        'Consider speaking with your healthcare provider about alternatives'
      ],
      emergencyNote: severity === 'severe' || severity === 'life_threatening' 
        ? 'IMPORTANT: For severe side effects, please contact emergency services or your doctor immediately'
        : null
    };
  }

  /**
   * UTILITY AND VALIDATION FUNCTIONS
   */
  
  static checkPermissions(functionName, context) {
    // Implementation depends on your permission system
    // For now, allow all functions for authenticated users
    return true;
  }

  static async checkRateLimit(functionName, context) {
    // Implement rate limiting logic here
    // For now, allow all calls
    return true;
  }

  static recordExecution(functionName, success, executionTime, cost, context, errorMessage = null) {
    this.executionStats.totalCalls++;
    if (success) {
      this.executionStats.successfulCalls++;
    } else {
      this.executionStats.failedCalls++;
    }
    this.executionStats.totalCost += cost;

    if (config.FEATURES.ENABLE_ANALYTICS) {
      // Log to analytics system
      console.log(`Function execution: ${functionName}, success: ${success}, time: ${executionTime}ms, cost: $${cost}`);
    }
  }

  static getRecommendationReason(basedOn) {
    const reasons = {
      purchase_history: 'Based on your previous purchases',
      popular: 'Popular among customers',
      trending: 'Currently trending',
      seasonal: 'Relevant for current season',
      current_search: 'Related to your current search'
    };
    return reasons[basedOn] || 'Recommended for you';
  }

  /**
   * MOCK FUNCTIONS (Replace with real implementations)
   */
  
  static mockDrugInteractionCheck(medications, severity) {
    // Mock implementation - replace with real drug interaction database
    const mockInteractions = [
      {
        medications: ['warfarin', 'aspirin'],
        severity: 'major',
        description: 'Increased risk of bleeding',
        recommendation: 'Monitor closely and adjust dosage as needed'
      }
    ];

    return mockInteractions.filter(interaction => 
      interaction.medications.some(med => 
        medications.some(userMed => userMed.toLowerCase().includes(med.toLowerCase()))
      )
    );
  }

  static mockDosageInformation(medicationName, factors) {
    return {
      standardDosage: '500mg every 6 hours',
      maxDailyDose: '3000mg',
      adjustments: factors.patientAge < 12 ? 'Pediatric dosing required' : 'Standard adult dosing',
      administration: 'Take with food to reduce stomach irritation',
      contraindications: ['Liver disease', 'Kidney disease'],
      sideEffects: ['Nausea', 'Dizziness', 'Headache']
    };
  }

  static mockNearbyPharmacies(location, radius, services) {
    return [
      {
        name: 'Central Pharmacy',
        address: '123 Main St, ' + location.city,
        distance: '2.3km',
        phone: '+1-555-0123',
        hours: 'Mon-Fri 9AM-9PM, Sat-Sun 9AM-6PM',
        services: ['prescription', 'consultation', 'delivery']
      }
    ];
  }

  static mockScheduleConsultation(type, options) {
    return {
      appointmentId: 'CONSULT-' + Date.now(),
      type,
      scheduledTime: '2024-01-15 14:00',
      pharmacist: 'Dr. Jane Smith, PharmD',
      location: 'Central Pharmacy - Consultation Room 1',
      duration: '30 minutes'
    };
  }

  static mockPriceComparison(medicationName, options) {
    return [
      {
        name: medicationName + ' (Generic)',
        price: 15.99,
        packSize: '30 tablets',
        manufacturer: 'Generic Co.',
        bestValue: true
      },
      {
        name: medicationName + ' (Brand)',
        price: 45.99,
        packSize: '30 tablets', 
        manufacturer: 'Brand Pharma',
        bestValue: false
      }
    ];
  }

  static mockInsuranceCoverage(medications, plan) {
    return medications.map(med => ({
      medication: med,
      covered: true,
      copay: '$10',
      tierLevel: 'Tier 2',
      priorAuthRequired: false
    }));
  }

  static mockMedicationReminder(medicationName, options) {
    return {
      id: 'REMINDER-' + Date.now(),
      medication: medicationName,
      frequency: options.frequency,
      times: options.times || ['09:00', '21:00'],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + options.duration * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  static mockSideEffectReport(data) {
    return {
      reportId: 'SE-' + Date.now(),
      medication: data.medicationName,
      sideEffects: data.sideEffects,
      severity: data.severity,
      reportDate: new Date().toISOString(),
      status: 'submitted'
    };
  }

  /**
   * Get execution statistics
   */
  static getExecutionStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalCalls > 0 
        ? (this.executionStats.successfulCalls / this.executionStats.totalCalls) * 100 
        : 0
    };
  }

  /**
   * Reset execution statistics
   */
  static resetStats() {
    this.executionStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalCost: 0
    };
  }
}
