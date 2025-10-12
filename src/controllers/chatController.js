import { openai, OpenAIService } from '../config/openai.js';
import config from '../config/environment.js';
import { ConversationService } from '../services/conversationService.js';
import { SearchService } from '../services/searchService.js';
import { FunctionExecutor } from '../utils/functionExecutor.js';
import { functionDefinitions, getAvailableFunctions } from '../utils/functionDefinitions.js';
import FAQService from '../services/faqService.js';

/**
 * Enterprise Chat Controller
 * Handles all chat interactions with advanced features including streaming,
 * function calling, context management, and intelligent response generation
 */

/**
 * Build intelligent context from search results
 */
function buildProductContext(items, query) {
  if (!items || items.length === 0) {
    return 'No relevant products found in the current search.';
  }

  const context = items.map((item, index) => 
    `${index + 1}. **${item.name}** (${item.category || 'General'})\n` +
    `   - Price: $${item.price}\n` +
    `   - Stock: ${item.stock || item.stock_quantity || 0} available\n` +
    `   - Description: ${item.description || 'N/A'}\n` +
    `   - Brand: ${item.brand || 'N/A'}\n` +
    `   - Prescription Required: ${item.isPrescription || item.is_prescription ? 'Yes' : 'No'}\n` +
    `   - Item ID: ${item.id}`
  ).join('\n\n');

  return `**Available Products Related to "${query}":**\n\n${context}`;
}

/**
 * Build comprehensive system prompt with FAQ restrictions
 */
function buildSystemPrompt(productContext, userProfile = null) {
  const basePrompt = `You are a customer support chatbot for Monos Trade LLC, a pharmaceutical distribution company in Mongolia.

**PRIMARY FUNCTION - PRODUCT SEARCH:**
- When users ask about products, medicines, availability, prices, or stock levels, use the provided product information to help them
- You can search for products, check availability, provide prices, and help with product-related questions
- Use the product search function to find specific items when needed

**CRITICAL RESTRICTIONS:**
- For medical advice, prescriptions, diagnosis, or treatment recommendations, politely refuse and say: "Энэ талаар зөвхөн эмчид хандахыг зөвлөж байна." (We recommend consulting a doctor)
- For questions outside company scope, respond with: "Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688" (Please contact customer service: +976 7766 6688)
- Never invent phone numbers, emails, or addresses - only use the official contact information provided
- Do not provide medical advice, drug recommendations, or health consultations
- Do not answer questions about competitors, other companies, or unrelated topics

**ALLOWED TOPICS:**
- Product search and availability
- Prices and stock levels
- Product information and descriptions
- Contact information (phone, email, addresses)
- Company information and background
- Warehouse and logistics information
- Partnership and business collaboration
- Product safety reporting (adverse reactions)
- Company vision and mission

**OFFICIAL CONTACT INFORMATION:**
- Main Phone: +976 7766 6688
- Main Email: info@monostrade.mn
- Office: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 3-р хороо, Дунд гол гудамж, Монгол 99 төв, 7 давхар, 706 тоот
- Warehouse: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 20-р хороо, үйлдвэрийн баруун бүс, 44/17
- Partnership: saranchimeg@monostrade.mn, bdm1@monostrade.mn, +976 9924 2297, +976 8800 7742
- Safety Reports: registration@monostrade.mn

**Response Guidelines:**
- Be professional and helpful within the allowed scope
- Use both English and Mongolian as appropriate
- Provide exact information from the FAQ database
- For medical questions: redirect to healthcare professionals
- For out-of-scope questions: redirect to customer service
- Always maintain a respectful and professional tone

**Current Product Information:**
${productContext}

**REMEMBER:** You are strictly limited to FAQ information only. Do not engage in open-ended conversations or provide information not explicitly covered in the FAQ database.`;

  if (userProfile) {
    return basePrompt + `\n\n**User Context:**
- Account type: ${userProfile.isAnonymous ? 'Guest' : 'Registered'}`;
  }

  return basePrompt;
}

/**
 * Main chat handler with comprehensive conversation management
 */
export async function handleChat(req, res) {
  const startTime = Date.now();
  let conversationId = null;

  try {
    const { message, sessionId, metadata = {} } = req.body;
    const userId = req.user.id;
    const isAnonymous = req.user.isAnonymous;

    // Generate session ID if not provided
    const actualSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Enhanced metadata
    const enrichedMetadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      timestamp: new Date().toISOString(),
      isAnonymous,
      ...metadata
    };

    // **STEP 1: Check if this is a product-related query first**
    const isProductQuery = isProductRelatedQuery(message);
    console.log(`🔍 Message analysis: ${isProductQuery ? 'Product query' : 'General query'}:`, message);
    
    let faqResult = null;
    let productSearchResults = null;
    
    if (isProductQuery) {
      // **STEP 1A: For product queries, do product search FIRST**
      console.log('🔍 Performing product search for product query...');
      productSearchResults = await SearchService.intelligentSearch(message, {
        limit: 8,
        threshold: 0.6,
        minStock: 0
      });
      
      console.log(`✅ Product search found ${productSearchResults.length} results`);
      
      // If we found products, skip FAQ and go straight to AI with product context
      if (productSearchResults.length > 0) {
        console.log('🎯 Products found - skipping FAQ, using AI with product context');
        faqResult = { found: false, reason: 'products_found_priority' };
      } else {
        // No products found, fall back to FAQ
        faqResult = FAQService.searchFAQ(message);
      }
    } else {
      // **STEP 1B: For non-product queries, check FAQ first**
      faqResult = FAQService.searchFAQ(message);
    }
    
    // Handle FAQ match found (only for non-product queries or when no products found)
    if (faqResult.found && !isProductQuery) {
      console.log(`✅ FAQ match found (confidence: ${faqResult.confidence}):`, faqResult.category);
      
      const conversation = await ConversationService.getOrCreate(userId, actualSessionId, enrichedMetadata);
      await ConversationService.addMessage(conversation.id, 'user', message, {
        responseTime: Date.now() - startTime,
        source: 'faq_query'
      });
      await ConversationService.addMessage(conversation.id, 'assistant', faqResult.answer, {
        source: 'faq',
        category: faqResult.category,
        confidence: faqResult.confidence,
        matchType: faqResult.matchType
      });

      return res.json({
        reply: faqResult.answer,
        conversationId: conversation.id,
        sessionId: actualSessionId,
        metadata: {
          responseTime: Date.now() - startTime,
          source: 'faq',
          category: faqResult.category,
          confidence: faqResult.confidence,
          matchType: faqResult.matchType
        },
        suggestions: generateFAQSuggestions(faqResult.category),
        warnings: []
      });
    }

    // Handle forbidden topics (medical advice, politics, etc.)
    if (faqResult.reason === 'forbidden_topic') {
      console.log(`🚨 Forbidden topic detected (${faqResult.topicType}):`, faqResult.blockReason);
      const fallbackResponse = FAQService.generateFallbackResponse(message, 'mn');
      
      const conversation = await ConversationService.getOrCreate(userId, actualSessionId, enrichedMetadata);
      await ConversationService.addMessage(conversation.id, 'user', message);
      await ConversationService.addMessage(conversation.id, 'assistant', fallbackResponse, {
        source: 'forbidden_topic_blocked',
        topicType: faqResult.topicType,
        blockReason: faqResult.blockReason
      });

      const suggestions = faqResult.topicType === 'medical_advice' 
        ? ['Эмчид хандах', 'Эрүүл мэндийн мэргэжилтэн']
        : ['Харилцагчийн үйлчилгээ: +976 7766 6688'];

      return res.json({
        reply: fallbackResponse,
        conversationId: conversation.id,
        sessionId: actualSessionId,
        metadata: {
          responseTime: Date.now() - startTime,
          source: 'forbidden_topic_blocked',
          topicType: faqResult.topicType,
          blockReason: faqResult.blockReason
        },
        suggestions,
        warnings: [`Forbidden topic blocked: ${faqResult.topicType}`]
      });
    }

    // Handle low confidence / no match OR product queries with no results
    if (faqResult.reason === 'confidence_too_low' || faqResult.reason === 'no_match' || faqResult.reason === 'products_found_priority') {
      console.log(`🤖 Using AI with product context - ${faqResult.reason} (confidence: ${faqResult.confidence || 0})`);
      if (faqResult.suggestedMatch) {
        console.log(`💡 Low confidence match available: ${faqResult.suggestedMatch.category} (${faqResult.suggestedMatch.confidence})`);
      }

      // Get or create conversation with context
    const conversation = await ConversationService.getOrCreate(userId, actualSessionId, enrichedMetadata);
    conversationId = conversation.id;

    // Get conversation history for context
    const conversationHistory = await ConversationService.getHistory(conversation.id, {
      limit: config.CONVERSATION.MAX_HISTORY,
      includeSystem: false,
      format: 'content_only'
    });

    // Use already fetched product results or perform new search
    const relevantProducts = productSearchResults || await SearchService.intelligentSearch(message, {
      limit: 8,
      threshold: 0.6,
      minStock: 0
    });

    const productContext = buildProductContext(relevantProducts, message);
    const systemPrompt = buildSystemPrompt(productContext, req.user);

    // Get available functions based on user permissions
    const availableFunctions = getAvailableFunctions(req.user);

    // Build comprehensive message array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Create chat completion with function calling
    const completionResult = await OpenAIService.createChatCompletion(messages, {
      model: config.AI.MODEL,
      temperature: config.AI.TEMPERATURE,
      maxTokens: config.AI.MAX_TOKENS,
      tools: availableFunctions,
      toolChoice: 'auto',
      user: userId
    });

    const response = completionResult.response;
    const responseMessage = response.choices[0].message;

    // Handle function calls if present
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const functionContext = {
        userId,
        sessionId: actualSessionId,
        user: req.user,
        conversationId
      };

      const functionResults = await FunctionExecutor.executeMultiple(
        responseMessage.tool_calls,
        functionContext,
        { parallel: true, stopOnError: false }
      );

      // Build follow-up messages with function results
      const followUpMessages = [
        ...messages,
        responseMessage,
        ...functionResults.map(result => ({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.result)
        }))
      ];

      // Get final response incorporating function results
      const finalCompletionResult = await OpenAIService.createChatCompletion(followUpMessages, {
        model: config.AI.MODEL,
        temperature: config.AI.TEMPERATURE,
        maxTokens: config.AI.MAX_TOKENS,
        user: userId
      });

      const finalResponse = finalCompletionResult.response.choices[0].message.content;
      const totalMetadata = {
        ...completionResult.metadata,
        finalTokens: finalCompletionResult.metadata.tokensUsed,
        totalCost: (parseFloat(completionResult.metadata.estimatedCost) + parseFloat(finalCompletionResult.metadata.estimatedCost)).toFixed(6),
        functionsExecuted: functionResults.map(r => r.functionName),
        functionSuccessRate: functionResults.filter(r => r.result.success).length / functionResults.length
      };

      // Save conversation messages
      await ConversationService.addMessage(conversationId, 'user', message, {
        responseTime: Date.now() - startTime,
        searchResults: relevantProducts.length
      });

      await ConversationService.addMessage(conversationId, 'assistant', finalResponse, {
        ...totalMetadata,
        functionsUsed: functionResults.map(r => r.functionName)
      });

      const responseTime = Date.now() - startTime;

      return res.json({
        reply: finalResponse,
        conversationId,
        sessionId: actualSessionId,
        metadata: {
          responseTime,
          tokensUsed: totalMetadata.tokensUsed + totalMetadata.finalTokens,
          estimatedCost: totalMetadata.totalCost,
          functionsExecuted: functionResults.map(r => ({
            name: r.functionName,
            success: r.result.success
          })),
          searchResultsFound: relevantProducts.length,
          conversationLength: conversationHistory.length + 1
        },
        suggestions: generateFollowUpSuggestions(finalResponse, functionResults),
        warnings: req.validationWarnings || []
      });
    }

    // Handle regular response without function calls
    const reply = responseMessage.content;

    // Save conversation messages
    await ConversationService.addMessage(conversationId, 'user', message, {
      responseTime: Date.now() - startTime,
      searchResults: relevantProducts.length
    });

    await ConversationService.addMessage(conversationId, 'assistant', reply, {
      ...completionResult.metadata
    });

    const responseTime = Date.now() - startTime;

    res.json({
      reply,
      conversationId,
      sessionId: actualSessionId,
      metadata: {
        responseTime,
        tokensUsed: completionResult.metadata.tokensUsed,
        estimatedCost: completionResult.metadata.estimatedCost,
        model: completionResult.metadata.model,
        searchResultsFound: relevantProducts.length,
        conversationLength: conversationHistory.length + 1
      },
      suggestions: generateFollowUpSuggestions(reply),
      warnings: req.validationWarnings || []
    });
    }

  } catch (error) {
    console.error('Chat error:', error);
    
    const responseTime = Date.now() - startTime;
    
    // Save error to conversation if we have one
    if (conversationId) {
      try {
        await ConversationService.addMessage(conversationId, 'system', 'Error occurred during processing', {
          error: error.message,
          responseTime
        });
      } catch (saveError) {
        console.error('Failed to save error to conversation:', saveError);
      }
    }

    // Determine appropriate error response
    let statusCode = 500;
    let errorResponse = {
      error: 'I apologize, but I encountered an error processing your request. Please try again in a moment.',
      code: 'CHAT_ERROR',
      conversationId,
      metadata: { responseTime }
    };

    if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorResponse.code = 'AI_RATE_LIMIT';
      errorResponse.error = 'The AI service is currently busy. Please try again in a few moments.';
    } else if (error.message.includes('authentication')) {
      statusCode = 401;
      errorResponse.code = 'AI_AUTH_ERROR';
      errorResponse.error = 'There was an authentication issue with the AI service.';
    } else if (error.message.includes('quota')) {
      statusCode = 503;
      errorResponse.code = 'AI_QUOTA_EXCEEDED';
      errorResponse.error = 'The AI service quota has been exceeded. Please contact support.';
    }

    if (config.SERVER.IS_DEVELOPMENT) {
      errorResponse.details = error.message;
      errorResponse.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
  }
}

/**
 * Streaming chat handler for real-time responses
 */
export async function handleChatStream(req, res) {
  try {
    const { message, sessionId, metadata = {} } = req.body;
    const userId = req.user.id;

    const actualSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial status
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: 'Processing your request...', 
      sessionId: actualSessionId 
    })}\n\n`);

    // Get conversation and context
    const conversation = await ConversationService.getOrCreate(userId, actualSessionId, metadata);
    const conversationHistory = await ConversationService.getHistory(conversation.id, { limit: 10 });
    const relevantProducts = await SearchService.intelligentSearch(message, { limit: 5 });
    
    const productContext = buildProductContext(relevantProducts, message);
    const systemPrompt = buildSystemPrompt(productContext, req.user);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message }
    ];

    // Send context info
    res.write(`data: ${JSON.stringify({
      type: 'context',
      searchResults: relevantProducts.length,
      conversationLength: conversationHistory.length
    })}\n\n`);

    // Get available functions and create stream
    const availableFunctions = getAvailableFunctions(req.user);
    
    const stream = await openai.chat.completions.create({
      model: config.AI.MODEL,
      messages,
      tools: availableFunctions.length > 0 ? availableFunctions : undefined,
      stream: true,
      temperature: config.AI.TEMPERATURE,
      max_tokens: config.AI.MAX_TOKENS,
      user: userId
    });

    let fullResponse = '';
    let functionCalls = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        fullResponse += delta.content;
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: delta.content,
          done: false 
        })}\n\n`);
      }

      if (delta?.tool_calls) {
        delta.tool_calls.forEach(toolCall => {
          if (toolCall.index !== undefined) {
            if (!functionCalls[toolCall.index]) {
              functionCalls[toolCall.index] = {
                id: toolCall.id,
                type: 'function',
                function: { name: toolCall.function?.name || '', arguments: '' }
              };
            }
            if (toolCall.function?.arguments) {
              functionCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        });

        res.write(`data: ${JSON.stringify({
          type: 'function_call',
          functions: functionCalls.filter(fc => fc).map(fc => fc.function.name)
        })}\n\n`);
      }
    }

    // Handle function calls if present
    if (functionCalls.length > 0 && functionCalls.some(fc => fc)) {
      const validFunctionCalls = functionCalls.filter(fc => fc && fc.function.name);
      
      res.write(`data: ${JSON.stringify({
        type: 'status',
        message: 'Executing functions...'
      })}\n\n`);

      const functionContext = {
        userId,
        sessionId: actualSessionId,
        user: req.user,
        conversationId: conversation.id
      };

      const functionResults = await FunctionExecutor.executeMultiple(
        validFunctionCalls,
        functionContext
      );

      // Get final response with function results
      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: fullResponse, tool_calls: validFunctionCalls },
        ...functionResults.map(result => ({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.result)
        }))
      ];

      const finalStream = await openai.chat.completions.create({
        model: config.AI.MODEL,
        messages: followUpMessages,
        stream: true,
        temperature: config.AI.TEMPERATURE,
        max_tokens: config.AI.MAX_TOKENS,
        user: userId
      });

      let finalResponse = '';
      for await (const chunk of finalStream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          finalResponse += content;
          res.write(`data: ${JSON.stringify({ 
            type: 'content', 
            content,
            done: false 
          })}\n\n`);
        }
      }

      fullResponse = finalResponse;

      res.write(`data: ${JSON.stringify({
        type: 'functions_executed',
        results: functionResults.map(r => ({
          name: r.functionName,
          success: r.result.success
        }))
      })}\n\n`);
    }

    // Save conversation messages
    await ConversationService.addMessage(conversation.id, 'user', message);
    await ConversationService.addMessage(conversation.id, 'assistant', fullResponse, {
      streaming: true,
      functionsUsed: functionCalls.filter(fc => fc).map(fc => fc.function.name)
    });

    // Send completion
    res.write(`data: ${JSON.stringify({ 
      type: 'complete',
      conversationId: conversation.id,
      done: true,
      suggestions: generateFollowUpSuggestions(fullResponse)
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error',
      error: 'Stream error occurred',
      message: 'I encountered an error. Please try again.'
    })}\n\n`);
    res.end();
  }
}

/**
 * Get conversation history with enhanced formatting
 */
export async function getConversationHistory(req, res) {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { limit = 50, format = 'full' } = req.query;

    const conversation = await ConversationService.getOrCreate(userId, sessionId);
    const history = await ConversationService.getHistory(conversation.id, {
      limit: parseInt(limit),
      format
    });

    res.json({
      conversationId: conversation.id,
      sessionId: conversation.session_id,
      messageCount: conversation.message_count || 0,
      totalTokens: conversation.total_tokens || 0,
      lastActivity: conversation.last_activity,
      messages: history,
      metadata: {
        format,
        requestedLimit: limit,
        returnedCount: Array.isArray(history) ? history.length : 0
      }
    });

  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve conversation history',
      code: 'HISTORY_ERROR'
    });
  }
}

/**
 * Clear conversation with confirmation
 */
export async function clearConversation(req, res) {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { confirm = false } = req.body;

    if (!confirm) {
      return res.status(400).json({
        error: 'Confirmation required',
        code: 'CONFIRMATION_REQUIRED',
        message: 'Set "confirm": true to clear conversation'
      });
    }

    const conversation = await ConversationService.getOrCreate(userId, sessionId);

    // Clear the conversation
    const { data, error } = await supabase
      .from('conversations')
      .update({ 
        messages: [],
        message_count: 0,
        total_tokens: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation.id);

    if (error) throw error;

    res.json({ 
      message: 'Conversation cleared successfully',
      conversationId: conversation.id,
      sessionId: conversation.session_id
    });

  } catch (error) {
    console.error('Error clearing conversation:', error);
    res.status(500).json({ 
      error: 'Failed to clear conversation',
      code: 'CLEAR_ERROR'
    });
  }
}

/**
 * Get user's conversation list
 */
export async function getUserConversations(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const conversations = await ConversationService.getUserConversations(userId, parseInt(limit));

    res.json({
      conversations: conversations.map(conv => ({
        id: conv.id,
        sessionId: conv.session_id,
        title: conv.title || 'Untitled Conversation',
        messageCount: conv.message_count || 0,
        lastActivity: conv.last_activity,
        createdAt: conv.created_at
      })),
      total: conversations.length,
      userId: req.user.isAnonymous ? 'anonymous' : userId
    });

  } catch (error) {
    console.error('Error getting user conversations:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      code: 'CONVERSATIONS_ERROR'
    });
  }
}

/**
 * Generate FAQ-specific suggestions based on category
 */
function generateFAQSuggestions(category) {
  const suggestionMap = {
    'Contact': ['Office address', 'Partnership contact', 'Email address'],
    'Холбоо барих': ['Оффисын хаяг', 'Хамтын ажиллагаа', 'И-мэйл хаяг'],
    'Warehouse': ['Office address', 'Partnership contact', 'Company info'],
    'Агуулах': ['Оффисын хаяг', 'Хамтын ажиллагаа', 'Компанийн мэдээлэл'],
    'About': ['Company vision', 'Partnership contact', 'Contact info'],
    'Бидний тухай': ['Компанийн алсын хараа', 'Хамтын ажиллагаа', 'Холбогдох мэдээлэл'],
    'Vision': ['Company info', 'Partnership contact', 'Warehouse info'],
    'Алсын хараа': ['Компанийн мэдээлэл', 'Хамтын ажиллагаа', 'Агуулахын мэдээлэл'],
    'Partnership': ['Contact info', 'Company info', 'Warehouse address'],
    'Хамтын ажиллагаа': ['Холбогдох мэдээлэл', 'Компанийн мэдээлэл', 'Агуулахын хаяг'],
    'Safety': ['Contact info', 'Partnership contact', 'Company info'],
    'Аюулгүй байдал': ['Холбогдох мэдээлэл', 'Хамтын ажиллагаа', 'Компанийн мэдээлэл']
  };

  return suggestionMap[category] || [
    'Contact information',
    'Company information',
    'Partnership opportunities'
  ];
}

/**
 * Check if message is product-related
 */
function isProductRelatedQuery(message) {
  const productKeywords = [
    // English
    'medicine', 'medication', 'drug', 'pill', 'tablet', 'capsule', 'syrup', 'injection',
    'paracetamol', 'aspirin', 'ibuprofen', 'vitamin', 'supplement', 'prescription',
    'available', 'stock', 'price', 'cost', 'buy', 'order', 'pharmacy', 'pharmaceutical',
    
    // Mongolian
    'эм', 'эмийн', 'таблет', 'капсул', 'сироп', 'тарилгын', 'витамин', 'бэлдмэл',
    'парацэтэмол', 'аспирин', 'ибупрофен', 'байгаа', 'агуулах', 'үнэ', 'худалдаж авах',
    'захиалах', 'эмийн сан', 'эмийн бүтээгдэхүүн', 'хэрэглэх', 'унших', 'дэлгэрэнгүй'
  ];
  
  const messageLower = message.toLowerCase();
  return productKeywords.some(keyword => messageLower.includes(keyword));
}

/**
 * Generate follow-up suggestions based on response content
 */
function generateFollowUpSuggestions(response, functionResults = []) {
  const suggestions = [];

  // Content-based suggestions
  if (response.toLowerCase().includes('order')) {
    suggestions.push('Check my order status');
    suggestions.push('View my order history');
  }

  if (response.toLowerCase().includes('prescription')) {
    suggestions.push('Schedule pharmacist consultation');
    suggestions.push('Check drug interactions');
  }

  if (response.toLowerCase().includes('price') || response.toLowerCase().includes('cost')) {
    suggestions.push('Compare prices');
    suggestions.push('Check insurance coverage');
  }

  if (response.toLowerCase().includes('stock') || response.toLowerCase().includes('available')) {
    suggestions.push('Get similar products');
    suggestions.push('Set stock alert');
  }

  // Function-based suggestions
  if (functionResults.some(r => r.functionName === 'searchItems')) {
    suggestions.push('Add to order');
    suggestions.push('Get more details');
  }

  if (functionResults.some(r => r.functionName === 'createOrder')) {
    suggestions.push('Track my order');
    suggestions.push('Modify order');
  }

  // Default suggestions if none generated
  if (suggestions.length === 0) {
    suggestions.push('Search for products');
    suggestions.push('View recommendations');
    suggestions.push('Get help');
  }

  return suggestions.slice(0, 4); // Limit to 4 suggestions
}

/**
 * Chat analytics endpoint
 */
export async function getChatAnalytics(req, res) {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const analytics = await ConversationService.getAnalytics(userId, parseInt(days));
    const executionStats = FunctionExecutor.getExecutionStats();

    res.json({
      userAnalytics: analytics,
      systemStats: executionStats,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Error getting chat analytics:', error);
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      code: 'ANALYTICS_ERROR'
    });
  }
}

export default {
  handleChat,
  handleChatStream,
  getConversationHistory,
  clearConversation,
  getUserConversations,
  getChatAnalytics
};
