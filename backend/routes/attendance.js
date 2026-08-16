const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
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

const sessionMetaPath = path.join(__dirname, '../data/session_meta.json');
function getLocalSessionMetaMap() {
  try {
    if (fs.existsSync(sessionMetaPath)) {
      return JSON.parse(fs.readFileSync(sessionMetaPath, 'utf8')) || {};
    }
  } catch (e) {}
  return {};
}

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

// Get local date string (YYYY-MM-DD)
function getLocalDateString(dateObj = new Date()) {
  const offset = dateObj.getTimezoneOffset();
  const localD = new Date(dateObj.getTime() - (offset * 60 * 1000));
  return localD.toISOString().split('T')[0];
}

// GET check if there is an active QR or OTP session for the logged-in student (Semester & Division match)
router.get('/check-session', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.json({ unlocked: true });
  }

  const nowMs = Date.now();

  try {
    // Fetch exact student details directly from DB to avoid missing JWT claims
    let studentSem = req.user.semester ? parseInt(req.user.semester, 10) : null;
    let studentDiv = req.user.division ? String(req.user.division).trim().toUpperCase() : '';

    const { data: dbStudent } = await supabase.from('students')
      .select('semester, division')
      .eq('id', req.user.id)
      .maybeSingle();

    if (dbStudent) {
      if (dbStudent.semester) studentSem = parseInt(dbStudent.semester, 10);
      if (dbStudent.division) studentDiv = String(dbStudent.division).trim().toUpperCase();
    }

    const normalizeDiv = (str) => {
      if (!str) return '';
      return String(str).replace(/DIV(ISION)?/gi, '').replace(/[^A-Z0-9]/gi, '').trim().toUpperCase();
    };

    const normStudentDiv = normalizeDiv(studentDiv);

    // 1. Check active QR sessions
    const { data: activeQrSessions } = await supabase.from('qr_sessions')
      .select('*, faculty:created_by_faculty_id(name)')
      .order('id', { ascending: false })
      .limit(10);

    let matchingQrSession = null;
    let qrSecondsLeft = 0;

    if (activeQrSessions && activeQrSessions.length > 0) {
      for (const sess of activeQrSessions) {
        const expireTime = new Date(sess.expires_at).getTime();
        if (nowMs < expireTime) {
          const sessSem = sess.semester ? parseInt(sess.semester, 10) : null;
          const sessDiv = sess.division ? String(sess.division).trim().toUpperCase() : null;
          const normSessDiv = normalizeDiv(sessDiv);

          const semMatches = (!sessSem || (studentSem && sessSem === studentSem));
          const divMatches = (!sessDiv || sessDiv === 'ALL' || !normSessDiv || !normStudentDiv || normSessDiv === normStudentDiv);

          if (semMatches && divMatches) {
            matchingQrSession = sess;
            qrSecondsLeft = Math.max(0, Math.floor((expireTime - nowMs) / 1000));
            break;
          }
        }
      }
    }

    // 2. Check active OTP sessions
    const { data: activeOtps } = await supabase.from('otp')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);

    let matchingOtpSession = null;
    let otpSecondsLeft = 0;

    if (activeOtps && activeOtps.length > 0) {
      for (const otpSess of activeOtps) {
        const expireTime = new Date(otpSess.expire_time).getTime();
        if (nowMs < expireTime) {
          const sessSem = otpSess.semester ? parseInt(otpSess.semester, 10) : null;
          const sessDiv = otpSess.division ? String(otpSess.division).trim().toUpperCase() : null;
          const normSessDiv = normalizeDiv(sessDiv);

          const semMatches = (!sessSem || (studentSem && sessSem === studentSem));
          const divMatches = (!sessDiv || sessDiv === 'ALL' || !normSessDiv || !normStudentDiv || normSessDiv === normStudentDiv);

          if (semMatches && divMatches) {
            matchingOtpSession = otpSess;
            otpSecondsLeft = Math.max(0, Math.floor((expireTime - nowMs) / 1000));
            break;
          }
        }
      }
    }

    if (matchingQrSession || matchingOtpSession) {
      const activeSess = matchingQrSession || matchingOtpSession;

      // Check if student has ALREADY submitted attendance for this active session
      let alreadySubmitted = false;
      if (matchingQrSession) {
        const { data: existingAtt } = await supabase.from('attendance')
          .select('id, status')
          .eq('student_id', req.user.id)
          .eq('qr_session_id', matchingQrSession.id)
          .eq('status', 'Success')
          .limit(1)
          .maybeSingle();

        if (existingAtt) {
          alreadySubmitted = true;
        }
      } else if (matchingOtpSession) {
        const { data: existingAtt } = await supabase.from('attendance')
          .select('id, status')
          .eq('student_id', req.user.id)
          .eq('otp_id', matchingOtpSession.id)
          .eq('status', 'Success')
          .limit(1)
          .maybeSingle();

        if (existingAtt) {
          alreadySubmitted = true;
        }
      }

      return res.json({
        unlocked: true,
        alreadySubmitted,
        type: matchingQrSession && matchingOtpSession ? 'BOTH' : matchingQrSession ? 'QR' : 'OTP',
        semester: activeSess.semester || studentSem,
        division: activeSess.division || 'ALL',
        facultyName: activeSess.faculty?.name || 'Faculty',
        secondsLeft: Math.max(qrSecondsLeft, otpSecondsLeft)
      });
    }

    return res.json({
      unlocked: false,
      message: `No active attendance session for Semester ${studentSem || ''}${studentDiv ? ' - Div ' + studentDiv : ''}. Waiting for faculty to start a session.`
    });
  } catch (err) {
    console.error('Error checking active session for student:', err);
    res.status(500).json({ error: 'Failed to check session status' });
  }
});

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

    // Daily Device Attendance Limit Check (Maximum 5 attendance submissions per device per day)
    if (deviceId && deviceId !== 'Manual') {
      const todayStr = getLocalDateString(now);
      const { count: deviceCountToday } = await supabase.from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('device_id', deviceId)
        .eq('date', todayStr)
        .eq('status', 'Success');

      if (deviceCountToday !== null && deviceCountToday >= 5) {
        return res.status(400).json({ error: 'Daily device limit reached. A single device can mark attendance a maximum of 5 times per day.' });
      }
    }

    let qrSessionRecord = null;
    let attendanceLinkCol = 'otp_id';
    let attendanceLinkId = null;

    if (sessionId !== undefined && tokenIndex !== undefined && tokenValue !== undefined) {
      // 1. QR Code Submission
      const { data: qrSession } = await supabase.from('qr_sessions').select('*').eq('id', sessionId).maybeSingle();
      qrSessionRecord = qrSession;
      if (!qrSessionRecord) {
        return res.status(400).json({ error: 'Invalid QR session. Please scan a valid QR code.' });
      }

      // Check semester & division match for QR
      if (qrSessionRecord.semester && req.user.semester) {
        if (parseInt(qrSessionRecord.semester, 10) !== parseInt(req.user.semester, 10)) {
          return res.status(400).json({ error: `This QR session is for Semester ${qrSessionRecord.semester}, but your profile is Semester ${req.user.semester}.` });
        }
      }
      if (qrSessionRecord.division && String(qrSessionRecord.division).trim().toUpperCase() !== 'ALL') {
        const sessDiv = String(qrSessionRecord.division).trim().toUpperCase();
        const stuDiv = String(req.user.division || '').trim().toUpperCase();
        if (sessDiv !== stuDiv) {
          return res.status(400).json({ error: `This QR session is for Division ${sessDiv}, but your profile is Division ${stuDiv || 'None'}.` });
        }
      }

      // Check if session has expired (allow 10s grace period)
      const expiresTime = new Date(qrSessionRecord.expires_at).getTime();
      if (nowMs > expiresTime + 10000) {
        return res.status(400).json({ error: 'This QR attendance session has expired.' });
      }

      // Check token index range
      if (tokenIndex < 0 || tokenIndex >= 8) {
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

      // Verify token 15-second interval + 25-second network/testing buffer (total 40 seconds validity from start of interval)
      const sessionStartMs = new Date(qrSessionRecord.created_at).getTime();
      const tokenStartMs = sessionStartMs + tokenIndex * 15000;
      const tokenEndMs = tokenStartMs + 40000;

      if (nowMs < tokenStartMs - 2000) { // allow 2 seconds clock drift
        return res.status(400).json({ error: 'QR session clock drift. Please wait.' });
      }
      if (nowMs > tokenEndMs) {
        return res.status(400).json({ error: 'This QR code has expired. Please scan the active QR code.' });
      }

      // Check duplicate submission
      const { data: duplicate } = await supabase.from('attendance')
        .select('id, status')
        .eq('student_id', req.user.id)
        .eq('qr_session_id', sessionId)
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        if (duplicate.status === 'Success') {
          return res.status(400).json({ error: 'You have already marked attendance successfully for this session.' });
        } else {
          return res.status(400).json({ error: 'You already have a failed submission for this session.' });
        }
      }

      // Check duplicate device submission for THIS QR session
      if (deviceId && deviceId !== 'Manual') {
        const { data: deviceDup } = await supabase.from('attendance')
          .select('id')
          .eq('device_id', deviceId)
          .eq('qr_session_id', sessionId)
          .eq('status', 'Success')
          .limit(1)
          .maybeSingle();

        if (deviceDup) {
          return res.status(400).json({ error: 'This device has already been used to mark attendance for this QR session.' });
        }
      }

      attendanceLinkCol = 'qr_session_id';
      attendanceLinkId = sessionId;
    } else {
      // 2. Legacy OTP Submission
      const { data: otpRecord } = await supabase.from('otp').select('*').eq('otp', otp).order('id', { ascending: false }).limit(1).maybeSingle();

      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP. Please enter the correct code.' });
      }

      // Check semester & division match for OTP
      if (otpRecord.semester && req.user.semester) {
        if (parseInt(otpRecord.semester, 10) !== parseInt(req.user.semester, 10)) {
          return res.status(400).json({ error: `This OTP session is for Semester ${otpRecord.semester}, but your profile is Semester ${req.user.semester}.` });
        }
      }
      if (otpRecord.division && String(otpRecord.division).trim().toUpperCase() !== 'ALL') {
        const sessDiv = String(otpRecord.division).trim().toUpperCase();
        const stuDiv = String(req.user.division || '').trim().toUpperCase();
        if (sessDiv !== stuDiv) {
          return res.status(400).json({ error: `This OTP session is for Division ${sessDiv}, but your profile is Division ${stuDiv || 'None'}.` });
        }
      }

      // Check if OTP is expired
      const expireTime = new Date(otpRecord.expire_time).getTime();
      if (nowMs > expireTime) {
        return res.status(400).json({ error: 'This OTP has expired. Please request a new one.' });
      }

      // Check duplicate submission
      const { data: duplicate } = await supabase.from('attendance')
        .select('id, status')
        .eq('student_id', req.user.id)
        .eq('otp_id', otpRecord.id)
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        if (duplicate.status === 'Success') {
          return res.status(400).json({ error: 'You have already marked attendance successfully for this OTP.' });
        } else {
          return res.status(400).json({ error: 'You already have a failed submission for this OTP.' });
        }
      }

      // Check duplicate device submission for THIS OTP session
      if (deviceId && deviceId !== 'Manual') {
        const { data: deviceDup } = await supabase.from('attendance')
          .select('id')
          .eq('device_id', deviceId)
          .eq('otp_id', otpRecord.id)
          .eq('status', 'Success')
          .limit(1)
          .maybeSingle();

        if (deviceDup) {
          return res.status(400).json({ error: 'This device has already been used to mark attendance for this OTP session.' });
        }
      }

      attendanceLinkCol = 'otp_id';
      attendanceLinkId = otpRecord.id;
    }

    // Retrieve College Location
    const { data: collegeLoc } = await supabase.from('college_location').select('*').limit(1).maybeSingle();
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

    const localMetaSubmit = getLocalSessionMetaMap();
    let activeSub = (qrSessionRecord && qrSessionRecord.subject) ? qrSessionRecord.subject : (otpRecord && otpRecord.subject) ? otpRecord.subject : null;
    if (!activeSub && attendanceLinkCol && attendanceLinkId) {
      const typeKey = attendanceLinkCol === 'qr_session_id' ? 'qr' : 'otp';
      activeSub = localMetaSubmit[`${typeKey}_${attendanceLinkId}`]?.subject || null;
    }

    const insertPayload = {
      student_id: req.user.id,
      enrollment_no: req.user.enrollment_no || (dbStudent ? dbStudent.enrollment_no : null),
      date: localDateStr,
      time: localTimeStr,
      latitude,
      longitude,
      distance: parseFloat(dist.toFixed(2)),
      status,
      device_id: deviceId || null,
      subject: activeSub
    };
    insertPayload[attendanceLinkCol] = attendanceLinkId;

    await supabase.from('attendance').insert([insertPayload]);

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

// POST manual attendance by Faculty/Admin
router.post('/manual', authenticateJWT, requireAdmin, async (req, res) => {
  const { student_id, qr_session_id, otp_id } = req.body;

  if (!student_id) {
    return res.status(400).json({ error: 'Student ID is required.' });
  }

  try {
    const today = getLocalDateString();
    let dupQuery = supabase.from('attendance')
      .select('id, device_id, status')
      .eq('student_id', student_id)
      .eq('status', 'Success');

    if (qr_session_id) {
      dupQuery = dupQuery.eq('qr_session_id', qr_session_id);
    } else if (otp_id) {
      dupQuery = dupQuery.eq('otp_id', otp_id);
    } else {
      dupQuery = dupQuery.eq('date', today);
    }

    const { data: existing } = await dupQuery.limit(1).maybeSingle();

    if (existing) {
      if (existing.device_id && existing.device_id !== 'Manual') {
        return res.status(400).json({ error: 'Student already marked attendance via Smartphone for this session.' });
      } else {
        return res.status(400).json({ error: 'Student is already marked present for this session.' });
      }
    }

    let linkCol = null;
    let linkId = null;
    let activeManualSubject = null;

    if (qr_session_id) {
      linkCol = 'qr_session_id';
      linkId = qr_session_id;
    } else if (otp_id) {
      linkCol = 'otp_id';
      linkId = otp_id;
    } else {
      // Find latest QR session by this faculty today
      const { data: recentQr } = await supabase.from('qr_sessions')
        .select('id, subject')
        .eq('created_by_faculty_id', req.user.id)
        .gte('created_at', today + 'T00:00:00.000Z')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentQr) {
        linkCol = 'qr_session_id';
        linkId = recentQr.id;
        if (recentQr.subject) activeManualSubject = recentQr.subject;
      } else {
        const { data: recentOtp } = await supabase.from('otp')
          .select('id, subject')
          .eq('generated_by', req.user.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentOtp) {
          linkCol = 'otp_id';
          linkId = recentOtp.id;
          if (recentOtp.subject) activeManualSubject = recentOtp.subject;
        }
      }
    }

    if (!activeManualSubject && linkCol && linkId) {
      const localMeta = getLocalSessionMetaMap();
      const typeKey = linkCol === 'qr_session_id' ? 'qr' : 'otp';
      activeManualSubject = localMeta[`${typeKey}_${linkId}`]?.subject || null;
    }

    const submitTime = new Date();
    const localTimeStr = submitTime.toLocaleTimeString('en-US', { hour12: false });
    const insertPayload = {
      student_id,
      date: today,
      time: localTimeStr,
      latitude: 0,
      longitude: 0,
      distance: 0,
      status: 'Success',
      device_id: 'Manual',
      subject: activeManualSubject || req.body.subject || null
    };
    if (linkCol && linkId) {
      insertPayload[linkCol] = linkId;
    }

    const { error } = await supabase.from('attendance').insert([insertPayload]);
    if (error) throw error;

    res.json({ success: true, message: 'Manual attendance recorded successfully.' });
  } catch (err) {
    console.error('Error in manual attendance:', err);
    res.status(500).json({ error: 'Failed to record manual attendance.' });
  }
});

// POST undo manual attendance (Mark Absent)
router.post('/manual/undo', authenticateJWT, requireAdmin, async (req, res) => {
  const { student_id, qr_session_id, otp_id, date } = req.body;
  if (!student_id) {
    return res.status(400).json({ error: 'Student ID is required.' });
  }
  try {
    const targetDate = date || getLocalDateString();
    let query = supabase.from('attendance')
      .select('id, device_id')
      .eq('student_id', student_id)
      .eq('device_id', 'Manual');

    if (qr_session_id) {
      query = query.eq('qr_session_id', qr_session_id);
    } else if (otp_id) {
      query = query.eq('otp_id', otp_id);
    } else {
      query = query.eq('date', targetDate);
    }

    const { data: toDelete, error: findErr } = await query.limit(1).maybeSingle();

    if (findErr || !toDelete) {
      return res.status(400).json({ error: 'Only manual attendance records can be undone or student is already absent.' });
    }

    const { error } = await supabase.from('attendance').delete().eq('id', toDelete.id);
    if (error) throw error;

    res.json({ success: true, message: 'Attendance removed / set to Absent.' });
  } catch (err) {
    console.error('Error undoing manual attendance:', err);
    res.status(500).json({ error: 'Failed to undo attendance.' });
  }
});

// GET attendance history for logged-in student
router.get('/history/student', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    // 1. Get logged in student info from DB
    let studentSem = req.user.semester ? parseInt(req.user.semester, 10) : 1;
    let studentDiv = req.user.division ? String(req.user.division).trim().toUpperCase() : null;

    const { data: dbStudent } = await supabase.from('students')
      .select('id, semester, division, enrollment_no, username')
      .eq('id', req.user.id)
      .maybeSingle();

    if (dbStudent) {
      if (dbStudent.semester) studentSem = parseInt(dbStudent.semester, 10);
      if (dbStudent.division) studentDiv = String(dbStudent.division).trim().toUpperCase();
    }

    const normalizeDiv = (str) => {
      if (!str) return '';
      return String(str).replace(/DIV(ISION)?/gi, '').replace(/[^A-Z0-9]/gi, '').trim().toUpperCase();
    };
    const normStudentDiv = normalizeDiv(studentDiv);

    function parseSemNum(val) {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') return val;
      const str = String(val);
      const match = str.match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    }

    // 2. Fetch created QR sessions, OTP sessions, attendance records, and faculty list
    const [
      { data: qrSessions },
      { data: otps },
      { data: rawStudentAtt },
      { data: facultyList }
    ] = await Promise.all([
      supabase.from('qr_sessions').select('id, created_at, created_by_faculty_id, semester, division, subject, date'),
      supabase.from('otp').select('id, created_at, generated_by, semester, division, subject, date'),
      supabase.from('attendance')
        .select('id, date, time, latitude, longitude, distance, status, subject, qr_session_id, otp_id, student_id')
        .eq('student_id', req.user.id),
      supabase.from('faculty').select('id, name')
    ]);

    const facMap = new Map((facultyList || []).map(f => [String(f.id), f.name]));
    const localMeta = getLocalSessionMetaMap();

    // Set of session IDs where student has a PRESENT attendance record
    const attendedQrIds = new Set();
    const attendedOtpIds = new Set();
    const studentAttMapByQr = new Map();
    const studentAttMapByOtp = new Map();

    (rawStudentAtt || []).forEach(a => {
      const st = String(a.status || '').toLowerCase();
      const isPresent = st === 'success' || st === 'present';
      if (a.qr_session_id) {
        if (isPresent) attendedQrIds.add(String(a.qr_session_id));
        studentAttMapByQr.set(String(a.qr_session_id), a);
      }
      if (a.otp_id) {
        if (isPresent) attendedOtpIds.add(String(a.otp_id));
        studentAttMapByOtp.set(String(a.otp_id), a);
      }
    });

    // Filter sessions matching student's semester & division
    const semQrSessions = (qrSessions || []).filter(q => {
      const qSem = parseSemNum(q.semester);
      if (qSem !== null && qSem !== studentSem) return false;

      const normSessDiv = normalizeDiv(q.division);
      if (normSessDiv && normSessDiv !== 'ALL' && normStudentDiv) {
        if (normSessDiv !== normStudentDiv) return false;
      }
      return true;
    });

    const semOtps = (otps || []).filter(o => {
      const oSem = parseSemNum(o.semester);
      if (oSem !== null && oSem !== studentSem) return false;

      const normSessDiv = normalizeDiv(o.division);
      if (normSessDiv && normSessDiv !== 'ALL' && normStudentDiv) {
        if (normSessDiv !== normStudentDiv) return false;
      }
      return true;
    });

    const list = [];
    const processedAttIds = new Set();

    // Process QR Sessions
    semQrSessions.forEach(q => {
      const isAttended = attendedQrIds.has(String(q.id));
      const attRecord = studentAttMapByQr.get(String(q.id));
      if (attRecord) processedAttIds.add(String(attRecord.id));

      let subName = q.subject;
      if (!subName && localMeta[`qr_${q.id}`]) subName = localMeta[`qr_${q.id}`].subject;
      if (!subName && attRecord && attRecord.subject) subName = attRecord.subject;

      let facName = q.created_by_faculty_id ? facMap.get(String(q.created_by_faculty_id)) : null;
      if (!facName && facultyList && facultyList.length > 0) facName = facultyList[0].name;

      const sessDate = q.date || (q.created_at ? q.created_at.split('T')[0] : (attRecord ? attRecord.date : ''));
      const sessTime = q.created_at ? q.created_at.split('T')[1].substring(0, 8) : (attRecord ? attRecord.time : '00:00:00');

      list.push({
        id: `qr_${q.id}`,
        qr_session_id: q.id,
        date: sessDate || new Date().toISOString().split('T')[0],
        time: sessTime,
        subject: subName || 'Class Lecture',
        faculty_name: facName || 'Faculty',
        status: isAttended ? 'Present' : 'Absent',
        semester: studentSem
      });
    });

    // Process OTP Sessions
    semOtps.forEach(o => {
      const isAttended = attendedOtpIds.has(String(o.id));
      const attRecord = studentAttMapByOtp.get(String(o.id));
      if (attRecord) processedAttIds.add(String(attRecord.id));

      let subName = o.subject;
      if (!subName && localMeta[`otp_${o.id}`]) subName = localMeta[`otp_${o.id}`].subject;
      if (!subName && attRecord && attRecord.subject) subName = attRecord.subject;

      let facName = o.generated_by ? facMap.get(String(o.generated_by)) : null;
      if (!facName && facultyList && facultyList.length > 0) facName = facultyList[0].name;

      const sessDate = o.date || (o.created_at ? o.created_at.split('T')[0] : (attRecord ? attRecord.date : ''));
      const sessTime = o.created_at ? o.created_at.split('T')[1].substring(0, 8) : (attRecord ? attRecord.time : '00:00:00');

      list.push({
        id: `otp_${o.id}`,
        otp_id: o.id,
        date: sessDate || new Date().toISOString().split('T')[0],
        time: sessTime,
        subject: subName || 'Class Lecture',
        faculty_name: facName || 'Faculty',
        status: isAttended ? 'Present' : 'Absent',
        semester: studentSem
      });
    });

    // Include any standalone attendance records for this student
    (rawStudentAtt || []).forEach(a => {
      if (!processedAttIds.has(String(a.id))) {
        const st = String(a.status || '').toLowerCase();
        const isPresent = st === 'success' || st === 'present';
        list.push({
          id: a.id,
          date: a.date,
          time: a.time,
          subject: a.subject || 'Class Lecture',
          faculty_name: (facultyList && facultyList.length > 0) ? facultyList[0].name : 'Faculty',
          status: isPresent ? 'Present' : 'Absent',
          semester: studentSem
        });
      }
    });

    // Sort list by Date DESC, Time DESC
    list.sort((a, b) => {
      const dComp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dComp !== 0) return dComp;
      return String(b.time || '').localeCompare(String(a.time || ''));
    });

    res.json(list);
  } catch (err) {
    console.error('Error fetching student attendance history:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance history.' });
  }
});

// GET live monitor data for Admin (today's logs)
router.get('/monitor', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    const [
      { data: faculties },
      { data: qrSessions },
      { data: otps },
      { data: logs }
    ] = await Promise.all([
      supabase.from('faculty').select('id, name'),
      supabase.from('qr_sessions').select('id, created_by_faculty_id, semester, division'),
      supabase.from('otp').select('id, generated_by, otp, semester, division'),
      supabase.from('attendance')
        .select(`
          id, time, distance, status, date, qr_session_id, otp_id, device_id,
          student:student_id (*)
        `)
        .eq('date', today)
        .order('time', { ascending: false })
    ]);

    const facMap = new Map((faculties || []).map(f => [String(f.id), f.name]));
    const qrMap = new Map((qrSessions || []).map(q => [String(q.id), q]));
    const otpMap = new Map((otps || []).map(o => [String(o.id), o]));

    let filteredLogs = logs || [];
    if (req.user.role === 'faculty') {
      filteredLogs = filteredLogs.filter(log => {
        const qrSess = log.qr_session_id ? qrMap.get(String(log.qr_session_id)) : null;
        const otpSess = log.otp_id ? otpMap.get(String(log.otp_id)) : null;
        return (qrSess && String(qrSess.created_by_faculty_id) === String(req.user.id)) ||
          (otpSess && String(otpSess.generated_by) === String(req.user.id)) ||
          (log.device_id === 'Manual');
      });
    }

    const flatLogs = filteredLogs.map(log => {
      const qrSess = log.qr_session_id ? qrMap.get(String(log.qr_session_id)) : null;
      const otpSess = log.otp_id ? otpMap.get(String(log.otp_id)) : null;

      let facName = 'Faculty';
      if (qrSess) {
        facName = facMap.get(String(qrSess.created_by_faculty_id)) || facName;
      } else if (otpSess) {
        facName = facMap.get(String(otpSess.generated_by)) || facName;
      } else if (log.device_id === 'Manual') {
        facName = 'Faculty (Manual)';
      }

      const todayStr = new Date().toISOString().split('T')[0];

      return {
        id: log.id,
        enrollment_no: log.student?.enrollment_no,
        roll_no: log.student?.roll_no,
        division: log.student?.division,
        name: log.student?.name,
        course: log.student?.course,
        semester: log.student?.semester,
        mobile: log.student?.mobile,
        date: log.date || todayStr,
        created_at: log.date || todayStr,
        time: log.time,
        distance: log.distance,
        status: log.status,
        device_id: log.device_id,
        otp_id: log.otp_id,
        otp: otpSess?.otp || null,
        qr_session_id: log.qr_session_id,
        subject: qrSess?.subject || otpSess?.subject || null,
        faculty_name: facName
      };
    });

    res.json(flatLogs);
  } catch (err) {
    console.error('Error fetching live monitor logs:', err);
    res.status(500).json({ error: 'Failed to retrieve live monitor logs.' });
  }
});

// GET report list with filters (Admin & Faculty)
const getReportsHandler = async (req, res) => {
  const { date, startDate, endDate, studentId, range } = req.query;

  try {
    let reqQuery = supabase.from('attendance').select(`
      id, time, distance, status, date, qr_session_id, device_id,
      student:student_id (*),
      otp:otp_id (otp, generated_by, faculty:generated_by(name)),
      qr_session:qr_session_id (created_by_faculty_id, faculty:created_by_faculty_id(name))
    `);

    const todayStr = getLocalDateString();
    if (range === 'today') {
      reqQuery = reqQuery.eq('date', todayStr);
    } else if (range === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      reqQuery = reqQuery.eq('date', getLocalDateString(y));
    } else if (range === 'last_week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      reqQuery = reqQuery.gte('date', getLocalDateString(w)).lte('date', todayStr);
    } else if (range === 'last_month') {
      const m = new Date();
      m.setDate(m.getDate() - 30);
      reqQuery = reqQuery.gte('date', getLocalDateString(m)).lte('date', todayStr);
    } else if (date) {
      reqQuery = reqQuery.eq('date', date);
    } else if (startDate && endDate) {
      reqQuery = reqQuery.gte('date', startDate).lte('date', endDate);
    }

    if (studentId) {
      reqQuery = reqQuery.eq('student_id', studentId);
    }

    reqQuery = reqQuery.order('date', { ascending: false }).order('time', { ascending: false });

    const { data: reports, error } = await reqQuery;
    if (error) throw error;

    let filteredReports = reports || [];
    if (req.user.role === 'faculty') {
      filteredReports = filteredReports.filter(log =>
        (log.qr_session && String(log.qr_session.created_by_faculty_id) === String(req.user.id)) ||
        (log.otp && String(log.otp.generated_by) === String(req.user.id)) ||
        (log.device_id === 'Manual' && !log.qr_session && !log.otp)
      );
    }

    const flatReports = filteredReports.map(log => ({
      id: log.id,
      enrollment_no: log.student?.enrollment_no,
      roll_no: log.student?.roll_no,
      division: log.student?.division,
      name: log.student?.name,
      course: log.student?.course,
      semester: log.student?.semester,
      mobile: log.student?.mobile,
      date: log.date,
      time: log.time,
      distance: log.distance,
      status: log.status,
      device_id: log.device_id,
      otp_id: log.otp_id,
      otp: log.otp?.otp,
      qr_session_id: log.qr_session_id,
      faculty_name: log.qr_session?.faculty?.name || log.otp?.faculty?.name || (log.device_id === 'Manual' ? 'Faculty (Manual)' : 'Admin')
    }));

    res.json(flatReports);
  } catch (err) {
    console.error('Error fetching report data:', err);
    res.status(500).json({ error: 'Failed to fetch report data.' });
  }
};

router.get('/reports', authenticateJWT, getReportsHandler);
router.get('/report', authenticateJWT, getReportsHandler);

// GET Dashboard Stats for Admin
router.get('/stats', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    const isFaculty = req.user.role === 'faculty';
    const facId = req.user.id;

    let otpsQuery = supabase.from('otp').select('*', { count: 'exact', head: true }).eq('date', today);
    if (isFaculty) otpsQuery = otpsQuery.eq('generated_by', facId);

    let latestOtpQuery = supabase.from('otp').select('*').order('id', { ascending: false }).limit(1);
    if (isFaculty) latestOtpQuery = latestOtpQuery.eq('generated_by', facId);

    let qrCountQuery = supabase.from('qr_sessions').select('*', { count: 'exact', head: true }).eq('date', today);
    if (isFaculty) qrCountQuery = qrCountQuery.eq('created_by_faculty_id', facId);

    let latestQrQuery = supabase.from('qr_sessions').select('*').order('id', { ascending: false }).limit(1);
    if (isFaculty) latestQrQuery = latestQrQuery.eq('created_by_faculty_id', facId);

    const [
      resStudents,
      resFaculty,
      resPresent,
      resOtpsGenerated,
      resLatestOtp,
      resQrCount,
      resLatestQr
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('faculty').select('*', { count: 'exact', head: true }),
      supabase.from('attendance').select('student_id, qr_session:qr_session_id(created_by_faculty_id), otp:otp_id(generated_by)').eq('date', today).eq('status', 'Success'),
      otpsQuery,
      latestOtpQuery.maybeSingle(),
      qrCountQuery,
      latestQrQuery.maybeSingle()
    ]);

    const totalStudents = resStudents.count || 0;
    const totalFaculty = resFaculty.count || 0;
    const presentRows = resPresent.data || [];
    const otpsGenerated = resOtpsGenerated.count || 0;
    const latestOtp = resLatestOtp.data || null;
    const qrSessionsGenerated = resQrCount.count || 0;
    const latestQr = resLatestQr.data || null;

    let filteredPresent = presentRows;
    if (isFaculty) {
      filteredPresent = filteredPresent.filter(r =>
        (r.qr_session && String(r.qr_session.created_by_faculty_id) === String(facId)) ||
        (r.otp && String(r.otp.generated_by) === String(facId))
      );
    }
    const presentToday = new Set(filteredPresent.map(r => r.student_id)).size;
    const totalSessionsToday = (otpsGenerated || 0) + (qrSessionsGenerated || 0) + (presentToday > 0 ? 1 : 0);
    const absentToday = totalSessionsToday > 0 ? Math.max(0, (totalStudents || 0) - presentToday) : 0;
    const otpsRemaining = Math.max(0, 5 - (otpsGenerated || 0));

    let activeOtp = null;
    if (latestOtp) {
      const now = new Date().getTime();
      const expireTime = new Date(latestOtp.expire_time).getTime();
      if (now < expireTime) {
        activeOtp = latestOtp.otp;
      }
    }

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
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);

      const { data: att } = await supabase.from('attendance')
        .select('student_id, qr_session:qr_session_id(created_by_faculty_id), otp:otp_id(generated_by)')
        .eq('date', dateStr)
        .eq('status', 'Success');
      let filteredAtt = att || [];
      if (req.user.role === 'faculty') {
        filteredAtt = filteredAtt.filter(r =>
          (r.qr_session && String(r.qr_session.created_by_faculty_id) === String(req.user.id)) ||
          (r.otp && String(r.otp.generated_by) === String(req.user.id))
        );
      }

      const pCount = new Set(filteredAtt.map(r => r.student_id)).size;
      trend.push({ date: dateStr, present_count: pCount });
    }

    res.json({
      totalStudents: totalStudents || 0,
      totalFaculty: totalFaculty || 0,
      presentToday,
      absentToday,
      otpsGenerated: otpsGenerated || 0,
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
    const { data: otps } = await supabase.from('otp').select('id, date, generated_time');
    const mappedOtps = (otps || []).map(o => ({ id: o.id, date: o.date, time: o.generated_time, type: 'otp' }));

    const { data: qrs } = await supabase.from('qr_sessions').select('id, date, created_at');
    const mappedQrs = (qrs || []).map(q => ({ id: q.id, date: q.date, time: q.created_at, type: 'qr' }));

    // Merge and sort by time
    const lectures = [...mappedOtps, ...mappedQrs].sort((a, b) => new Date(a.time) - new Date(b.time));

    // 2. Get successful attendances
    const { data: successOtpAtt } = await supabase.from('attendance')
      .select('otp_id')
      .eq('student_id', req.user.id)
      .eq('status', 'Success')
      .not('otp_id', 'is', null);

    const { data: successQrAtt } = await supabase.from('attendance')
      .select('qr_session_id')
      .eq('student_id', req.user.id)
      .eq('status', 'Success')
      .not('qr_session_id', 'is', null);

    const successOtpIds = new Set((successOtpAtt || []).map(a => a.otp_id));
    const successQrIds = new Set((successQrAtt || []).map(a => a.qr_session_id));

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

// GET Weekly Analysis for logged-in student (Total Sessions started vs Attended in current week)
router.get('/weekly-analysis', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    // 1. Fetch exact student details from DB
    let studentSem = req.user.semester ? parseInt(req.user.semester, 10) : null;
    let studentDiv = req.user.division ? String(req.user.division).trim().toUpperCase() : '';

    const { data: dbStudent } = await supabase.from('students')
      .select('semester, division')
      .eq('id', req.user.id)
      .maybeSingle();

    if (dbStudent) {
      if (dbStudent.semester) studentSem = parseInt(dbStudent.semester, 10);
      if (dbStudent.division) studentDiv = String(dbStudent.division).trim().toUpperCase();
    }

    const normalizeDiv = (str) => {
      if (!str) return '';
      return String(str).replace(/DIV(ISION)?/gi, '').replace(/[^A-Z0-9]/gi, '').trim().toUpperCase();
    };

    const normStudentDiv = normalizeDiv(studentDiv);

    // 2. Calculate current week range (Monday to Sunday)
    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sun, 1 is Mon, ...
    const distToMon = (currentDay + 6) % 7;

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - distToMon);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const formatISOStr = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Build day list for Mon - Sun
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekDaysMap = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = formatISOStr(d);
      weekDaysMap.push({
        dayName: dayNames[i],
        date: dateStr,
        total: 0,
        attended: 0
      });
    }

    const startOfWeekStr = formatISOStr(startOfWeek);
    const endOfWeekStr = formatISOStr(endOfWeek);

    // 3. Fetch QR sessions, OTP sessions and student attendance for current week ONLY
    const [{ data: qrSessions }, { data: otps }, { data: studentAtt }] = await Promise.all([
      supabase.from('qr_sessions')
        .select('id, created_at, date, semester, division')
        .gte('date', startOfWeekStr),
      supabase.from('otp')
        .select('id, generated_time, date, semester, division')
        .gte('date', startOfWeekStr),
      supabase.from('attendance')
        .select('id, status, date, time, qr_session_id, otp_id, device_id')
        .eq('student_id', req.user.id)
        .eq('status', 'Success')
        .gte('date', startOfWeekStr)
    ]);

    const parseSemNum = (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') return val;
      const match = String(val).match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    };

    // Filter sessions belonging to current week and student's semester/division
    const isSessInWeekAndMatch = (sessDateStr, sessTimeStr, sessSemVal, sessDivVal) => {
      let dStr = sessDateStr;
      if (!dStr && sessTimeStr) {
        try {
          dStr = new Date(sessTimeStr).toISOString().split('T')[0];
        } catch(e) {}
      }
      if (!dStr) return { matches: false, dateStr: null };

      const inWeek = dStr >= startOfWeekStr && dStr <= endOfWeekStr;
      if (!inWeek) return { matches: false, dateStr: dStr };

      const sSem = parseSemNum(sessSemVal);
      const sDiv = sessDivVal ? String(sessDivVal).trim().toUpperCase() : null;
      const normSessDiv = normalizeDiv(sDiv);

      const semMatches = (!sSem || (studentSem && sSem === studentSem));
      const divMatches = (!sDiv || sDiv === 'ALL' || !normSessDiv || !normStudentDiv || normSessDiv === normStudentDiv);

      return { matches: semMatches && divMatches, dateStr: dStr };
    };

    const studentPresentQrIds = new Set((studentAtt || []).filter(a => a.qr_session_id).map(a => String(a.qr_session_id)));
    const studentPresentOtpIds = new Set((studentAtt || []).filter(a => a.otp_id).map(a => String(a.otp_id)));

    let totalSessions = 0;
    let attendedSessions = 0;

    // Process QR sessions
    (qrSessions || []).forEach(q => {
      const { matches, dateStr } = isSessInWeekAndMatch(q.date, q.created_at, q.semester, q.division);
      if (matches) {
        totalSessions++;
        const dayItem = weekDaysMap.find(d => d.date === dateStr);
        if (dayItem) dayItem.total++;

        if (studentPresentQrIds.has(String(q.id))) {
          attendedSessions++;
          if (dayItem) dayItem.attended++;
        }
      }
    });

    // Process OTP sessions
    (otps || []).forEach(o => {
      const { matches, dateStr } = isSessInWeekAndMatch(o.date, o.generated_time, o.semester, o.division);
      if (matches) {
        totalSessions++;
        const dayItem = weekDaysMap.find(d => d.date === dateStr);
        if (dayItem) dayItem.total++;

        if (studentPresentOtpIds.has(String(o.id))) {
          attendedSessions++;
          if (dayItem) dayItem.attended++;
        }
      }
    });

    // Also account for any Manual attendance recorded this week
    (studentAtt || []).forEach(a => {
      if (a.device_id === 'Manual' && !a.qr_session_id && !a.otp_id) {
        let aDateStr = a.date;
        if (aDateStr && aDateStr >= startOfWeekStr && aDateStr <= endOfWeekStr) {
          totalSessions++;
          attendedSessions++;
          const dayItem = weekDaysMap.find(d => d.date === aDateStr);
          if (dayItem) {
            dayItem.total++;
            dayItem.attended++;
          }
        }
      }
    });

    const absentSessions = Math.max(0, totalSessions - attendedSessions);
    const percentage = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 100;

    const options = { day: 'numeric', month: 'short' };
    const weekRangeStr = `${startOfWeek.toLocaleDateString('en-US', options)} - ${endOfWeek.toLocaleDateString('en-US', options)}`;

    res.json({
      semester: studentSem,
      division: studentDiv || 'All',
      weekRange: weekRangeStr,
      startOfWeek: startOfWeekStr,
      endOfWeek: endOfWeekStr,
      totalSessions,
      attendedSessions,
      absentSessions,
      percentage,
      days: weekDaysMap.map(d => ({
        dayName: d.dayName,
        date: d.date,
        total: d.total,
        attended: d.attended,
        absent: Math.max(0, d.total - d.attended)
      }))
    });
  } catch (err) {
    console.error('Error calculating weekly analysis:', err);
    res.status(500).json({ error: 'Failed to fetch weekly analysis' });
  }
});

// GET Subject-Wise Attendance Breakdown for logged-in student (Dynamic by Semester & Real DB Sessions)
router.get('/subject-breakdown', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    // 1. Get logged in student's semester from DB
    let studentSem = req.user.semester ? parseInt(req.user.semester, 10) : 1;
    const { data: dbStudent } = await supabase.from('students')
      .select('semester')
      .eq('id', req.user.id)
      .maybeSingle();

    if (dbStudent && dbStudent.semester) {
      studentSem = parseInt(dbStudent.semester, 10);
    }

    // 2. Load all faculty members and assigned subjects
    const { data: facultyList } = await supabase.from('faculty').select('*');

    let subjectsMap = {};
    const subjectsFilePath = path.join(__dirname, '../data/faculty_subjects.json');
    if (fs.existsSync(subjectsFilePath)) {
      try {
        subjectsMap = JSON.parse(fs.readFileSync(subjectsFilePath, 'utf8'));
      } catch (e) { }
    }

    // Collect all subjects for studentSem from Faculty assignments
    const matchingSubjects = [];
    const seenNames = new Set();
    const facultySubjectListMap = new Map(); // facId -> [subjectNames]

    (facultyList || []).forEach(f => {
      let fSubjects = [];
      if (f.department && f.department.includes('||SUB:')) {
        try {
          const jsonStr = f.department.split('||SUB:')[1].split('||')[0];
          fSubjects = JSON.parse(jsonStr);
        } catch (e) { }
      }
      if (!fSubjects || fSubjects.length === 0) {
        fSubjects = subjectsMap[f.id] || subjectsMap[f.employee_no] || subjectsMap[String(f.id)] || [];
      }

      if (Array.isArray(fSubjects)) {
        const facSemSubs = [];
        fSubjects.forEach(sub => {
          const subSem = parseInt(sub.semester || '1', 10);
          if (subSem === studentSem) {
            const name = sub.subjectName ? String(sub.subjectName).trim() : (sub.name ? String(sub.name).trim() : '');
            if (name) {
              facSemSubs.push(name);
              const subCode = (sub.subjectCode && sub.subjectCode !== '-') ? sub.subjectCode : (sub.code && sub.code !== name ? sub.code : '');
              const subShort = sub.shortName || sub.shortCode || sub.short || getShortName(name);
              const subKey = subCode ? `${name.toLowerCase()}_${subCode.toLowerCase()}` : `${name.toLowerCase()}_${subShort.toLowerCase()}`;

              if (!seenNames.has(subKey)) {
                seenNames.add(subKey);
                matchingSubjects.push({
                  name,
                  code: subCode || `BCA-${studentSem}0${matchingSubjects.length + 1}`,
                  shortName: subShort
                });
              }
            }
          }
        });
        if (f.id) facultySubjectListMap.set(String(f.id), facSemSubs);
        if (f.employee_no) facultySubjectListMap.set(String(f.employee_no), facSemSubs);
        if (f.username) facultySubjectListMap.set(String(f.username), facSemSubs);
        if (f.email) facultySubjectListMap.set(String(f.email), facSemSubs);
      }
    });

    // Fallback curriculum if no faculty subjects assigned yet
    if (matchingSubjects.length === 0) {
      const defaultCurriculum = {
        1: [
          { name: 'C Language', code: 'BCA-101', shortName: 'C Language' },
          { name: 'Computer Fundamentals & IT', code: 'BCA-102', shortName: 'CF & IT' },
          { name: 'Digital Electronics', code: 'BCA-103', shortName: 'DE' },
          { name: 'Mathematical Foundation', code: 'BCA-104', shortName: 'Maths' },
          { name: 'Communication Skills', code: 'BCA-105', shortName: 'Comm Skills' }
        ],
        2: [
          { name: 'Database Management Systems (DBMS)', code: 'BCA-201', shortName: 'DBMS' },
          { name: 'Web Technologies & React', code: 'BCA-202', shortName: 'WT' },
          { name: 'Data Structures & Algorithms', code: 'BCA-203', shortName: 'DSA' },
          { name: 'Software Engineering', code: 'BCA-204', shortName: 'SE' },
          { name: 'Computer Networks', code: 'BCA-205', shortName: 'CN' }
        ],
        3: [
          { name: 'Java Programming', code: 'BCA-301', shortName: 'JAVA' },
          { name: 'Operating Systems', code: 'BCA-302', shortName: 'OS' },
          { name: 'Computer Architecture & Org', code: 'BCA-303', shortName: 'CAO' },
          { name: 'Python Programming', code: 'BCA-304', shortName: 'PYTHON' },
          { name: 'Discrete Mathematics', code: 'BCA-305', shortName: 'DM' }
        ],
        4: [
          { name: 'Advanced Java & J2EE', code: 'BCA-401', shortName: 'ADV-JAVA' },
          { name: 'PHP & MySQL Web Dev', code: 'BCA-402', shortName: 'PHP' },
          { name: 'Object Oriented Analysis & Design', code: 'BCA-403', shortName: 'OOAD' },
          { name: 'Cyber Security & Laws', code: 'BCA-404', shortName: 'CYBER-SEC' },
          { name: 'Environmental Studies', code: 'BCA-405', shortName: 'EVS' }
        ],
        5: [
          { name: 'Mobile Application Dev (Android)', code: 'BCA-501', shortName: 'MAD' },
          { name: 'Cloud Computing & DevOps', code: 'BCA-502', shortName: 'CLOUD' },
          { name: 'Information & Network Security', code: 'BCA-503', shortName: 'INS' },
          { name: 'Artificial Intelligence & ML', code: 'BCA-504', shortName: 'AI-ML' },
          { name: 'Project Development Phase 1', code: 'BCA-505', shortName: 'PROJECT-1' }
        ],
        6: [
          { name: 'Full Stack Web Development', code: 'BCA-601', shortName: 'FULLSTACK' },
          { name: 'Data Science & Big Data Analytics', code: 'BCA-602', shortName: 'DATA-SCI' },
          { name: 'Software Quality Testing', code: 'BCA-603', shortName: 'SQT' },
          { name: 'Major Project & Viva', code: 'BCA-604', shortName: 'MAJOR-PROJ' }
        ]
      };

      const semDefaults = defaultCurriculum[studentSem] || defaultCurriculum[1];
      semDefaults.forEach(d => matchingSubjects.push(d));
    }

    // 3. Query created QR sessions, OTP sessions and student attendance records
    const [{ data: qrSessions }, { data: otps }, { data: rawStudentAtt }] = await Promise.all([
      supabase.from('qr_sessions').select('id, created_by_faculty_id, semester, division, subject'),
      supabase.from('otp').select('id, generated_by, semester, division, subject'),
      supabase.from('attendance').select('id, status, qr_session_id, otp_id, device_id, subject, student_id')
    ]);

    // Build comprehensive set of student identifiers (IDs and enrollment numbers)
    const stuKeys = new Set();
    const addKey = (val) => {
      if (val === null || val === undefined) return;
      const s = String(val).trim();
      if (!s) return;
      stuKeys.add(s);
      stuKeys.add(s.toLowerCase());
      const clean = s.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (clean) stuKeys.add(clean);
    };

    addKey(req.user.id);
    addKey(req.user.enrollment_no);
    addKey(req.user.username);
    if (dbStudent) {
      addKey(dbStudent.id);
      addKey(dbStudent.enrollment_no);
      addKey(dbStudent.username);
      addKey(dbStudent.roll_no);
    }

    const studentAtt = (rawStudentAtt || []).filter(a => {
      const sId = a.student_id;
      const eNo = a.enrollment_no;

      const matchId = (sId !== null && sId !== undefined) && (stuKeys.has(String(sId).trim()) || stuKeys.has(String(sId).trim().toLowerCase()) || stuKeys.has(String(sId).replace(/[^a-z0-9]/gi, '').toLowerCase()));
      const matchEno = (eNo !== null && eNo !== undefined) && (stuKeys.has(String(eNo).trim()) || stuKeys.has(String(eNo).trim().toLowerCase()) || stuKeys.has(String(eNo).replace(/[^a-z0-9]/gi, '').toLowerCase()));

      const isStuMatch = matchId || matchEno;
      const st = String(a.status || '').toLowerCase();
      const isPresent = st === 'success' || st === 'present';
      return isStuMatch && isPresent;
    });

    const localMeta = getLocalSessionMetaMap();
    (qrSessions || []).forEach(q => {
      const meta = localMeta[`qr_${q.id}`];
      if (meta) {
        if (!q.subject && meta.subject) q.subject = meta.subject;
        if (!q.division && meta.division) q.division = meta.division;
      }
    });

    (otps || []).forEach(o => {
      const meta = localMeta[`otp_${o.id}`];
      if (meta) {
        if (!o.subject && meta.subject) o.subject = meta.subject;
        if (!o.division && meta.division) o.division = meta.division;
      }
    });

    const normalizeDiv = (str) => {
      if (!str) return '';
      return String(str).replace(/DIV(ISION)?/gi, '').replace(/[^A-Z0-9]/gi, '').trim().toUpperCase();
    };

    const studentDiv = (dbStudent && dbStudent.division) ? String(dbStudent.division).trim().toUpperCase() : (req.user.division ? String(req.user.division).trim().toUpperCase() : null);
    const normStudentDiv = normalizeDiv(studentDiv);

    function getShortName(fullName, shortInput) {
      if (shortInput && String(shortInput).trim() !== '' && !String(shortInput).trim().startsWith('BCA-')) {
        return String(shortInput).trim();
      }
      const str = String(fullName || '').trim();
      const parenMatch = str.match(/\(([^)]+)\)/);
      if (parenMatch && parenMatch[1] && parenMatch[1].trim().length <= 10) {
        return parenMatch[1].trim();
      }
      return str;
    }

    function parseSemNum(val) {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') return val;
      const str = String(val);
      const match = str.match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    }

    // Filter created sessions specifically for studentSem and studentDiv
    const semQrSessions = (qrSessions || []).filter(q => {
      const qSem = parseSemNum(q.semester);
      if (qSem !== null && qSem !== studentSem) return false;
      
      const normSessDiv = normalizeDiv(q.division);
      if (normSessDiv && normSessDiv !== 'ALL' && normStudentDiv) {
        if (normSessDiv !== normStudentDiv) return false;
      }
      return true;
    });

    const semOtps = (otps || []).filter(o => {
      const oSem = parseSemNum(o.semester);
      if (oSem !== null && oSem !== studentSem) return false;
      
      const normSessDiv = normalizeDiv(o.division);
      if (normSessDiv && normSessDiv !== 'ALL' && normStudentDiv) {
        if (normSessDiv !== normStudentDiv) return false;
      }
      return true;
    });

    // Dynamically add any unique subject names present in created sessions to matchingSubjects
    const allCreatedSessions = [...semQrSessions, ...semOtps];
    allCreatedSessions.forEach(sess => {
      if (sess.subject && String(sess.subject).trim() !== '') {
        const subName = String(sess.subject).trim();
        const key = subName.toLowerCase().replace(/lang(uage)?/gi, '').replace(/[^a-z0-9]/g, '');
        const alreadyExists = matchingSubjects.some(m => {
          const mKey = (m.name || '').toLowerCase().replace(/lang(uage)?/gi, '').replace(/[^a-z0-9]/g, '');
          const mShortKey = (m.shortName || '').toLowerCase().replace(/lang(uage)?/gi, '').replace(/[^a-z0-9]/g, '');
          const mCodeKey = (m.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return mKey === key || mShortKey === key || (mKey && key && (mKey.includes(key) || key.includes(mKey))) || (mCodeKey && key.includes(mCodeKey));
        });
        if (!alreadyExists) {
          matchingSubjects.push({
            name: subName,
            code: `SUB-${matchingSubjects.length + 1}`,
            shortName: getShortName(subName, '')
          });
        }
      }
    });

    const breakdown = matchingSubjects.map((sub, idx) => {
      const isSubMatch = (subjectStr) => {
        if (!subjectStr) return false;
        const sRaw = String(subjectStr).toLowerCase().trim();
        const sFullClean = sRaw.replace(/[^a-z0-9]/g, '');
        if (!sFullClean) return false;

        const codeRaw = (sub.code || '').toLowerCase().trim();
        const codeClean = codeRaw.replace(/[^a-z0-9]/g, '');

        const nameRaw = (sub.name || '').toLowerCase().trim();
        const nameFullClean = nameRaw.replace(/[^a-z0-9]/g, '');

        const shortRaw = (sub.shortName || '').toLowerCase().trim();
        const shortFullClean = shortRaw.replace(/[^a-z0-9]/g, '');

        // 1. If subject code is present in subjectStr (e.g. DSC-C-BCA-111T or DSC-C-BCA-112P)
        if (codeClean && codeClean.length >= 3) {
          if (sFullClean.includes(codeClean)) return true;
          // If session subject string contains a code pattern (dsc... or bca...) and it does NOT match this card's code, reject it
          const hasCodePattern = /(dsc|bca|sub)[a-z0-9]+/i.test(sRaw);
          if (hasCodePattern) return false;
        }

        // 2. Discriminate Practical vs Theory if specified
        const isSessPractical = /practical|lab|\bpr\b/i.test(sRaw) || (sRaw.endsWith('p') && sRaw.includes('bca'));
        const isCardPractical = /practical|lab|\bpr\b/i.test(nameRaw) || /practical|lab|\bpr\b/i.test(shortRaw) || (codeClean && codeClean.endsWith('p'));

        if (isSessPractical !== isCardPractical) {
          return false;
        }

        // 3. Exact full clean match
        if (sFullClean === nameFullClean || (shortFullClean && sFullClean === shortFullClean)) return true;

        // 4. Clean string match
        const sClean = sRaw.replace(/lang(uage)?|prog(ramming)?|lab|tech(nology)?|dev(elopment)?/gi, '').replace(/[^a-z0-9]/g, '');
        const nameClean = nameRaw.replace(/lang(uage)?|prog(ramming)?|lab|tech(nology)?|dev(elopment)?/gi, '').replace(/[^a-z0-9]/g, '');
        const shortClean = shortRaw.replace(/lang(uage)?|prog(ramming)?|lab|tech(nology)?|dev(elopment)?/gi, '').replace(/[^a-z0-9]/g, '');
        if (sClean && (sClean === nameClean || (shortClean && sClean === shortClean))) return true;

        // 5. Raw string match
        if (sRaw === nameRaw || (shortRaw && sRaw === shortRaw)) return true;

        return false;
      };

      // Match created QR sessions for this specific subject
      const matchingQrSessions = semQrSessions.filter(q => {
        if (q.subject && String(q.subject).trim() !== '') {
          return isSubMatch(q.subject);
        }
        // Fallback: check if any student attendance record for this session has a matching subject
        const linkedAtt = (studentAtt || []).find(a => String(a.qr_session_id) === String(q.id));
        if (linkedAtt && linkedAtt.subject && isSubMatch(linkedAtt.subject)) {
          return true;
        }
        return false;
      });

      // Match created OTP sessions for this specific subject
      const matchingOtps = semOtps.filter(o => {
        if (o.subject && String(o.subject).trim() !== '') {
          return isSubMatch(o.subject);
        }
        // Fallback: check if any student attendance record for this session has a matching subject
        const linkedAtt = (studentAtt || []).find(a => String(a.otp_id) === String(o.id));
        if (linkedAtt && linkedAtt.subject && isSubMatch(linkedAtt.subject)) {
          return true;
        }
        return false;
      });

      let totalCreated = matchingQrSessions.length + matchingOtps.length;
      let attendedCount = 0;
      const countedAttIds = new Set();

      matchingQrSessions.forEach(q => {
        const linkedAtt = (studentAtt || []).find(a => String(a.qr_session_id) === String(q.id));
        if (linkedAtt) {
          attendedCount++;
          countedAttIds.add(String(linkedAtt.id));
        }
      });

      matchingOtps.forEach(o => {
        const linkedAtt = (studentAtt || []).find(a => String(a.otp_id) === String(o.id));
        if (linkedAtt) {
          attendedCount++;
          countedAttIds.add(String(linkedAtt.id));
        }
      });

      // Account for any remaining attendance records for this student tagged with this subject
      (studentAtt || []).forEach(a => {
        if (!countedAttIds.has(String(a.id)) && a.subject && isSubMatch(a.subject)) {
          attendedCount++;
          countedAttIds.add(String(a.id));
        }
      });

      if (attendedCount > totalCreated) {
        totalCreated = attendedCount;
      }

      const pct = totalCreated > 0 ? Math.round((attendedCount / totalCreated) * 100) : 100;
      const shortName = sub.shortName || getShortName(sub.name, sub.code);
      const subjectCode = (sub.code && sub.code !== sub.name) ? sub.code : `BCA-${studentSem}0${idx + 1}`;

      return {
        name: sub.name,
        shortName: shortName,
        code: subjectCode,
        attended: attendedCount,
        total: totalCreated,
        pct: pct
      };
    });

    res.json({
      semester: studentSem,
      breakdown
    });
  } catch (err) {
    console.error('Error fetching subject breakdown:', err);
    res.status(500).json({ error: 'Failed to fetch subject breakdown' });
  }
});

module.exports = router;
