import { supabase } from '../config/database.js';
import config from '../config/environment.js';

/**
 * Advanced Conversation Management Service
 * Handles memory, context, and intelligent conversation flow
 */
export class ConversationService {
  /**
   * Get or create conversation with intelligent session management
   */
  static async getOrCreate(userId, sessionId, metadata = {}) {
    try {
      // Try to find existing active conversation
      const { data: existing, error: fetchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .single();

      if (existing && !fetchError) {
        // Check if session is still active (not expired)
        const lastActivity = new Date(existing.last_activity);
        const sessionTimeout = config.CONVERSATION.SESSION_TIMEOUT * 60 * 1000;
        const isExpired = Date.now() - lastActivity.getTime() > sessionTimeout;

        if (!isExpired) {
          // Update last activity
          await supabase
            .from('conversations')
            .update({ 
              last_activity: new Date().toISOString(),
              context: { ...existing.context, ...metadata }
            })
            .eq('id', existing.id);
          
          return existing;
        }
      }

      // Create new conversation
      const conversationData = {
        user_id: userId,
        session_id: sessionId,
        title: this.generateConversationTitle(metadata),
        messages: [],
        context: {
          created_via: 'api',
          user_agent: metadata.userAgent,
          ip_address: metadata.ipAddress,
          ...metadata
        },
        message_count: 0,
        total_tokens: 0
      };

      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert(conversationData)
        .select()
        .single();

      if (createError) throw createError;
      return newConv;
      
    } catch (error) {
      console.error('Error in getOrCreate:', error);
      throw new Error(`Failed to get/create conversation: ${error.message}`);
    }
  }

  /**
   * Add message with intelligent context management
   */
  static async addMessage(conversationId, role, content, metadata = {}) {
    try {
      // Get current conversation state
      const { data: conv, error: fetchError } = await supabase
        .from('conversations')
        .select('messages, message_count, total_tokens, context')
        .eq('id', conversationId)
        .single();

      if (fetchError) throw fetchError;

      const messages = conv.messages || [];
      const newMessage = {
        role,
        content,
        timestamp: new Date().toISOString(),
        tokens: this.estimateTokens(content),
        metadata: {
          function_calls: metadata.functionsUsed || [],
          response_time: metadata.responseTime || null,
          model: metadata.model || null,
          ...metadata
        }
      };

      // Smart message history management
      const updatedMessages = this.optimizeMessageHistory([...messages, newMessage]);
      
      // Calculate token usage
      const totalTokens = (conv.total_tokens || 0) + newMessage.tokens;

      // Update conversation with optimizations
      const updateData = {
        messages: updatedMessages,
        message_count: (conv.message_count || 0) + 1,
        total_tokens: totalTokens,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Update title based on conversation content
      if ((conv.message_count || 0) < 3) {
        updateData.title = this.generateSmartTitle(updatedMessages);
      }

      const { error: updateError } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (updateError) throw updateError;

      return updatedMessages;
      
    } catch (error) {
      console.error('Error adding message:', error);
      throw new Error(`Failed to add message: ${error.message}`);
    }
  }

  /**
   * Optimize message history using sliding window + summarization
   */
  static optimizeMessageHistory(messages) {
    const maxHistory = config.CONVERSATION.MAX_HISTORY;
    
    if (messages.length <= maxHistory) {
      return messages;
    }

    // Keep system message + recent messages + important messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.slice(-Math.floor(maxHistory * 0.7));
    const importantMessages = messages.filter(m => 
      m.metadata?.important || 
      (m.metadata?.function_calls && m.metadata.function_calls.length > 0)
    );

    // Combine and deduplicate
    const combined = [...systemMessages, ...importantMessages, ...recentMessages];
    const uniqueMessages = combined.filter((message, index, array) => 
      array.findIndex(m => m.timestamp === message.timestamp) === index
    );

    return uniqueMessages.slice(-maxHistory);
  }

  /**
   * Get conversation history with smart filtering
   */
  static async getHistory(conversationId, options = {}) {
    const {
      limit = 10,
      includeSystem = false,
      format = 'full' // 'full', 'content_only', 'summary'
    } = options;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('messages, context, message_count, total_tokens')
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      let messages = data.messages || [];
      
      // Filter system messages if not requested
      if (!includeSystem) {
        messages = messages.filter(m => m.role !== 'system');
      }

      // Apply limit
      messages = messages.slice(-limit);

      // Format output
      switch (format) {
        case 'content_only':
          return messages.map(m => ({ role: m.role, content: m.content }));
        case 'summary':
          return {
            messageCount: data.message_count || 0,
            totalTokens: data.total_tokens || 0,
            lastMessages: messages.slice(-3).map(m => ({
              role: m.role,
              preview: m.content.slice(0, 100) + (m.content.length > 100 ? '...' : '')
            }))
          };
        default:
          return messages;
      }
      
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  }

  /**
   * Advanced conversation search and retrieval
   */
  static async searchConversations(userId, query, options = {}) {
    const {
      limit = 10,
      includeMessages = false,
      timeRange = null // { start: Date, end: Date }
    } = options;

    try {
      let queryBuilder = supabase
        .from('conversations')
        .select('id, title, message_count, last_activity, created_at')
        .eq('user_id', userId)
        .order('last_activity', { ascending: false })
        .limit(limit);

      // Add time range filter
      if (timeRange) {
        if (timeRange.start) {
          queryBuilder = queryBuilder.gte('created_at', timeRange.start.toISOString());
        }
        if (timeRange.end) {
          queryBuilder = queryBuilder.lte('created_at', timeRange.end.toISOString());
        }
      }

      const { data: conversations, error } = await queryBuilder;
      if (error) throw error;

      // If query is provided, search within conversation content
      if (query && query.trim()) {
        const filteredConversations = [];
        
        for (const conv of conversations) {
          if (includeMessages) {
            const history = await this.getHistory(conv.id, { limit: 50 });
            const hasMatch = history.some(msg => 
              msg.content.toLowerCase().includes(query.toLowerCase())
            );
            
            if (hasMatch || conv.title.toLowerCase().includes(query.toLowerCase())) {
              filteredConversations.push({ ...conv, messages: history });
            }
          } else {
            if (conv.title.toLowerCase().includes(query.toLowerCase())) {
              filteredConversations.push(conv);
            }
          }
        }
        
        return filteredConversations;
      }

      return conversations;
      
    } catch (error) {
      console.error('Error searching conversations:', error);
      return [];
    }
  }

  /**
   * Generate intelligent conversation titles
   */
  static generateSmartTitle(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return 'New Conversation';

    const firstMessage = userMessages[0].content;
    
    // Extract key topics/intents
    const keywords = this.extractKeywords(firstMessage);
    
    if (keywords.length > 0) {
      return keywords.slice(0, 3).join(' & ') + '...';
    }

    // Fallback to first message preview
    return firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
  }

  /**
   * Generate initial conversation title from metadata
   */
  static generateConversationTitle(metadata = {}) {
    if (metadata.topic) return `${metadata.topic} Discussion`;
    if (metadata.userAgent?.includes('mobile')) return 'Mobile Chat';
    return `Chat ${new Date().toLocaleDateString()}`;
  }

  /**
   * Extract keywords for title generation
   */
  static extractKeywords(text) {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ]);

    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 5);
  }

  /**
   * Estimate token count for a message
   */
  static estimateTokens(content) {
    return Math.ceil(content.length / 4); // Rough estimate
  }

  /**
   * Clean up old conversations automatically
   */
  static async cleanupOldConversations(options = {}) {
    const {
      daysOld = config.CONVERSATION.AUTO_CLEANUP_DAYS || 7,
      preserveWithOrders = true,
      dryRun = false
    } = options;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let queryBuilder = supabase
        .from('conversations')
        .select('id, user_id, message_count')
        .lt('last_activity', cutoffDate.toISOString());

      const { data: oldConversations, error } = await queryBuilder;
      if (error) throw error;

      if (!dryRun && oldConversations.length > 0) {
        const conversationIds = oldConversations.map(c => c.id);
        
        // Delete in batches to avoid timeouts
        const batchSize = 100;
        for (let i = 0; i < conversationIds.length; i += batchSize) {
          const batch = conversationIds.slice(i, i + batchSize);
          
          await supabase
            .from('conversations')
            .delete()
            .in('id', batch);
        }
      }

      console.log(`${dryRun ? '[DRY RUN] ' : ''}Cleaned up ${oldConversations.length} old conversations`);
      return oldConversations.length;
      
    } catch (error) {
      console.error('Error cleaning up conversations:', error);
      return 0;
    }
  }

  /**
   * Get conversation analytics
   */
  static async getAnalytics(userId, timeRange = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('message_count, total_tokens, created_at, last_activity')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const analytics = conversations.reduce((acc, conv) => {
        acc.totalConversations++;
        acc.totalMessages += conv.message_count || 0;
        acc.totalTokens += conv.total_tokens || 0;
        
        const avgSessionLength = new Date(conv.last_activity) - new Date(conv.created_at);
        acc.avgSessionLength = (acc.avgSessionLength + avgSessionLength) / 2;
        
        return acc;
      }, {
        totalConversations: 0,
        totalMessages: 0,
        totalTokens: 0,
        avgSessionLength: 0
      });

      return {
        ...analytics,
        avgMessagesPerConversation: analytics.totalConversations > 0 
          ? Math.round(analytics.totalMessages / analytics.totalConversations) 
          : 0,
        avgTokensPerMessage: analytics.totalMessages > 0
          ? Math.round(analytics.totalTokens / analytics.totalMessages)
          : 0,
        avgSessionLengthMinutes: Math.round(analytics.avgSessionLength / 60000),
        timeRange
      };
      
    } catch (error) {
      console.error('Error getting conversation analytics:', error);
      return null;
    }
  }
}
