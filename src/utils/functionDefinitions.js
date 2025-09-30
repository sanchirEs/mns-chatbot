/**
 * Comprehensive OpenAI Function Definitions for Pharmacy Operations
 * Defines all available functions that the AI can call to perform actions
 */

export const functionDefinitions = [
  {
    type: "function",
    function: {
      name: "searchItems",
      description: "Search for pharmacy items, medicines, vitamins, or supplements by name, category, symptoms, or general description. Use this when users ask about products, availability, or what items are available.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query - can be product name, symptom, condition, or general description (e.g., 'paracetamol', 'headache relief', 'vitamin c')"
          },
          category: {
            type: "string",
            description: "Optional category filter to narrow search results",
            enum: [
              "medicine",
              "vitamins", 
              "supplements",
              "pain-relief",
              "antibiotics",
              "cold-flu",
              "digestive",
              "allergy",
              "heart-health",
              "skin-care",
              "personal-care",
              "equipment"
            ]
          },
          prescriptionRequired: {
            type: "boolean",
            description: "Filter by prescription requirement - true for prescription items, false for over-counter"
          },
          maxPrice: {
            type: "number",
            description: "Maximum price filter for budget-conscious searches",
            minimum: 0
          },
          minStock: {
            type: "integer",
            description: "Minimum stock quantity required (default: 0)",
            minimum: 0
          },
          limit: {
            type: "integer",
            description: "Maximum number of results to return (default: 5, max: 20)",
            minimum: 1,
            maximum: 20
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "checkStock",
      description: "Check current inventory levels and availability for specific items. Use when users ask about stock levels or product availability.",
      parameters: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "The UUID of the item to check inventory for"
          },
          quantity: {
            type: "integer",
            minimum: 1,
            description: "Quantity needed to check availability for (default: 1)"
          },
          suggestAlternatives: {
            type: "boolean",
            description: "Whether to suggest alternative products if the item is out of stock",
            default: true
          }
        },
        required: ["itemId"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "createOrder",
      description: "Create a new order for the customer with one or more items. Only use after confirming the user wants to purchase and has provided clear consent.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "List of items to include in the order",
            items: {
              type: "object",
              properties: {
                itemId: {
                  type: "string",
                  description: "UUID of the item to order"
                },
                quantity: {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                  description: "Quantity to order"
                }
              },
              required: ["itemId", "quantity"]
            },
            minItems: 1,
            maxItems: 20
          },
          shippingAddress: {
            type: "object",
            description: "Shipping address for the order",
            properties: {
              street: { type: "string", description: "Street address" },
              city: { type: "string", description: "City name" },
              state: { type: "string", description: "State or province" },
              postalCode: { type: "string", description: "Postal/ZIP code" },
              country: { type: "string", description: "Country name" }
            },
            required: ["street", "city", "country"]
          },
          notes: {
            type: "string",
            description: "Optional order notes or special instructions",
            maxLength: 500
          },
          expressShipping: {
            type: "boolean",
            description: "Whether to use express shipping (additional cost)",
            default: false
          }
        },
        required: ["items"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getOrderStatus",
      description: "Retrieve the current status, tracking information, and details of an existing order.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID (UUID) or order number to check"
          }
        },
        required: ["orderId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getUserOrders",
      description: "Get the user's order history with optional filtering. Use when users ask about their past orders or order history.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Number of recent orders to retrieve (default: 10)"
          },
          status: {
            type: "string",
            description: "Filter orders by status",
            enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]
          },
          days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
            description: "Number of days back to look for orders (default: 90)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getRecommendations",
      description: "Get personalized product recommendations based on user's purchase history, current search, or general popularity.",
      parameters: {
        type: "object",
        properties: {
          basedOn: {
            type: "string",
            description: "What to base recommendations on",
            enum: ["purchase_history", "current_search", "popular", "trending", "seasonal"],
            default: "popular"
          },
          category: {
            type: "string",
            description: "Limit recommendations to specific category",
            enum: ["medicine", "vitamins", "supplements", "pain-relief", "cold-flu", "digestive"]
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Number of recommendations to return (default: 5)"
          },
          priceRange: {
            type: "object",
            description: "Price range for recommendations",
            properties: {
              min: { type: "number", minimum: 0 },
              max: { type: "number", minimum: 0 }
            }
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "checkDrugInteractions",
      description: "Check for potential drug interactions between medications. Use when users ask about taking multiple medications together or mention they're on other medications.",
      parameters: {
        type: "object", 
        properties: {
          medications: {
            type: "array",
            description: "List of medication names to check for interactions",
            items: { type: "string" },
            minItems: 2,
            maxItems: 10
          },
          severity: {
            type: "string",
            description: "Minimum severity level to report",
            enum: ["minor", "moderate", "major"],
            default: "moderate"
          }
        },
        required: ["medications"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getDosageInformation",
      description: "Get dosage guidelines and administration information for specific medications. Use when users ask about how to take medications.",
      parameters: {
        type: "object",
        properties: {
          medicationName: {
            type: "string",
            description: "Name of the medication to get dosage information for"
          },
          patientAge: {
            type: "integer",
            description: "Patient's age for age-appropriate dosing",
            minimum: 0,
            maximum: 120
          },
          patientWeight: {
            type: "number",
            description: "Patient's weight in kg for weight-based dosing",
            minimum: 0
          },
          condition: {
            type: "string",
            description: "Medical condition being treated (affects dosing)"
          }
        },
        required: ["medicationName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "findNearbyPharmacies",
      description: "Find nearby pharmacy locations with contact information and hours. Use when users ask about pharmacy locations.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "object",
            description: "User's location for search",
            properties: {
              city: { type: "string" },
              state: { type: "string" },
              postalCode: { type: "string" },
              country: { type: "string" }
            }
          },
          radius: {
            type: "integer",
            description: "Search radius in kilometers (default: 10)",
            minimum: 1,
            maximum: 50,
            default: 10
          },
          services: {
            type: "array",
            description: "Required pharmacy services",
            items: {
              type: "string",
              enum: ["prescription", "consultation", "vaccination", "delivery", "24hour"]
            }
          }
        },
        required: ["location"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scheduleConsultation",
      description: "Schedule a consultation with a pharmacist. Use when users need professional advice or have complex medication questions.",
      parameters: {
        type: "object",
        properties: {
          consultationType: {
            type: "string",
            description: "Type of consultation needed",
            enum: ["medication_review", "drug_interaction", "side_effects", "general", "vaccination"],
            default: "general"
          },
          preferredTime: {
            type: "string",
            description: "Preferred consultation time",
            enum: ["morning", "afternoon", "evening", "anytime"]
          },
          urgency: {
            type: "string",
            description: "Urgency level",
            enum: ["routine", "urgent", "emergency"],
            default: "routine"
          },
          topic: {
            type: "string",
            description: "Brief description of consultation topic",
            maxLength: 200
          }
        },
        required: ["consultationType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getPriceComparison",
      description: "Compare prices of medications across different brands, generics, or package sizes. Use when users ask about costs or cheaper alternatives.",
      parameters: {
        type: "object",
        properties: {
          medicationName: {
            type: "string",
            description: "Name of medication to compare prices for"
          },
          includeGenerics: {
            type: "boolean",
            description: "Include generic alternatives in comparison",
            default: true
          },
          includeBrands: {
            type: "boolean", 
            description: "Include different brand options",
            default: true
          },
          packageSizes: {
            type: "boolean",
            description: "Compare different package sizes for better value",
            default: true
          }
        },
        required: ["medicationName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "checkInsuranceCoverage",
      description: "Check if medications are covered by insurance plans. Use when users ask about insurance coverage or copays.",
      parameters: {
        type: "object",
        properties: {
          medications: {
            type: "array",
            description: "List of medications to check coverage for",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10
          },
          insurancePlan: {
            type: "string",
            description: "Insurance plan name or type"
          },
          membershipNumber: {
            type: "string",
            description: "Insurance membership number (if provided)"
          }
        },
        required: ["medications"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "setMedicationReminder",
      description: "Set up medication reminders for the user. Use when users mention forgetting to take medications or want reminder help.",
      parameters: {
        type: "object",
        properties: {
          medicationName: {
            type: "string",
            description: "Name of medication to set reminder for"
          },
          frequency: {
            type: "string",
            description: "How often to take the medication",
            enum: ["once_daily", "twice_daily", "three_times_daily", "four_times_daily", "as_needed", "weekly", "custom"]
          },
          times: {
            type: "array",
            description: "Specific times to take medication (24-hour format)",
            items: { type: "string", pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" }
          },
          duration: {
            type: "integer",
            description: "Number of days to continue reminders",
            minimum: 1,
            maximum: 365
          },
          notes: {
            type: "string",
            description: "Additional notes about taking the medication",
            maxLength: 200
          }
        },
        required: ["medicationName", "frequency"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reportSideEffect",
      description: "Report and log medication side effects. Use when users mention experiencing side effects from medications.",
      parameters: {
        type: "object",
        properties: {
          medicationName: {
            type: "string",
            description: "Name of medication causing side effects"
          },
          sideEffects: {
            type: "array",
            description: "List of side effects experienced",
            items: { type: "string" },
            minItems: 1
          },
          severity: {
            type: "string",
            description: "Severity of side effects",
            enum: ["mild", "moderate", "severe", "life_threatening"]
          },
          startDate: {
            type: "string",
            description: "When side effects started (YYYY-MM-DD format)"
          },
          additionalInfo: {
            type: "string",
            description: "Additional information about the side effects",
            maxLength: 500
          }
        },
        required: ["medicationName", "sideEffects", "severity"]
      }
    }
  }
];

/**
 * Function categories for better organization
 */
export const functionCategories = {
  search: ['searchItems', 'getRecommendations', 'getPriceComparison'],
  inventory: ['checkStock'],
  orders: ['createOrder', 'getOrderStatus', 'getUserOrders'],
  medical: ['checkDrugInteractions', 'getDosageInformation', 'reportSideEffect'],
  services: ['findNearbyPharmacies', 'scheduleConsultation', 'setMedicationReminder'],
  insurance: ['checkInsuranceCoverage']
};

/**
 * Functions that require authentication
 */
export const authRequiredFunctions = [
  'createOrder',
  'getOrderStatus', 
  'getUserOrders',
  'scheduleConsultation',
  'setMedicationReminder',
  'reportSideEffect',
  'checkInsuranceCoverage'
];

/**
 * Functions that require special permissions
 */
export const privilegedFunctions = {
  pharmacist: ['checkDrugInteractions', 'getDosageInformation', 'scheduleConsultation'],
  admin: ['reportSideEffect'],
  system: ['checkInsuranceCoverage']
};

/**
 * Function execution costs (for rate limiting and billing)
 */
export const functionCosts = {
  searchItems: 0.01,
  checkStock: 0.005,
  createOrder: 0.05,
  getOrderStatus: 0.01,
  getUserOrders: 0.02,
  getRecommendations: 0.02,
  checkDrugInteractions: 0.10,
  getDosageInformation: 0.05,
  findNearbyPharmacies: 0.03,
  scheduleConsultation: 0.03,
  getPriceComparison: 0.04,
  checkInsuranceCoverage: 0.08,
  setMedicationReminder: 0.02,
  reportSideEffect: 0.10
};

/**
 * Get functions available to a user based on their role and permissions
 */
export function getAvailableFunctions(user) {
  if (!user) {
    // Anonymous users get basic functions only
    return functionDefinitions.filter(f => 
      !authRequiredFunctions.includes(f.function.name) &&
      !Object.values(privilegedFunctions).flat().includes(f.function.name)
    );
  }

  let availableFunctions = [...functionDefinitions];

  // Filter based on authentication requirement
  if (user.isAnonymous) {
    availableFunctions = availableFunctions.filter(f => 
      !authRequiredFunctions.includes(f.function.name)
    );
  }

  // Filter based on role privileges
  const userRole = user.role || 'user';
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    availableFunctions = availableFunctions.filter(f => {
      const functionName = f.function.name;
      return !Object.entries(privilegedFunctions).some(([requiredRole, functions]) => {
        return functions.includes(functionName) && 
               !hasRequiredRole(userRole, requiredRole);
      });
    });
  }

  return availableFunctions;
}

/**
 * Check if user has required role level
 */
function hasRequiredRole(userRole, requiredRole) {
  const roleHierarchy = {
    'user': 1,
    'pharmacist': 2,
    'admin': 3,
    'superadmin': 4
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 999;

  return userLevel >= requiredLevel;
}

/**
 * Get function definition by name
 */
export function getFunctionDefinition(functionName) {
  return functionDefinitions.find(f => f.function.name === functionName);
}

/**
 * Validate function parameters
 */
export function validateFunctionParameters(functionName, parameters) {
  const definition = getFunctionDefinition(functionName);
  if (!definition) {
    return { valid: false, error: `Function ${functionName} not found` };
  }

  const schema = definition.function.parameters;
  
  // Basic validation (in production, use a proper JSON schema validator)
  const required = schema.required || [];
  for (const field of required) {
    if (!(field in parameters)) {
      return { valid: false, error: `Required parameter missing: ${field}` };
    }
  }

  return { valid: true };
}

export default functionDefinitions;
