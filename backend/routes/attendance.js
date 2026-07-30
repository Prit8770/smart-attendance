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

// Haversine formula to calculate distance in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Get today's local date string (YYYY-MM-DD)
function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localD = new Date(d.getTime() - (offset * 60 * 1000));
  return localD.toISOString().split('T')[0];
}

// POST submit attendance (Student only)
router.post('/submit', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can submit attendance.' });
  }

  const { otp, sessionId, tokenIndex, tokenValue, latitude, longitude, deviceId } = req.body;

  if ((!otp && (sessionId === undefined || tokenIndex === undefined || tokenValue === undefined)) || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'OTP/QR data and location (lat/lon) are required.' });
  }

  try {
    const now = new Date();
    const nowMs = now.getTime();

    // Hardware/Device Cooldown Check (15 minutes)
    if (deviceId) {
      const lastDeviceAttendance = await dbQuery.get(
        "SELECT date, time FROM attendance WHERE device_id = ? AND status = 'Success' ORDER BY id DESC LIMIT 1",
        [deviceId]
      );
      if (lastDeviceAttendance) {
        const [year, month, day] = lastDeviceAttendance.date.split('-');
        const [hours, minutes, seconds] = lastDeviceAttendance.time.split(':');
        const lastTime = new Date(year, month - 1, day, hours, minutes, seconds);
        const diffMs = nowMs - lastTime.getTime();
        const cooldownMs = 15 * 60 * 1000; // 15 minutes cooldown
        if (diffMs > 0 && diffMs < cooldownMs) {
          return res.status(400).json({ error: 'This device has already been used for attendance recently.' });
        }
      }
    }

    let qrSessionRecord = null;
    let attendanceLinkCol = 'otp_id';
    let attendanceLinkId = null;

    if (sessionId !== undefined && tokenIndex !== undefined && tokenValue !== undefined) {
      // 1. QR Code Submission
      qrSessionRecord = await dbQuery.get('SELECT * FROM qr_sessions WHERE id = ?', [sessionId]);
      if (!qrSessionRecord) {
        return res.status(400).json({ error: 'Invalid QR session. Please scan a valid QR code.' });
      }

      // Check if session has expired (allow 10s grace period)
      const expiresTime = new Date(qrSessionRecord.expires_at).getTime();
      if (nowMs > expiresTime + 10000) {
        return res.status(400).json({ error: 'This QR attendance session has expired.' });
      }

      // Check token index range
      if (tokenIndex < 0 || tokenIndex >= 6) {
        return res.status(400).json({ error: 'Invalid QR token index.' });
      }

      // Parse tokens
      let tokens = [];
      try {
        tokens = JSON.parse(qrSessionRecord.tokens);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse QR session tokens.' });
      }

      if (tokens[tokenIndex] !== tokenValue) {
        return res.status(400).json({ error: 'Invalid QR code. Please scan the currently active QR.' });
      }

      // Verify token 20-second interval + 25-second network/testing buffer (total 45 seconds validity from start of interval)
      const sessionStartMs = new Date(qrSessionRecord.created_at).getTime();
      const tokenStartMs = sessionStartMs + tokenIndex * 20000;
      const tokenEndMs = tokenStartMs + 45000;

      if (nowMs < tokenStartMs - 2000) { // allow 2 seconds clock drift
        return res.status(400).json({ error: 'QR session clock drift. Please wait.' });
      }
      if (nowMs > tokenEndMs) {
        return res.status(400).json({ error: 'This QR code has expired. Please scan the active QR code.' });
      }

      // Check duplicate submission
      const duplicate = await dbQuery.get(
        'SELECT id, status FROM attendance WHERE student_id = ? AND qr_session_id = ?',
        [req.user.id, sessionId]
      );

      if (duplicate) {
        if (duplicate.status === 'Success') {
          return res.status(400).json({ error: 'You have already marked attendance successfully for this session.' });
        } else {
          return res.status(400).json({ error: 'You already have a failed submission for this session.' });
        }
      }

      attendanceLinkCol = 'qr_session_id';
      attendanceLinkId = sessionId;
    } else {
      // 2. Legacy OTP Submission
      const otpRecord = await dbQuery.get('SELECT * FROM otp WHERE otp = ? ORDER BY id DESC LIMIT 1', [otp]);
      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP. Please enter the correct code.' });
      }

      // Check if OTP is expired
      const expireTime = new Date(otpRecord.expire_time).getTime();
      if (nowMs > expireTime) {
        return res.status(400).json({ error: 'This OTP has expired. Please request a new one.' });
      }

      // Check duplicate submission
      const duplicate = await dbQuery.get(
        'SELECT id, status FROM attendance WHERE student_id = ? AND otp_id = ?',
        [req.user.id, otpRecord.id]
      );

      if (duplicate) {
        if (duplicate.status === 'Success') {
          return res.status(400).json({ error: 'You have already marked attendance successfully for this OTP.' });
        } else {
          return res.status(400).json({ error: 'You already have a failed submission for this OTP.' });
        }
      }

      attendanceLinkCol = 'otp_id';
      attendanceLinkId = otpRecord.id;
    }

    // Retrieve College Location
    const collegeLoc = await dbQuery.get('SELECT * FROM college_location LIMIT 1');
    if (!collegeLoc) {
      return res.status(500).json({ error: 'College location is not configured by Admin.' });
    }

    // Calculate distance
    const dist = calculateDistance(latitude, longitude, collegeLoc.latitude, collegeLoc.longitude);
    const radius = collegeLoc.radius || 200.0;

    const status = dist <= radius ? 'Success' : 'Failed';

    const submitTime = new Date();
    const localTimeStr = submitTime.toLocaleTimeString('en-US', { hour12: false });
    const localDateStr = getLocalDateString();

    await dbQuery.run(
      `INSERT INTO attendance (student_id, ${attendanceLinkCol}, date, time, latitude, longitude, distance, status, device_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        attendanceLinkId,
        localDateStr,
        localTimeStr,
        latitude,
        longitude,
        parseFloat(dist.toFixed(2)),
        status,
        deviceId || null
      ]
    );

    if (status === 'Success') {
      res.json({
        success: true,
        message: 'Attendance submitted successfully.',
        details: { distance: parseFloat(dist.toFixed(2)), status }
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Attendance Rejected. You are outside the required radius. Distance: ${dist.toFixed(0)}m.`,
        details: { distance: parseFloat(dist.toFixed(2)), status }
      });
    }
  } catch (err) {
    console.error('Error submitting attendance:', err);
    res.status(500).json({ error: 'Internal server error during attendance submission.' });
  }
});

// GET attendance history for logged-in student
router.get('/history/student', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    const history = await dbQuery.all(
      `SELECT a.id, a.date, a.time, a.latitude, a.longitude, a.distance, a.status, o.otp, a.qr_session_id
       FROM attendance a
       LEFT JOIN otp o ON a.otp_id = o.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC, a.time DESC`,
      [req.user.id]
    );
    res.json(history);
  } catch (err) {
    console.error('Error fetching student attendance history:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance history.' });
  }
});

// GET live monitor data for Admin (today's logs)
router.get('/monitor', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    const logs = await dbQuery.all(
      `SELECT a.id, s.enrollment_no, s.name, s.course, s.semester, s.mobile, a.time, a.distance, a.status, o.otp, a.qr_session_id
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       LEFT JOIN otp o ON a.otp_id = o.id
       WHERE a.date = ?
       ORDER BY a.time DESC`,
      [today]
    );
    res.json(logs);
  } catch (err) {
    console.error('Error fetching live monitor logs:', err);
    res.status(500).json({ error: 'Failed to retrieve live monitor logs.' });
  }
});

// GET report list with filters (Admin only)
router.get('/reports', authenticateJWT, requireAdmin, async (req, res) => {
  const { date, startDate, endDate, studentId } = req.query;

  let query = `
    SELECT a.id, s.enrollment_no, s.name, s.course, s.semester, a.date, a.time, a.distance, a.status, o.otp, a.qr_session_id
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN otp o ON a.otp_id = o.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ` AND a.date = ?`;
    params.push(date);
  } else if (startDate && endDate) {
    query += ` AND a.date BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }

  if (studentId) {
    query += ` AND a.student_id = ?`;
    params.push(studentId);
  }

  query += ` ORDER BY a.date DESC, a.time DESC`;

  try {
    const reports = await dbQuery.all(query, params);
    res.json(reports);
  } catch (err) {
    console.error('Error fetching report data:', err);
    res.status(500).json({ error: 'Failed to fetch report data.' });
  }
});

// GET Dashboard Stats for Admin
router.get('/stats', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    // 1. Total Students
    const totalStudentsRow = await dbQuery.get('SELECT COUNT(*) as count FROM students');
    const totalStudents = totalStudentsRow.count;

    // 1b. Total Faculty
    const totalFacultyRow = await dbQuery.get('SELECT COUNT(*) as count FROM faculty');
    const totalFaculty = totalFacultyRow.count;

    // 2. Present Today (Success logs count)
    const presentTodayRow = await dbQuery.get(
      "SELECT COUNT(DISTINCT student_id) as count FROM attendance WHERE date = ? AND status = 'Success'",
      [today]
    );
    const presentToday = presentTodayRow.count;

    // 3. Absent Today
    const absentToday = Math.max(0, totalStudents - presentToday);

    // 4. Legacy OTPs generated today
    const otpsTodayRow = await dbQuery.get('SELECT COUNT(*) as count FROM otp WHERE date = ?', [today]);
    const otpsGenerated = otpsTodayRow.count;
    const otpsRemaining = Math.max(0, 5 - otpsGenerated);

    // 5. Legacy Active OTP info
    const latestOtp = await dbQuery.get('SELECT * FROM otp ORDER BY id DESC LIMIT 1');
    let activeOtp = null;
    if (latestOtp) {
      const now = new Date().getTime();
      const expireTime = new Date(latestOtp.expire_time).getTime();
      if (now < expireTime) {
        activeOtp = latestOtp.otp;
      }
    }

    // 6. QR Sessions generated today
    let qrSessionsGenerated = 0;
    if (req.user.role === 'faculty') {
      const qrTodayRow = await dbQuery.get(
        'SELECT COUNT(*) as count FROM qr_sessions WHERE date = ? AND created_by_faculty_id = ?',
        [today, req.user.id]
      );
      qrSessionsGenerated = qrTodayRow.count;
    } else {
      const qrTodayRow = await dbQuery.get('SELECT COUNT(*) as count FROM qr_sessions WHERE date = ?', [today]);
      qrSessionsGenerated = qrTodayRow.count;
    }

    // 7. Active QR session info
    const latestQr = await dbQuery.get('SELECT * FROM qr_sessions ORDER BY id DESC LIMIT 1');
    let activeQrSession = null;
    if (latestQr) {
      const now = new Date().getTime();
      const expireTime = new Date(latestQr.expires_at).getTime();
      if (now < expireTime) {
        activeQrSession = {
          id: latestQr.id,
          createdAt: latestQr.created_at,
          expiresAt: latestQr.expires_at,
          tokens: JSON.parse(latestQr.tokens)
        };
      }
    }

    // 8. Last 7 Days Attendance Trend (for graph)
    const trendRows = await dbQuery.all(`
      SELECT date, COUNT(DISTINCT student_id) as present_count 
      FROM attendance 
      WHERE status = 'Success'
      GROUP BY date 
      ORDER BY date DESC 
      LIMIT 7
    `);

    // Reverse to chronological order
    const trend = trendRows.reverse();

    res.json({
      totalStudents,
      totalFaculty,
      presentToday,
      absentToday,
      otpsGenerated,
      otpsRemaining,
      activeOtp,
      qrSessionsGenerated,
      activeQrSession,
      trend
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
});

// GET attendance trend for logged-in student
router.get('/student-trend', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    // 1. Get all lectures (OTPs and QR Sessions)
    const otps = await dbQuery.all("SELECT id, date, generated_time as time, 'otp' as type FROM otp");
    const qrs = await dbQuery.all("SELECT id, date, created_at as time, 'qr' as type FROM qr_sessions");
    
    // Merge and sort by time
    const lectures = [...otps, ...qrs].sort((a, b) => new Date(a.time) - new Date(b.time));

    // 2. Get successful attendances
    const successOtpAttendances = await dbQuery.all(
      "SELECT otp_id FROM attendance WHERE student_id = ? AND status = 'Success' AND otp_id IS NOT NULL"
    );
    const successQrAttendances = await dbQuery.all(
      "SELECT qr_session_id FROM attendance WHERE student_id = ? AND status = 'Success' AND qr_session_id IS NOT NULL"
    );
    
    const successOtpIds = new Set(successOtpAttendances.map(a => a.otp_id));
    const successQrIds = new Set(successQrAttendances.map(a => a.qr_session_id));

    let currentAttendance = 100.0;
    const trend = [];

    // Base point at the start
    trend.push({
      label: 'Initial',
      percentage: parseFloat(currentAttendance.toFixed(2))
    });

    // Calculate progression
    for (let i = 0; i < lectures.length; i++) {
      const lec = lectures[i];
      let present = false;
      if (lec.type === 'otp' && successOtpIds.has(lec.id)) {
        present = true;
      } else if (lec.type === 'qr' && successQrIds.has(lec.id)) {
        present = true;
      }

      if (present) {
        currentAttendance += 0.25;
      } else {
        currentAttendance -= 0.50;
      }
      currentAttendance = Math.max(0.0, Math.min(100.0, currentAttendance));

      trend.push({
        label: `${lec.date}`,
        percentage: parseFloat(currentAttendance.toFixed(2))
      });
    }

    res.json({
      currentAttendance: parseFloat(currentAttendance.toFixed(2)),
      trend
    });
  } catch (err) {
    console.error('Error calculating student trend:', err);
    res.status(500).json({ error: 'Failed to fetch student attendance trend' });
  }
});

module.exports = router;
