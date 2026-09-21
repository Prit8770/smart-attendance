const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

// Local fallback storage
const noticesFilePath = path.join(__dirname, '../data/notices.json');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getLocalNotices() {
  if (fs.existsSync(noticesFilePath)) {
    try {
      const content = fs.readFileSync(noticesFilePath, 'utf8');
      return JSON.parse(content) || [];
    } catch (e) {
      console.error('Error reading notices.json:', e);
      return [];
    }
  }
  return [];
}

function saveLocalNotices(notices) {
  try {
    fs.writeFileSync(noticesFilePath, JSON.stringify(notices, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing notices.json:', e);
  }
}

// GET /api/notices/my - Authenticated student endpoint
router.get('/my', authenticateJWT, async (req, res) => {
  try {
    const student = req.user;
    if (!student) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1. Try fetching from Supabase if table exists
    let dbNotices = [];
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('id', { ascending: false });
      if (!error && Array.isArray(data)) {
        dbNotices = data;
      }
    } catch (e) {}

    // 2. Combine with local JSON fallback (deduplicated by id)
    const localNotices = getLocalNotices();
    const map = new Map();
    [...dbNotices, ...localNotices].forEach(n => {
      if (n && n.id) map.set(String(n.id), n);
    });

    const allNotices = Array.from(map.values());

    const uId = String(student.id || '').trim().toLowerCase();
    const uEnroll = String(student.enrollment_no || '').trim().toLowerCase();
    const uRoll = String(student.roll_no || student.roll || '').trim().toLowerCase();
    const uEmail = String(student.email || '').trim().toLowerCase();
    const uUser = String(student.username || '').trim().toLowerCase();
    const uName = String(student.name || '').trim().toLowerCase();
    const uSem = String(student.semester || '').replace(/\D/g, '').trim();
    const uDiv = String(student.division || '').trim().toUpperCase();

    const myNotices = allNotices.filter(n => {
      if (!n) return false;

      // Broadcast to ALL students
      const targetEnroll = String(n.studentEnrollment || n.student_enrollment || '').trim().toLowerCase();
      if (targetEnroll === 'all') return true;

      const targetId = String(n.studentId || n.student_id || '').trim().toLowerCase();
      const targetRoll = String(n.studentRollNo || n.roll_no || '').trim().toLowerCase();
      const targetEmail = String(n.studentEmail || n.email || '').trim().toLowerCase();
      const targetName = String(n.studentName || n.name || '').trim().toLowerCase();

      // Check direct matches against student profile
      if (uId && targetId && (uId === targetId || targetEnroll === uId)) return true;
      if (uEnroll && targetEnroll && (uEnroll === targetEnroll || targetId === uEnroll)) return true;
      if (uRoll && targetRoll && (uRoll === targetRoll || targetEnroll === uRoll)) return true;
      if (uEmail && (targetEmail === uEmail || targetEnroll === uEmail)) return true;
      if (uUser && (targetEnroll === uUser || targetId === uUser)) return true;
      if (uName && targetName && uName === targetName) return true;

      // Match by Sem and Division if targeted to class/semester
      if (n.targetType === 'CLASS' || (n.semester && !n.studentEnrollment)) {
        const nSem = String(n.semester || '').replace(/\D/g, '').trim();
        const nDiv = String(n.division || 'ALL').trim().toUpperCase();
        if (nSem === uSem && (nDiv === 'ALL' || nDiv === uDiv)) return true;
      }

      return false;
    });

    // Sort newest first
    myNotices.sort((a, b) => (b.timestamp || Number(b.id) || 0) - (a.timestamp || Number(a.id) || 0));

    // Calculate unread count
    const studentIdentifier = String(student.id || uEnroll || uUser);
    const unreadCount = myNotices.filter(n => {
      const readBy = Array.isArray(n.readBy) ? n.readBy.map(x => String(x).toLowerCase()) : [];
      return (
        !readBy.includes(studentIdentifier.toLowerCase()) &&
        !readBy.includes(uId) &&
        !readBy.includes(uEnroll)
      );
    }).length;

    return res.json({
      notices: myNotices,
      totalCount: myNotices.length,
      unreadCount
    });
  } catch (err) {
    console.error('Error fetching student notices:', err);
    return res.status(500).json({ error: 'Failed to fetch notices.' });
  }
});

// GET /api/notices - Admin/Faculty view all notices
router.get('/', authenticateJWT, async (req, res) => {
  try {
    let dbNotices = [];
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('id', { ascending: false });
      if (!error && Array.isArray(data)) dbNotices = data;
    } catch (e) {}

    const local = getLocalNotices();
    const map = new Map();
    [...dbNotices, ...local].forEach(n => {
      if (n && n.id) map.set(String(n.id), n);
    });

    const all = Array.from(map.values()).sort((a, b) => (b.timestamp || Number(b.id) || 0) - (a.timestamp || Number(a.id) || 0));
    return res.json(all);
  } catch (err) {
    console.error('Error getting all notices:', err);
    return res.status(500).json({ error: 'Failed to fetch notices.' });
  }
});

// POST /api/notices/bulk - Send notices in bulk (Admin/Faculty)
router.post('/bulk', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Admin or Faculty access required.' });
  }

  const { notices } = req.body;
  if (!Array.isArray(notices) || notices.length === 0) {
    return res.status(400).json({ error: 'No notices provided.' });
  }

  try {
    const formattedNotices = notices.map((n, idx) => ({
      id: n.id || ('notice_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000)),
      studentId: n.studentId || n.id || null,
      studentEnrollment: n.studentEnrollment || n.enrollment_no || n.email || 'ALL',
      studentName: n.studentName || n.name || 'Student',
      studentRollNo: n.studentRollNo || n.roll_no || n.rollNo || '',
      studentEmail: n.studentEmail || n.email || '',
      semester: n.semester || '',
      division: n.division || '',
      title: n.title || '⚠️ Attendance Defaulter Notice',
      category: n.category || 'DEFAULTER NOTICE',
      tagColor: n.tagColor || '#ef4444',
      date: n.date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      body: n.body || '',
      attendancePercentage: n.percentage !== undefined ? n.percentage : (n.attendancePercentage || 0),
      totalLectures: n.totalLectures || 0,
      attendedLectures: n.attendedLectures || 0,
      statusKey: n.statusKey || 'CRITICAL',
      readBy: [],
      timestamp: n.timestamp || Date.now(),
      created_at: new Date().toISOString()
    }));

    // 1. Try to save to Supabase
    try {
      await supabase.from('notices').insert(formattedNotices);
    } catch (dbErr) {
      console.warn('Supabase bulk notices insert fallback:', dbErr.message);
    }

    // 2. Always persist to local JSON fallback
    const local = getLocalNotices();
    const existingIds = new Set(local.map(item => String(item.id)));
    const toAdd = formattedNotices.filter(item => !existingIds.has(String(item.id)));
    const updated = [...toAdd, ...local];
    saveLocalNotices(updated);

    // 3. Emit SSE real-time event to all connected clients
    notifyChange('DATA_CHANGED', { entity: 'notices', count: formattedNotices.length });

    return res.status(201).json({
      success: true,
      message: `${formattedNotices.length} notice(s) dispatched successfully!`,
      count: formattedNotices.length,
      notices: formattedNotices
    });
  } catch (err) {
    console.error('Error saving bulk notices:', err);
    return res.status(500).json({ error: 'Failed to dispatch notices.' });
  }
});

// POST /api/notices - Send a single notice (Admin/Faculty)
router.post('/', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Admin or Faculty access required.' });
  }

  const n = req.body;
  if (!n || !n.body) {
    return res.status(400).json({ error: 'Notice body is required.' });
  }

  try {
    const formattedNotice = {
      id: n.id || ('notice_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
      studentId: n.studentId || n.id || null,
      studentEnrollment: n.studentEnrollment || n.enrollment_no || n.email || 'ALL',
      studentName: n.studentName || n.name || 'Student',
      studentRollNo: n.studentRollNo || n.roll_no || n.rollNo || '',
      studentEmail: n.studentEmail || n.email || '',
      semester: n.semester || '',
      division: n.division || '',
      title: n.title || '⚠️ Attendance Defaulter Notice',
      category: n.category || 'DEFAULTER NOTICE',
      tagColor: n.tagColor || '#ef4444',
      date: n.date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      body: n.body,
      attendancePercentage: n.percentage !== undefined ? n.percentage : (n.attendancePercentage || 0),
      totalLectures: n.totalLectures || 0,
      attendedLectures: n.attendedLectures || 0,
      statusKey: n.statusKey || 'CRITICAL',
      readBy: [],
      timestamp: n.timestamp || Date.now(),
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('notices').insert([formattedNotice]);
    } catch (dbErr) {
      console.warn('Supabase notice insert fallback:', dbErr.message);
    }

    const local = getLocalNotices();
    local.unshift(formattedNotice);
    saveLocalNotices(local);

    notifyChange('DATA_CHANGED', { entity: 'notices', noticeId: formattedNotice.id });

    return res.status(201).json({
      success: true,
      message: 'Notice dispatched successfully!',
      notice: formattedNotice
    });
  } catch (err) {
    console.error('Error creating notice:', err);
    return res.status(500).json({ error: 'Failed to create notice.' });
  }
});

// POST /api/notices/:id/read - Mark notice as read/acknowledged
router.post('/:id/read', authenticateJWT, async (req, res) => {
  try {
    const noticeId = String(req.params.id);
    const student = req.user;
    const studentIdentifier = String(student.id || student.enrollment_no || student.username);

    const local = getLocalNotices();
    const notice = local.find(n => String(n.id) === noticeId);
    if (notice) {
      if (!Array.isArray(notice.readBy)) notice.readBy = [];
      if (!notice.readBy.includes(studentIdentifier)) {
        notice.readBy.push(studentIdentifier);
        saveLocalNotices(local);
      }
    }

    try {
      const { data } = await supabase.from('notices').select('readBy').eq('id', noticeId).maybeSingle();
      if (data) {
        const readBy = Array.isArray(data.readBy) ? data.readBy : [];
        if (!readBy.includes(studentIdentifier)) {
          readBy.push(studentIdentifier);
          await supabase.from('notices').update({ readBy }).eq('id', noticeId);
        }
      }
    } catch (e) {}

    return res.json({ success: true, message: 'Notice marked as read.' });
  } catch (err) {
    console.error('Error marking notice read:', err);
    return res.status(500).json({ error: 'Failed to mark notice read.' });
  }
});

// DELETE /api/notices/:id - Admin only
router.delete('/:id', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const noticeId = String(req.params.id);
  try {
    try {
      await supabase.from('notices').delete().eq('id', noticeId);
    } catch (e) {}

    const local = getLocalNotices().filter(n => String(n.id) !== noticeId);
    saveLocalNotices(local);

    notifyChange('DATA_CHANGED', { entity: 'notices', action: 'delete', noticeId });
    return res.json({ success: true, message: 'Notice deleted successfully.' });
  } catch (err) {
    console.error('Error deleting notice:', err);
    return res.status(500).json({ error: 'Failed to delete notice.' });
  }
});

module.exports = router;
