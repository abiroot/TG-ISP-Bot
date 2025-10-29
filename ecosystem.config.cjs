/**
 * PM2 Ecosystem Configuration
 *
 * This file defines how PM2 should manage the application
 * with proper restart policies and error handling
 *
 * Documentation: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
  apps: [
    {
      // Application configuration
      name: 'tg-isp.abiroot.dev',
      script: './dist/app.js',
      interpreter: 'node',

      // Environment
      env: {
        NODE_ENV: 'production',
      },

      // Restart policies - CRITICAL for preventing infinite restart loops
      max_restarts: 10,              // Max 10 restarts within min_uptime window
      min_uptime: 10000,             // App must stay up 10s to be considered stable
      restart_delay: 5000,           // Wait 5s between restarts
      exp_backoff_restart_delay: 1000, // Exponential backoff starting at 1s
      max_memory_restart: '500M',    // Restart if memory exceeds 500MB

      // Automatically restart on file changes (disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],

      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,

      // Advanced features
      kill_timeout: 30000,           // Wait 30s for graceful shutdown (BuilderBot needs time)
      listen_timeout: 10000,         // Wait 10s for app to be ready
      shutdown_with_message: false,

      // Cluster mode (disabled - use fork mode for single instance)
      instances: 1,
      exec_mode: 'fork',

      // Graceful shutdown
      kill_retry_time: 100,
      wait_ready: false,

      // Process management
      autorestart: true,             // Auto-restart on crash (with limits above)

      // Error handling
      stop_exit_codes: [0],          // Only exit code 0 is considered successful

      // Monitoring
      instance_var: 'INSTANCE_ID',
    }
  ]
}
