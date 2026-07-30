const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbQuery } = require('../db');
const { authenticateJWT } = require('./auth');

// Middleware to restrict to admins or faculty
const requireAdminOrFaculty = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'faculty')) {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins or Faculty only' });
  }
};

// Middleware to restrict strictly to faculty
const requireFacultyOnly = (req, res, next) => {
  if (req.user && req.user.role === 'faculty') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Faculty only can generate QR codes.' });
  }
};

// Get today's local date string (YYYY-MM-DD)
function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localD = new Date(d.getTime() - (offset * 60 * 1000));
  return localD.toISOString().split('T')[0];
}

// GET the global QR generation settings
router.get('/settings', authenticateJWT, async (req, res) => {
  try {
    const qrSetting = await dbQuery.get("SELECT value FROM settings WHERE key = 'qr_generation_enabled'");
    res.json({ enabled: qrSetting ? qrSetting.value === 'true' : true });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST toggle the global QR generation setting (Admins only)
router.post('/toggle-settings', authenticateJWT, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  const { enabled } = req.body;
  try {
    await dbQuery.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_generation_enabled', ?)",
      [enabled ? 'true' : 'false']
    );
    res.json({ success: true, enabled });
  } catch (err) {
    console.error('Error toggling settings:', err);
    res.status(500).json({ error: 'Failed to toggle settings' });
  }
});

// POST start new QR session (Faculty only)
router.post('/start-session', authenticateJWT, requireFacultyOnly, async (req, res) => {
  const today = getLocalDateString();
  try {
    // 1. Check if global QR generation is enabled by Admin
    const qrSetting = await dbQuery.get("SELECT value FROM settings WHERE key = 'qr_generation_enabled'");
    if (qrSetting && qrSetting.value !== 'true') {
      return res.status(403).json({ error: 'QR Attendance session generation is currently disabled by Admin.' });
    }

    // 2. Check if this specific faculty member has already generated 5 sessions today
    const countRow = await dbQuery.get(
      "SELECT COUNT(*) as count FROM qr_sessions WHERE created_by_faculty_id = ? AND date = ?",
      [req.user.id, today]
    );
    if (countRow && countRow.count >= 5) {
      return res.status(403).json({ error: 'Daily limit reached. You can generate a maximum of 5 QR sessions per day.' });
    }

    // Generate 6 random 16-character hex tokens (120 seconds valid, changed every 20 seconds)
    const tokens = [];
    for (let i = 0; i < 6; i++) {
      tokens.push(crypto.randomBytes(8).toString('hex'));
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes

    const result = await dbQuery.run(
      'INSERT INTO qr_sessions (created_at, expires_at, created_by_faculty_id, date, tokens) VALUES (?, ?, ?, ?, ?)',
      [createdAt, expiresAt, req.user.id, today, JSON.stringify(tokens)]
    );

    res.status(201).json({
      message: 'QR session started successfully',
      session: {
        id: result.id,
        createdAt,
        expiresAt,
        tokens,
        secondsLeft: 120
      }
    });
  } catch (err) {
    console.error('Error starting QR session:', err);
    res.status(500).json({ error: 'Failed to start QR session' });
  }
});

// GET the active QR session (for dashboard polling/reload synchronization)
router.get('/active', authenticateJWT, async (req, res) => {
  try {
    // Find the latest generated session
    const latestSession = await dbQuery.get(
      `SELECT q.*, f.name as faculty_name 
       FROM qr_sessions q 
       LEFT JOIN faculty f ON q.created_by_faculty_id = f.id 
       ORDER BY q.id DESC LIMIT 1`
    );

    if (!latestSession) {
      return res.json({ active: false });
    }

    const now = new Date().getTime();
    const expireTime = new Date(latestSession.expires_at).getTime();

    if (now < expireTime) {
      res.json({
        active: true,
        session: {
          id: latestSession.id,
          createdAt: latestSession.created_at,
          expiresAt: latestSession.expires_at,
          tokens: JSON.parse(latestSession.tokens),
          facultyName: latestSession.faculty_name || 'Admin'
        },
        secondsLeft: Math.max(0, Math.floor((expireTime - now) / 1000))
      });
    } else {
      res.json({ active: false });
    }
  } catch (err) {
    console.error('Error checking active QR session:', err);
    res.status(500).json({ error: 'Failed to check active QR session' });
  }
});

// GET today's QR sessions list (history)
router.get('/today', authenticateJWT, requireAdminOrFaculty, async (req, res) => {
  const today = getLocalDateString();
  try {
    const sessions = await dbQuery.all(
      `SELECT q.id, q.created_at, q.expires_at, q.date, f.name as faculty_name 
       FROM qr_sessions q
       LEFT JOIN faculty f ON q.created_by_faculty_id = f.id
       WHERE q.date = ? 
       ORDER BY q.id DESC`,
      [today]
    );

    // Get count of checkins for each session
    const sessionsWithCount = await Promise.all(sessions.map(async (sess) => {
      const checkins = await dbQuery.get(
        "SELECT COUNT(*) as count FROM attendance WHERE qr_session_id = ? AND status = 'Success'",
        [sess.id]
      );
      return {
        ...sess,
        presentCount: checkins.count
      };
    }));

    res.json(sessionsWithCount);
  } catch (err) {
    console.error('Error fetching today\'s QR sessions:', err);
    res.status(500).json({ error: 'Failed to retrieve today\'s QR sessions' });
  }
});

module.exports = router;
