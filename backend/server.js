require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { router: authRouter } = require('./routes/auth');
const studentRouter = require('./routes/students');
const facultyRouter = require('./routes/faculty');
const otpRouter = require('./routes/otp');
const qrRouter = require('./routes/qr');
const attendanceRouter = require('./routes/attendance');
const locationRouter = require('./routes/location');
const leavesRouter = require('./routes/leaves');
const syncRouter = require('./routes/sync');
const noticesRouter = require('./routes/notices');
const rulesRouter = require('./routes/rules');
const subjectsRouter = require('./routes/subjects');
const semestersRouter = require('./routes/semesters');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  'http://localhost:3050',
  'http://localhost:5000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, cURL, server-to-server)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive CORS for public API client endpoints
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/students', studentRouter);
app.use('/api/faculty', facultyRouter);
app.use('/api/otp', otpRouter);
app.use('/api/qr', qrRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/location', locationRouter);
app.use('/api/leaves', leavesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api/semesters', semestersRouter);

// Serve frontend build static files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback for SPA routing in production
app.get('*', (req, res, next) => {
  // If the request is for an API path, pass it through so it gets a proper API 404
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`  College Attendance Server running on port ${PORT}`);
  console.log(`=================================================`);
});

// Configure Keep-Alive timeout higher than reverse proxies (Vite/Nginx)
// to prevent ECONNRESET on reused idle sockets
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
