const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
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
    let otpsQuery = supabase.from('otp')
      .select('id, otp, generated_time, expire_time, date')
      .eq('date', today)
      .order('id', { ascending: false });
    if (req.user && req.user.role === 'faculty') {
      otpsQuery = otpsQuery.eq('generated_by', req.user.id);
    }
    const { data: otps, error } = await otpsQuery;

    if (error) throw error;
    
    const safeOtps = otps || [];
    const remaining = Math.max(0, 5 - safeOtps.length);

    res.json({
      otps: safeOtps,
      remaining,
      totalToday: safeOtps.length
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
    let latestOtpQuery = supabase.from('otp')
      .select('*')
      .order('id', { ascending: false })
      .limit(1);
    if (req.user && req.user.role === 'faculty') {
      latestOtpQuery = latestOtpQuery.eq('generated_by', req.user.id);
    }
    const { data: latestOtp } = await latestOtpQuery.maybeSingle();

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
        secondsLeft: Math.max(0, Math.floor((expireTime - now) / 1000)),
        semester: latestOtp.semester || null,
        division: latestOtp.division || null
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
  const { semester, division } = req.body;
  const today = getLocalDateString();

  try {
    // 1. Check daily limit (Max 5 OTPs per day)
    const { data: otpsToday } = await supabase.from('otp').select('id').eq('date', today);
    const safeOtpsToday = otpsToday || [];
    if (safeOtpsToday.length >= 5) {
      return res.status(400).json({ error: 'Maximum limit of 5 OTPs per day has been reached.' });
    }

    // 2. Generate a random 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));

    // 3. Set expiry time (2 minutes from now)
    const now = new Date();
    const generatedTime = now.toISOString();
    const expireTime = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

    const { data: result, error } = await supabase.from('otp').insert([{
      otp: otpCode,
      generated_time: generatedTime,
      expire_time: expireTime,
      generated_by: req.user.id,
      date: today,
      semester: semester ? parseInt(semester) : null,
      division: (division && String(division).trim() !== '') ? String(division).trim().toUpperCase() : null
    }]).select().single();
    
    if (error) {
      if (error.code === 'PGRST204' || (error.message && (error.message.includes('division') || error.message.includes('schema cache')))) {
        return res.status(400).json({ 
          error: "Supabase DB Error: 'division' column otp table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE otp ADD COLUMN IF NOT EXISTS division TEXT;\nALTER TABLE qr_sessions ADD COLUMN IF NOT EXISTS division TEXT;" 
        });
      }
      throw error;
    }

    res.status(201).json({
      message: 'OTP generated successfully',
      otp: {
        id: result.id,
        otp: otpCode,
        generatedTime,
        expireTime,
        secondsLeft: 120,
        semester: result.semester || null,
        division: result.division || null
      }
    });
  } catch (err) {
    console.error('Error generating OTP:', err);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

module.exports = router;
