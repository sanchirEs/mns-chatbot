import OpenAI from 'openai';
import config from './environment.js';

/**
 * Enhanced OpenAI client with monitoring and retry logic
 */
export const openai = new OpenAI({
  apiKey: config.AI.API_KEY,
  maxRetries: config.AI.MAX_RETRIES,
  timeout: config.AI.TIMEOUT,
  defaultHeaders: {
    'User-Agent': 'pharmacy-ai-chatbot/1.0'
  }
});

/**
 * OpenAI service class with advanced features
 */
export class OpenAIService {
  static tokenCosts = {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
    'text-embedding-3-small': { input: 0.00002, output: 0 },
    'text-embedding-3-large': { input: 0.00013, output: 0 }
  };

  /**
   * Generate embeddings with caching and error handling
   */
  static async generateEmbedding(text, model = config.AI.EMBEDDING_MODEL) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for embedding generation');
    }

    try {
      const startTime = Date.now();
      
      const response = await openai.embeddings.create({
        model,
        input: text.trim().slice(0, 8000), // Limit input length
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      const responseTime = Date.now() - startTime;
      
      // Log metrics
      if (config.FEATURES.ENABLE_ANALYTICS) {
        console.log(`Embedding generated: ${responseTime}ms, tokens: ${response.usage?.total_tokens || 'unknown'}`);
      }

      return {
        embedding,
        tokens: response.usage?.total_tokens || 0,
        responseTime,
        model
      };
      
    } catch (error) {
      console.error('Embedding generation failed:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Enhanced chat completion with token tracking
   */
  static async createChatCompletion(messages, options = {}) {
    const {
      model = config.AI.MODEL,
      temperature = config.AI.TEMPERATURE,
      maxTokens = config.AI.MAX_TOKENS,
      tools = null,
      toolChoice = 'auto',
      stream = false,
      user = null
    } = options;

    try {
      const startTime = Date.now();

      const params = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        user
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = toolChoice;
      }

      if (stream) {
        params.stream = true;
        return await openai.chat.completions.create(params);
      }

      const response = await openai.chat.completions.create(params);
      const responseTime = Date.now() - startTime;

      // Calculate costs
      const usage = response.usage;
      const costs = this.tokenCosts[model];
      const estimatedCost = costs ? 
        (usage.prompt_tokens * costs.input + usage.completion_tokens * costs.output) / 1000 : 0;

      return {
        response,
        metadata: {
          responseTime,
          tokensUsed: usage.total_tokens,
          estimatedCost: estimatedCost.toFixed(6),
          model
        }
      };

    } catch (error) {
      console.error('Chat completion failed:', error.message);
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      } else if (error.status === 401) {
        throw new Error('OpenAI API key is invalid or expired.');
      } else if (error.status === 500) {
        throw new Error('OpenAI service is temporarily unavailable.');
      }
      
      throw new Error(`AI service error: ${error.message}`);
    }
  }

  /**
   * Batch embedding generation for efficiency
   */
  static async generateBatchEmbeddings(texts, model = config.AI.EMBEDDING_MODEL) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts array is required');
    }

    const batchSize = 100; // OpenAI limit
    const results = [];

    try {
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        const response = await openai.embeddings.create({
          model,
          input: batch.map(text => text.trim().slice(0, 8000))
        });

        results.push(...response.data.map(item => item.embedding));
        
        // Rate limiting for large batches
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results;
    } catch (error) {
      console.error('Batch embedding generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Token counting utility
   */
  static estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Model availability check
   */
  static async checkModelAvailability(model) {
    try {
      const models = await openai.models.list();
      return models.data.some(m => m.id === model);
    } catch (error) {
      console.error('Model availability check failed:', error.message);
      return false;
    }
  }
}

/**
 * Test OpenAI connection and capabilities
 */
export async function testOpenAIConnection() {
  try {
    console.log('🔍 Testing OpenAI connection...');
    
    // Test API key validity
    const models = await openai.models.list();
    
    if (!models || !models.data || models.data.length === 0) {
      console.error('❌ No models available');
      return false;
    }

    // Test embedding generation
    try {
      await OpenAIService.generateEmbedding('test message');
    } catch (error) {
      console.warn('⚠️ Embedding generation test failed:', error.message);
    }

    // Test chat completion
    try {
      const testCompletion = await OpenAIService.createChatCompletion([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10 });
      
      if (!testCompletion.response.choices[0].message.content) {
        console.warn('⚠️ Chat completion test returned empty response');
      }
    } catch (error) {
      console.warn('⚠️ Chat completion test failed:', error.message);
    }

    console.log('✅ OpenAI connection successful');
    console.log(`📊 Available models: ${models.data.length}`);
    return true;
    
  } catch (error) {
    console.error('❌ OpenAI connection failed:', error.message);
    
    if (error.status === 401) {
      console.error('🔑 API key is invalid or expired');
    } else if (error.status === 429) {
      console.error('⏰ Rate limit exceeded');
    }
    
    return false;
  }
}

/**
 * Usage monitoring and alerting
 */
export class UsageMonitor {
  static dailyUsage = {
    date: new Date().toDateString(),
    requests: 0,
    tokens: 0,
    cost: 0
  };

  static logUsage(tokens, cost, model) {
    const today = new Date().toDateString();
    
    if (this.dailyUsage.date !== today) {
      this.dailyUsage = { date: today, requests: 0, tokens: 0, cost: 0 };
    }
    
    this.dailyUsage.requests++;
    this.dailyUsage.tokens += tokens;
    this.dailyUsage.cost += cost;

    // Alert on high usage
    if (this.dailyUsage.cost > 50) {
      console.warn(`⚠️ High daily OpenAI usage: $${this.dailyUsage.cost.toFixed(2)}`);
    }
  }

  static getDailyUsage() {
    return { ...this.dailyUsage };
  }
}

export default openai;
