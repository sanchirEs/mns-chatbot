/**
 * Legacy Entry Point - Redirects to Enterprise Application
 * 
 * This file maintains backward compatibility while redirecting to the new
 * enterprise-grade application structure located in src/app.js
 */

import('./src/app.js')
  .then(({ default: app }) => {
    console.log('🚀 Starting AI Pharmacy Chatbot Enterprise Edition...');
    console.log('📁 Application structure upgraded to enterprise standards');
    console.log('🔗 Legacy index.js is now redirecting to src/app.js');
    console.log('\n' + '='.repeat(60));
    console.log('🆙 UPGRADE COMPLETE!');
    console.log('📚 Check README.md for new features and documentation');
    console.log('🛠️  Available endpoints: /api/chat, /api/search, /api/orders');
    console.log('💡 Use npm run dev for development mode');
    console.log('='.repeat(60) + '\n');
  })
  .catch(error => {
    console.error('❌ Failed to start enterprise application:', error);
    console.error('💡 Make sure all dependencies are installed: npm install');
    process.exit(1);
  });

// Note: The original simple chatbot code has been evolved into a comprehensive
// enterprise-grade system with the following enhancements:
//
// 🔹 Advanced Features:
//   • RAG with semantic search and vector embeddings
//   • 14+ specialized pharmacy functions (orders, stock, consultations)
//   • Streaming responses for real-time chat experience
//   • Conversation memory and context management
//   • Multi-modal search (semantic + full-text)
//
// 🔹 Enterprise Security:
//   • JWT authentication with role-based permissions
//   • Progressive rate limiting and IP-based rules
//   • Input validation and XSS prevention
//   • Security headers and CORS configuration
//
// 🔹 Production Ready:
//   • Comprehensive error handling and monitoring
//   • Database connection pooling and optimization
//   • Caching strategies and performance optimization
//   • Graceful shutdown and health monitoring
//   • Structured logging and analytics
//
// 🔹 Scalability:
//   • Modular architecture with separation of concerns
//   • Configurable via environment variables
//   • Horizontal scaling support
//   • Database migrations and maintenance tools
//
// The simple chatbot you started with has been transformed into a
// production-ready enterprise solution while maintaining full backward compatibility.
