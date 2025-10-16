import cron from 'node-cron';
import { DataSyncService } from '../services/dataSyncService.js';
import config from '../config/environment.js';

/**
 * Sync Scheduler
 * Manages automated synchronization tasks with cron jobs
 */
export class SyncScheduler {
  static jobs = [];
  static isRunning = false;

  /**
   * Start all scheduled sync jobs
   */
  static start() {
    if (this.isRunning) {
      console.warn('⚠️ Scheduler already running');
      return;
    }

    console.log('📅 Starting sync scheduler...');
    console.log('=' .repeat(60));
    console.log('🔧 Production sync configuration:');
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Scheduler enabled: ${config.SYNC.ENABLE_SCHEDULER}`);
    console.log(`   Redis enabled: ${config.REDIS.ENABLE_REDIS}`);
    console.log(`   Timezone: ${config.SYNC.TIMEZONE}`);
    console.log('=' .repeat(60));

    try {
      // Initialize Redis connection
      DataSyncService.initializeRedis().catch(err => {
        console.warn('⚠️ Redis initialization failed:', err.message);
      });

      // Job 1: Quick stock sync - Every 5 minutes
      const stockSyncJob = cron.schedule('*/5 * * * *', async () => {
        const startTime = Date.now();
        console.log('\n⚡ [SCHEDULED] Quick stock sync started...');
        console.log(`   Time: ${new Date().toISOString()}`);
        console.log(`   Environment: ${process.env.NODE_ENV}`);
        
        try {
          // FIXED: Increase quick sync to handle all products (7k+)
          const result = await DataSyncService.quickStockSync({ maxProducts: 7000 });
          const duration = Date.now() - startTime;
          console.log(`✅ [SCHEDULED] Stock sync completed: ${result.stats.updated} products (${duration}ms)`);
          console.log(`   Processed: ${result.stats.processed}, Cached: ${result.stats.cached}, Failed: ${result.stats.failed}`);
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`❌ [SCHEDULED] Stock sync failed after ${duration}ms:`, error.message);
          console.error('   Stack trace:', error.stack);
        }
      }, {
        scheduled: true,
        timezone: "Asia/Ulaanbaatar" // Mongolia timezone
      });

      this.jobs.push({ name: 'stock_sync', job: stockSyncJob, schedule: 'Every 5 minutes' });
      console.log('✅ Stock sync scheduled: Every 5 minutes');

      // Job 2: Full catalog sync - Daily at 2 AM
      const catalogSyncJob = cron.schedule('0 2 * * *', async () => {
        console.log('\n🔄 [SCHEDULED] Full catalog sync started...');
        try {
          const result = await DataSyncService.fullCatalogSync({
            batchSize: 100,
            maxProducts: null, // Sync all products
            generateEmbeddings: true
          });
          console.log(`✅ [SCHEDULED] Catalog sync completed: ${result.stats.processed} products`);
        } catch (error) {
          console.error('❌ [SCHEDULED] Catalog sync failed:', error.message);
        }
      }, {
        scheduled: true,
        timezone: "Asia/Ulaanbaatar"
      });

      this.jobs.push({ name: 'catalog_sync', job: catalogSyncJob, schedule: 'Daily at 2:00 AM' });
      console.log('✅ Catalog sync scheduled: Daily at 2:00 AM (Mongolia time)');

      // Job 3: Cache cleanup - Every hour
      const cacheCleanupJob = cron.schedule('0 * * * *', async () => {
        console.log('\n🧹 [SCHEDULED] Cache cleanup started...');
        try {
          // Import supabase dynamically to avoid import issues
          const { supabase } = await import('../config/database.js');
          
          // Clean expired database cache entries
          const { data } = await supabase.rpc('cleanup_expired_cache');
          console.log(`✅ [SCHEDULED] Cleaned ${data || 0} expired cache entries`);
        } catch (error) {
          console.error('❌ [SCHEDULED] Cache cleanup failed:', error.message);
        }
      }, {
        scheduled: true
      });

      this.jobs.push({ name: 'cache_cleanup', job: cacheCleanupJob, schedule: 'Every hour' });
      console.log('✅ Cache cleanup scheduled: Every hour');

      // Job 4: Health check - Every 30 minutes
      const healthCheckJob = cron.schedule('*/30 * * * *', async () => {
        try {
          const status = await DataSyncService.getSyncStatus();
          
          if (status.health === 'unhealthy' || status.health === 'stale') {
            console.warn(`⚠️ [HEALTH CHECK] Sync health: ${status.health}`);
            console.warn(`   Last sync: ${status.lastSync?.completed || 'never'}`);
            console.warn(`   Total products: ${status.database?.totalProducts || 0}`);
          } else {
            console.log(`💚 [HEALTH CHECK] Sync health: ${status.health}`);
          }
        } catch (error) {
          console.error('❌ [HEALTH CHECK] Failed:', error.message);
        }
      }, {
        scheduled: true
      });

      this.jobs.push({ name: 'health_check', job: healthCheckJob, schedule: 'Every 30 minutes' });
      console.log('✅ Health check scheduled: Every 30 minutes');

      this.isRunning = true;
      
      console.log('=' .repeat(60));
      console.log(`🎉 Scheduler started with ${this.jobs.length} jobs`);
      console.log('📋 Active jobs:');
      this.jobs.forEach(job => {
        console.log(`   - ${job.name}: ${job.schedule}`);
      });
      console.log('');

    } catch (error) {
      console.error('❌ Failed to start scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  static stop() {
    console.log('🛑 Stopping scheduler...');
    
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`   Stopped: ${name}`);
    });

    this.jobs = [];
    this.isRunning = false;
    
    console.log('✅ Scheduler stopped');
  }

  /**
   * Run manual sync (on-demand)
   */
  static async runManualSync(type = 'stock', options = {}) {
    console.log(`🔧 Running manual ${type} sync...`);
    
    try {
      if (type === 'full' || type === 'catalog') {
        return await DataSyncService.fullCatalogSync({
          batchSize: options.batchSize || 50,
          maxProducts: options.maxProducts || 500,
          generateEmbeddings: options.generateEmbeddings !== false
        });
      } else if (type === 'stock' || type === 'quick') {
        return await DataSyncService.quickStockSync({
          maxProducts: options.maxProducts || 7000  // FIXED: Support 7k+ products
        });
      } else {
        throw new Error(`Unknown sync type: ${type}`);
      }
    } catch (error) {
      console.error(`Manual ${type} sync failed:`, error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  static getStatus() {
    return {
      running: this.isRunning,
      activeJobs: this.jobs.length,
      jobs: this.jobs.map(({ name, schedule }) => ({
        name,
        schedule,
        running: true
      })),
      redisConnected: DataSyncService.redisConnected
    };
  }

  /**
   * Restart a specific job
   */
  static restartJob(jobName) {
    const jobIndex = this.jobs.findIndex(j => j.name === jobName);
    
    if (jobIndex === -1) {
      throw new Error(`Job ${jobName} not found`);
    }

    const job = this.jobs[jobIndex];
    job.job.stop();
    job.job.start();
    
    console.log(`🔄 Restarted job: ${jobName}`);
  }

  /**
   * Run all syncs now (for testing/initialization)
   */
  static async runAllSyncsNow() {
    console.log('🚀 Running all syncs immediately...');
    
    try {
      // Run stock sync first (faster)
      console.log('⚡ Running stock sync...');
      await this.runManualSync('stock');
      
      // Then run catalog sync
      console.log('🔄 Running catalog sync...');
      await this.runManualSync('catalog', { maxProducts: 100 });
      
      console.log('✅ All syncs completed');
      
    } catch (error) {
      console.error('❌ Failed to run all syncs:', error);
      throw error;
    }
  }
}

export default SyncScheduler;

