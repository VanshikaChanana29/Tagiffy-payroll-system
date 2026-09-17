// pm2 process definitions for a PRODUCTION run of Dayflow HRMS.
//
// Unlike ecosystem.config.js (which runs Vite's dev server for the client),
// this expects the client to already be built as static files, and has the
// Express server (server/src/server.js) serve those files itself — so the
// API and the frontend are one process on one port. See the "Serve the built
// React client" block in server/src/server.js.
//
// One-time / per-deploy steps:
//   npm run build            # builds client/dist
//
// Then:
//   npx pm2 start ecosystem.prod.config.js
//   npx pm2 status
//   npx pm2 logs
//   npx pm2 stop ecosystem.prod.config.js
//   npx pm2 restart ecosystem.prod.config.js   # after a new `npm run build`
//   npx pm2 delete ecosystem.prod.config.js
//
// Only two processes are needed: the local MongoDB and the server itself
// (which now also serves the client — no separate Vite process).

const path = require('path');

const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, 'server');

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
        NODE_ENV: 'production',
      },
    },
  ],
};
