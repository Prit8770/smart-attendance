const express = require('express');
const router = express.Router();
const { dbQuery } = require('../db');
const { authenticateJWT } = require('./auth');

// Middleware to restrict to admins or faculty
const requireAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'faculty')) {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins or Faculty only' });
  }
};

// Get today's local date string (YYYY-MM-DD)
function getLocalDateString() {
  const d = new Date();
  // Adjust for local timezone offset
  const offset = d.getTimezoneOffset();
  const localD = new Date(d.getTime() - (offset * 60 * 1000));
  return localD.toISOString().split('T')[0];
}

// GET today's OTP history and current remaining counts
router.get('/today', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    const otps = await dbQuery.all(
      'SELECT id, otp, generated_time, expire_time, date FROM otp WHERE date = ? ORDER BY id DESC',
      [today]
    );

    const remaining = Math.max(0, 5 - otps.length);

    res.json({
      otps,
      remaining,
      totalToday: otps.length
    });
  } catch (err) {
    console.error('Error fetching OTP history:', err);
    res.status(500).json({ error: 'Failed to fetch OTP details' });
  }
});

// GET the active OTP (for countdown / current OTP display on Admin dashboard)
router.get('/active', authenticateJWT, async (req, res) => {
  try {
    // Find the latest generated OTP
    const latestOtp = await dbQuery.get('SELECT * FROM otp ORDER BY id DESC LIMIT 1');

    if (!latestOtp) {
      return res.json({ active: false, otp: null });
    }

    const now = new Date().getTime();
    const expireTime = new Date(latestOtp.expire_time).getTime();

    if (now < expireTime) {
      res.json({
        active: true,
        otp: latestOtp.otp,
        generatedTime: latestOtp.generated_time,
        expireTime: latestOtp.expire_time,
        secondsLeft: Math.max(0, Math.floor((expireTime - now) / 1000))
      });
    } else {
      res.json({ active: false, otp: null });
    }
  } catch (err) {
    console.error('Error checking active OTP:', err);
    res.status(500).json({ error: 'Failed to check active OTP' });
  }
});

// POST generate new OTP
router.post('/generate', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();

  try {
    // 1. Check daily limit (Max 5 OTPs per day)
    const otpsToday = await dbQuery.all('SELECT id FROM otp WHERE date = ?', [today]);
    if (otpsToday.length >= 5) {
      return res.status(400).json({ error: 'Maximum limit of 5 OTPs per day has been reached.' });
    }

    // 2. Generate a random 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));

    // 3. Set expiry time (2 minutes from now)
    const now = new Date();
    const generatedTime = now.toISOString();
    const expireTime = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

    const result = await dbQuery.run(
      'INSERT INTO otp (otp, generated_time, expire_time, generated_by, date) VALUES (?, ?, ?, ?, ?)',
      [otpCode, generatedTime, expireTime, req.user.id, today]
    );

    res.status(201).json({
      message: 'OTP generated successfully',
      otp: {
        id: result.id,
        otp: otpCode,
        generatedTime,
        expireTime,
        secondsLeft: 120
      }
    });
  } catch (err) {
    console.error('Error generating OTP:', err);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

module.exports = router;
