/**
 * PM2 ecosystem config — use this when running ArtixPOS on a VPS without Docker.
 *
 * Install PM2 globally:  npm install -g pm2
 * Start:                 pm2 start ecosystem.config.cjs
 * Save to auto-start:    pm2 save && pm2 startup
 * View logs:             pm2 logs artixpos
 * Reload (zero-downtime):pm2 reload artixpos
 */

module.exports = {
  apps: [
    {
      name: "artixpos",

      // The compiled cluster entry point uses all CPU cores automatically.
      script: "./dist/cluster.cjs",

      // PM2 will NOT fork additional instances — the Node cluster module inside
      // cluster.cjs already handles multi-core. Set CLUSTER_WORKERS in env to
      // limit how many cores are used.
      instances: 1,
      exec_mode: "fork",

      // Restart on crash, but not in a tight loop
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,

      // Watch for production — leave false; use pm2 reload for zero-downtime updates
      watch: false,

      // Memory guard — restart if the primary process exceeds 512 MB
      max_memory_restart: "512M",

      env: {
        NODE_ENV: "production",
        PORT: 5000,
        // Copy your .env values here or load via dotenv / system env
      },

      // Merge stdout + stderr into a single log file per rotation period
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
