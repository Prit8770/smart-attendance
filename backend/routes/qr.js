const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('../db');
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
    const { data: qrSetting } = await supabase.from('settings').select('value').eq('key', 'qr_generation_enabled').maybeSingle();
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
    await supabase.from('settings').upsert({ key: 'qr_generation_enabled', value: enabled ? 'true' : 'false' });
    res.json({ success: true, enabled });
  } catch (err) {
    console.error('Error toggling settings:', err);
    res.status(500).json({ error: 'Failed to toggle settings' });
  }
});

// POST start new QR session (Faculty only)
router.post('/start-session', authenticateJWT, requireFacultyOnly, async (req, res) => {
  const { semester, division } = req.body;
  const today = getLocalDateString();
  try {
    // 1. Check if global QR generation is enabled by Admin
    const { data: qrSetting } = await supabase.from('settings').select('value').eq('key', 'qr_generation_enabled').maybeSingle();
    if (qrSetting && qrSetting.value !== 'true') {
      return res.status(403).json({ error: 'QR Attendance session generation is currently disabled by Admin.' });
    }

    // 2. Check if this specific faculty member has already generated 5 sessions today
    const { count } = await supabase.from('qr_sessions').select('*', { count: 'exact', head: true })
      .eq('created_by_faculty_id', req.user.id)
      .eq('date', today);

    if (count !== null && count >= 5) {
      return res.status(403).json({ error: 'Daily limit reached. You can generate a maximum of 5 QR sessions per day.' });
    }

    // Generate 8 random 16-character hex tokens (120 seconds valid, changed every 15 seconds)
    const tokens = [];
    for (let i = 0; i < 8; i++) {
      tokens.push(crypto.randomBytes(8).toString('hex'));
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes

    const { data: result, error } = await supabase.from('qr_sessions').insert([{
      created_at: createdAt,
      expires_at: expiresAt,
      created_by_faculty_id: req.user.id,
      date: today,
      tokens: JSON.stringify(tokens),
      semester: semester ? parseInt(semester) : null,
      division: (division && String(division).trim() !== '') ? String(division).trim().toUpperCase() : null
    }]).select().single();
    
    if (error) {
      if (error.code === 'PGRST204' || (error.message && (error.message.includes('division') || error.message.includes('schema cache')))) {
        return res.status(400).json({ 
          error: "Supabase DB Error: 'division' column qr_sessions table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE qr_sessions ADD COLUMN IF NOT EXISTS division TEXT;\nALTER TABLE otp ADD COLUMN IF NOT EXISTS division TEXT;" 
        });
      }
      throw error;
    }

    res.status(201).json({
      message: 'QR session started successfully',
      session: {
        id: result.id,
        createdAt,
        expiresAt,
        tokens,
        secondsLeft: 120,
        semester: result.semester || null,
        division: result.division || null
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
    let sessionQuery = supabase.from('qr_sessions')
      .select('*, faculty:created_by_faculty_id(name)')
      .order('id', { ascending: false })
      .limit(1);
    if (req.user && req.user.role === 'faculty') {
      sessionQuery = sessionQuery.eq('created_by_faculty_id', req.user.id);
    }
    const { data: latestSession } = await sessionQuery.maybeSingle();

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
          facultyName: latestSession.faculty?.name || 'Admin',
          semester: latestSession.semester || null,
          division: latestSession.division || null
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
    let sessionsQuery = supabase.from('qr_sessions')
      .select('id, created_at, expires_at, date, faculty:created_by_faculty_id(name)')
      .eq('date', today)
      .order('id', { ascending: false });
    if (req.user.role === 'faculty') {
      sessionsQuery = sessionsQuery.eq('created_by_faculty_id', req.user.id);
    }
    const { data: sessions, error } = await sessionsQuery;

    if (error) throw error;
    
    const safeSessions = sessions || [];

    // Get count of checkins for each session
    const sessionsWithCount = await Promise.all(safeSessions.map(async (sess) => {
      const { count } = await supabase.from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('qr_session_id', sess.id)
        .eq('status', 'Success');

      return {
        id: sess.id,
        created_at: sess.created_at,
        expires_at: sess.expires_at,
        date: sess.date,
        faculty_name: sess.faculty?.name || 'Admin',
        presentCount: count || 0
      };
    }));

    res.json(sessionsWithCount);
  } catch (err) {
    console.error('Error fetching today\'s QR sessions:', err);
    res.status(500).json({ error: 'Failed to retrieve today\'s QR sessions' });
  }
});

module.exports = router;
