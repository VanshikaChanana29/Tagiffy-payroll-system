// pm2 process definitions for Dayflow HRMS.
//
// Mirrors the three processes that `npm run dev:all` starts with `concurrently`
// (local MongoDB, the Express API, and the Vite dev server), but under pm2 so
// they keep running in the background, restart on crash, and give you
// centralized logs/status instead of one shared terminal.
//
// Usage:
//   npx pm2 start ecosystem.config.js     # start all three
//   npx pm2 status                        # see what's running
//   npx pm2 logs                          # tail logs from all apps
//   npx pm2 logs dayflow-server           # tail logs from one app
//   npx pm2 stop ecosystem.config.js      # stop all three
//   npx pm2 restart ecosystem.config.js   # restart all three
//   npx pm2 delete ecosystem.config.js    # remove them from pm2's list
//
// Note: the client here runs Vite's dev server (not a production build),
// because the API's CORS whitelist and Vite's own dev proxy are both hard-
// coded to http://localhost:5173. If you want a production build instead,
// run `npm --prefix client run build` and serve the resulting client/dist
// folder from a static file server or from the Express app.

const path = require('path');

const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');

module.exports = {
  apps: [
    {
      name: 'dayflow-db',
      script: path.join(SERVER_DIR, 'src/utils/startMongo.js'),
      cwd: SERVER_DIR,
      autorestart: true,
      watch: false,
    },
    {
      name: 'dayflow-server',
      script: path.join(SERVER_DIR, 'src/server.js'),
      cwd: SERVER_DIR,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'dayflow-client',
      script: path.join(CLIENT_DIR, 'node_modules/vite/bin/vite.js'),
      cwd: CLIENT_DIR,
      autorestart: true,
      watch: false,
    },
  ],
};
