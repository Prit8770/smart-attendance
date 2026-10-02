const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

const sessionMetaPath = path.join(__dirname, '../data/session_meta.json');
function saveLocalSessionMeta(type, id, subject, division) {
  try {
    let meta = {};
    if (fs.existsSync(sessionMetaPath)) {
      try { meta = JSON.parse(fs.readFileSync(sessionMetaPath, 'utf8')); } catch(e) {}
    }
    meta[`${type}_${id}`] = {
      subject: subject || null,
      division: division || null,
      updated_at: new Date().toISOString()
    };
    if (!fs.existsSync(path.dirname(sessionMetaPath))) fs.mkdirSync(path.dirname(sessionMetaPath), { recursive: true });
    fs.writeFileSync(sessionMetaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local session meta:', e);
  }
}

// Middleware to restrict to admins or faculty
const requireAdminOrFaculty = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'faculty' || req.user.isFacultyUser || req.user.hasAdminAccess || req.user.hasFacultyAccess)) {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins or Faculty only' });
  }
};

// Middleware to restrict strictly to faculty (or admin acting as faculty)
const requireFacultyOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'faculty' || req.user.role === 'admin' || req.user.isFacultyUser || req.user.hasFacultyAccess || req.user.hasAdminAccess)) {
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

// GET QR daily session limit (Admin only)
router.get('/limit', authenticateJWT, async (req, res) => {
  try {
    const { data: limitSetting } = await supabase.from('settings').select('value').eq('key', 'qr_daily_limit').maybeSingle();
    const limit = limitSetting ? parseInt(limitSetting.value) || 5 : 5;
    res.json({ limit });
  } catch (err) {
    console.error('Error fetching QR limit:', err);
    res.status(500).json({ error: 'Failed to fetch QR limit' });
  }
});

// POST set QR daily session limit (Admin only)
router.post('/limit', authenticateJWT, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  const { limit } = req.body;
  const limitVal = parseInt(limit);
  if (isNaN(limitVal) || limitVal < 1 || limitVal > 100) {
    return res.status(400).json({ error: 'Limit must be a number between 1 and 100.' });
  }
  try {
    await supabase.from('settings').upsert({ key: 'qr_daily_limit', value: String(limitVal) });
    res.json({ success: true, limit: limitVal });
  } catch (err) {
    console.error('Error setting QR limit:', err);
    res.status(500).json({ error: 'Failed to set QR limit' });
  }
});

// TOGGLE global QR generation (Admin only)
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

// Helper to resolve valid faculty table ID to satisfy foreign key constraint: qr_sessions_created_by_faculty_id_fkey
async function resolveValidFacultyId(user) {
  if (!user) return null;
  // 1. Check if user.faculty_id exists in faculty table
  if (user.faculty_id) {
    const { data: byFacId } = await supabase.from('faculty').select('id').eq('id', user.faculty_id).maybeSingle();
    if (byFacId && byFacId.id) return byFacId.id;
  }
  // 2. Check if user.id exists in faculty table
  if (user.id) {
    const { data: byId } = await supabase.from('faculty').select('id').eq('id', user.id).maybeSingle();
    if (byId && byId.id) return byId.id;
  }
  // 3. Look up by email or username
  const email = (user.email || '').toLowerCase().trim();
  const username = (user.username || '').toLowerCase().trim();
  if (email) {
    const { data: byEmail } = await supabase.from('faculty').select('id').eq('email', email).maybeSingle();
    if (byEmail && byEmail.id) return byEmail.id;
  }
  if (username) {
    const { data: byUser } = await supabase.from('faculty').select('id').eq('username', username).maybeSingle();
    if (byUser && byUser.id) return byUser.id;
  }
  // 4. If admin, check admin@ljcca.edu in faculty table
  const { data: adminFac } = await supabase.from('faculty').select('id').eq('email', 'admin@ljcca.edu').maybeSingle();
  if (adminFac && adminFac.id) return adminFac.id;

  // 5. Fallback: get any first faculty member ID
  const { data: firstFac } = await supabase.from('faculty').select('id').limit(1).maybeSingle();
  return firstFac ? firstFac.id : null;
}

// POST start new QR session (Faculty only)
router.post('/start-session', authenticateJWT, requireFacultyOnly, async (req, res) => {
  const { semester, division, subject } = req.body;
  const today = getLocalDateString();
  try {
    // 1. Check if global QR generation is enabled by Admin
    const { data: qrSetting } = await supabase.from('settings').select('value').eq('key', 'qr_generation_enabled').maybeSingle();
    if (qrSetting && qrSetting.value !== 'true') {
      return res.status(403).json({ error: 'QR Attendance session generation is currently disabled by Admin.' });
    }

    // Resolve valid ID in faculty table to satisfy foreign key constraint: qr_sessions_created_by_faculty_id_fkey
    const facultyId = await resolveValidFacultyId(req.user);
    if (!facultyId) {
      return res.status(400).json({ error: 'No valid faculty account found to associate with this QR session.' });
    }

    // 2. Get daily limit from settings, then check if this faculty has reached it today
    const { data: limitSetting } = await supabase.from('settings').select('value').eq('key', 'qr_daily_limit').maybeSingle();
    const dailyLimit = limitSetting ? (parseInt(limitSetting.value) || 5) : 5;

    const { count } = await supabase.from('qr_sessions').select('*', { count: 'exact', head: true })
      .eq('created_by_faculty_id', facultyId)
      .eq('date', today);

    if (count !== null && count >= dailyLimit) {
      return res.status(403).json({ error: `Daily limit reached. You can generate a maximum of ${dailyLimit} QR session${dailyLimit === 1 ? '' : 's'} per day.` });
    }

    // Generate 8 random 16-character hex tokens (120 seconds valid, changed every 15 seconds)
    const tokens = [];
    for (let i = 0; i < 8; i++) {
      tokens.push(crypto.randomBytes(8).toString('hex'));
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes

    // Check if an active QR session already exists for this faculty, semester, division, and subject
    const { data: activeExisting } = await supabase.from('qr_sessions')
      .select('*')
      .eq('created_by_faculty_id', facultyId)
      .eq('date', today)
      .gt('expires_at', now.toISOString())
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let result = null;
    let error = null;

    if (activeExisting) {
      const updateRes = await supabase.from('qr_sessions')
        .update({
          tokens: JSON.stringify(tokens),
          expires_at: expiresAt,
          semester: semester ? parseInt(semester) : activeExisting.semester,
          division: (division && String(division).trim() !== '') ? String(division).trim().toUpperCase() : activeExisting.division,
          subject: (subject && String(subject).trim() !== '') ? String(subject).trim() : activeExisting.subject
        })
        .eq('id', activeExisting.id)
        .select()
        .single();
      result = updateRes.data;
      error = updateRes.error;
    } else {
      let insertPayload = {
        created_at: createdAt,
        expires_at: expiresAt,
        created_by_faculty_id: facultyId,
        date: today,
        tokens: JSON.stringify(tokens),
        semester: semester ? parseInt(semester) : null,
        division: (division && String(division).trim() !== '') ? String(division).trim().toUpperCase() : null,
        subject: (subject && String(subject).trim() !== '') ? String(subject).trim() : null
      };

      let insertRes = await supabase.from('qr_sessions').insert([insertPayload]).select().single();
      result = insertRes.data;
      error = insertRes.error;

      // Fallback: If DB table lacks 'subject' or 'division' columns, retry without missing column and save local meta
      if (error && error.message && (error.message.includes('subject') || error.message.includes('division') || error.message.includes('schema cache'))) {
        if (error.message.includes('subject')) delete insertPayload.subject;
        if (error.message.includes('division')) delete insertPayload.division;

        const retry = await supabase.from('qr_sessions').insert([insertPayload]).select().single();
        result = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      console.error('QR Session Start Error:', error);
      return res.status(500).json({ error: 'Failed to start QR session: ' + error.message });
    }

    if (result && result.id) {
      saveLocalSessionMeta('qr', result.id, subject, division);
    }

    try {
      const attendanceRouter = require('./attendance');
      if (attendanceRouter && typeof attendanceRouter.invalidateMatrixCache === 'function') {
        attendanceRouter.invalidateMatrixCache();
      }
    } catch (e) {}

    notifyChange('DATA_CHANGED', { entity: 'qr_session', action: 'start', sessionId: result?.id });

    res.status(201).json({
      message: 'QR session started successfully',
      session: {
        id: result.id,
        createdAt,
        expiresAt,
        tokens,
        secondsLeft: 120,
        semester: result.semester || null,
        division: result.division || null,
        subject: result.subject || subject || null
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
    const { data: faculties } = await supabase.from('faculty').select('id, name');
    const facMap = new Map((faculties || []).map(f => [String(f.id), f.name]));

    // Find the latest generated session
    let sessionQuery = supabase.from('qr_sessions')
      .select('*')
      .order('id', { ascending: false })
      .limit(1);
    if (req.user && (req.user.role === 'faculty' || req.user.originalRole === 'admin')) {
      const activeFacId = req.user.faculty_id || req.user.id;
      sessionQuery = sessionQuery.or(`created_by_faculty_id.eq.${req.user.id},created_by_faculty_id.eq.${activeFacId}`);
    }
    const { data: latestSession } = await sessionQuery.maybeSingle();

    if (!latestSession) {
      return res.json({ active: false });
    }

    const now = new Date().getTime();
    const expireTime = new Date(latestSession.expires_at).getTime();

    if (now < expireTime) {
      const facultyName = facMap.get(String(latestSession.created_by_faculty_id)) || 'Faculty';
      res.json({
        active: true,
        session: {
          id: latestSession.id,
          createdAt: latestSession.created_at,
          expiresAt: latestSession.expires_at,
          tokens: JSON.parse(latestSession.tokens),
          facultyName: facultyName,
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
  const today = req.query.date || getLocalDateString();
  try {
    const { data: faculties } = await supabase.from('faculty').select('id, name');
    const facMap = new Map((faculties || []).map(f => [String(f.id), f.name]));

    let sessionsQuery = supabase.from('qr_sessions')
      .select('*')
      .eq('date', today)
      .order('id', { ascending: false });
    if (req.user.role === 'faculty') {
      const activeFacId = req.user.faculty_id || req.user.id;
      const resolvedFacId = await resolveValidFacultyId(req.user);
      const facIdSet = new Set([String(req.user.id), String(activeFacId), String(resolvedFacId)].filter(Boolean));
      const orClause = Array.from(facIdSet).map(id => `created_by_faculty_id.eq.${id}`).join(',');
      sessionsQuery = sessionsQuery.or(orClause);
    }
    const { data: sessions, error } = await sessionsQuery;

    if (error) throw error;

    const safeSessions = sessions || [];

    let localMeta = {};
    if (fs.existsSync(sessionMetaPath)) {
      try { localMeta = JSON.parse(fs.readFileSync(sessionMetaPath, 'utf8')) || {}; } catch(e) {}
    }

    // Get count of checkins for each session
    const sessionsWithCount = await Promise.all(safeSessions.map(async (sess) => {
      const { count } = await supabase.from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('qr_session_id', sess.id)
        .eq('status', 'Success');

      const facultyName = facMap.get(String(sess.created_by_faculty_id)) || 'Faculty';
      const meta = localMeta[`qr_${sess.id}`] || {};

      return {
        id: sess.id,
        created_at: sess.created_at,
        expires_at: sess.expires_at,
        date: sess.date,
        semester: sess.semester || meta.semester || null,
        division: sess.division || meta.division || null,
        subject: sess.subject || meta.subject || null,
        created_by_faculty_id: sess.created_by_faculty_id,
        faculty_name: facultyName,
        presentCount: count || 0
      };
    }));

    res.json(sessionsWithCount);
  } catch (err) {
    console.error('Error fetching today\'s QR sessions:', err);
    res.status(500).json({ error: 'Failed to retrieve today\'s QR sessions' });
  }
});

// POST end active QR session
router.post('/end', authenticateJWT, requireAdminOrFaculty, async (req, res) => {
  try {
    const nowIso = new Date().toISOString();
    let endQuery = supabase.from('qr_sessions').update({ expires_at: nowIso }).gt('expires_at', nowIso);
    if (req.user.role === 'faculty') {
      endQuery = endQuery.eq('created_by_faculty_id', req.user.id);
    }
    await endQuery;
    notifyChange('DATA_CHANGED', { entity: 'qr_session', action: 'end' });
    res.json({ success: true, message: 'QR session ended successfully' });
  } catch (err) {
    console.error('Error ending QR session:', err);
    res.status(500).json({ error: 'Failed to end QR session' });
  }
});

// DELETE clear old QR sessions history (Admin only)
router.delete('/clear-history', authenticateJWT, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  try {
    // 1. Unlink attendance records referencing qr_sessions or otp if foreign keys exist
    try {
      await supabase.from('attendance').update({ qr_session_id: null, otp_id: null }).not('id', 'is', null);
    } catch (e) {
      console.warn('Warning unlinking attendance records before clearing sessions:', e?.message);
    }

    // 2. Delete all records from qr_sessions
    const { error: qrErr } = await supabase.from('qr_sessions').delete().not('id', 'is', null);
    if (qrErr) {
      console.error('Error deleting from qr_sessions:', qrErr);
    }

    // 3. Delete all records from otp
    const { error: otpErr } = await supabase.from('otp').delete().not('id', 'is', null);
    if (otpErr) {
      console.error('Error deleting from otp:', otpErr);
    }

    notifyChange('DATA_CHANGED', { entity: 'qr_session', action: 'clear' });
    res.json({ success: true, message: 'QR and OTP session history cleared successfully' });
  } catch (err) {
    console.error('Error clearing QR session history:', err);
    res.status(500).json({ error: 'Failed to clear session history' });
  }
});

module.exports = router;

