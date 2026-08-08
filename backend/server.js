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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`  College Attendance Server running on port ${PORT}`);
  console.log(`=================================================`);
});
