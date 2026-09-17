const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Profile photos are served as plain files so <img> tags can load them without
// an Authorization header. Filenames carry a long random suffix, so they are not
// enumerable. Employee documents are NOT served this way — they stay behind the
// authenticated download route.
const express_static_path = require('path');
app.use(
  '/api/files/avatars',
  express.static(express_static_path.resolve(__dirname, '../uploads/avatars'), {
    maxAge: '1d',
    fallthrough: false,
  })
);

// Serve the built React client (client/dist) once it exists, so the API and
// the frontend can run as a single process/port in production instead of a
// separate Vite dev server. Build it first with `npm --prefix client run build`.
// In local dev, dist won't exist yet and this stays inactive — use
// `npm run dev:client` (Vite's own dev server) instead.
const fs = require('fs');
const clientDistPath = express_static_path.resolve(__dirname, '../../client/dist');
const clientBuildExists = fs.existsSync(express_static_path.join(clientDistPath, 'index.html'));
if (clientBuildExists) {
  app.use(express.static(clientDistPath));
}

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/salaries', require('./routes/salaryRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/designations', require('./routes/designationRoutes'));
app.use('/api/org-settings', require('./routes/orgSettingsRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/holidays', require('./routes/holidayRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Dayflow HRMS API server is running smoothly',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Central 404 handler for unknown routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route ${req.originalUrl} not found`,
  });
});

// Any other GET request is a client-side route (e.g. /dashboard, /login) —
// hand back the built React app's index.html so React Router can render it
// and deep links / page refreshes work. Only active when a build exists.
if (clientBuildExists) {
  app.get('*', (req, res) => {
    res.sendFile(express_static_path.join(clientDistPath, 'index.html'));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Connect to MongoDB first, then start listening — so the API never accepts
// requests it cannot serve.
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Dayflow HRMS Server listening on http://localhost:${PORT}`);
      console.log(`📡 Health check available at http://localhost:${PORT}/api/health`);
    });
  });
} else {
  connectDB();
}

module.exports = app;
