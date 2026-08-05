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
    if (deviceId && deviceId !== 'Manual') {
      const { data: lastDeviceAttendance } = await supabase.from('attendance')
        .select('date, time')
        .eq('device_id', deviceId)
        .eq('status', 'Success')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

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
      const { data: qrSession } = await supabase.from('qr_sessions').select('*').eq('id', sessionId).maybeSingle();
      qrSessionRecord = qrSession;
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

      attendanceLinkCol = 'qr_session_id';
      attendanceLinkId = sessionId;
    } else {
      // 2. Legacy OTP Submission
      const { data: otpRecord } = await supabase.from('otp').select('*').eq('otp', otp).order('id', { ascending: false }).limit(1).maybeSingle();
      
      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP. Please enter the correct code.' });
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

    const insertPayload = {
      student_id: req.user.id,
      date: localDateStr,
      time: localTimeStr,
      latitude,
      longitude,
      distance: parseFloat(dist.toFixed(2)),
      status,
      device_id: deviceId || null
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
    const { data: existing } = await supabase.from('attendance')
      .select('id, device_id, status')
      .eq('student_id', student_id)
      .eq('date', today)
      .eq('status', 'Success')
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.device_id && existing.device_id !== 'Manual') {
        return res.status(400).json({ error: 'Student already marked attendance via Smartphone today.' });
      } else {
        return res.status(400).json({ error: 'Student is already marked present today.' });
      }
    }

    let linkCol = null;
    let linkId = null;

    if (qr_session_id) {
      linkCol = 'qr_session_id';
      linkId = qr_session_id;
    } else if (otp_id) {
      linkCol = 'otp_id';
      linkId = otp_id;
    } else {
      // Find latest QR session by this faculty today
      const { data: recentQr } = await supabase.from('qr_sessions')
        .select('id')
        .eq('created_by_faculty_id', req.user.id)
        .gte('created_at', today + 'T00:00:00.000Z')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentQr) {
        linkCol = 'qr_session_id';
        linkId = recentQr.id;
      } else {
        const { data: recentOtp } = await supabase.from('otp')
          .select('id')
          .eq('generated_by', req.user.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentOtp) {
          linkCol = 'otp_id';
          linkId = recentOtp.id;
        }
      }
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
      device_id: 'Manual'
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
  const { student_id, date } = req.body;
  if (!student_id) {
    return res.status(400).json({ error: 'Student ID is required.' });
  }
  try {
    const targetDate = date || getLocalDateString();
    const { data: toDelete, error: findErr } = await supabase.from('attendance')
      .select('id, device_id')
      .eq('student_id', student_id)
      .eq('date', targetDate)
      .eq('device_id', 'Manual')
      .limit(1)
      .maybeSingle();

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
    const { data: history } = await supabase.from('attendance')
      .select('id, date, time, latitude, longitude, distance, status, qr_session_id, otp:otp_id(otp)')
      .eq('student_id', req.user.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false });

    const mappedHistory = (history || []).map(h => ({
      ...h,
      otp: h.otp ? h.otp.otp : null
    }));

    res.json(mappedHistory);
  } catch (err) {
    console.error('Error fetching student attendance history:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance history.' });
  }
});

// GET live monitor data for Admin (today's logs)
router.get('/monitor', authenticateJWT, requireAdmin, async (req, res) => {
  const today = getLocalDateString();
  try {
    const { data: logs } = await supabase.from('attendance')
      .select(`
        id, time, distance, status, date, qr_session_id, device_id,
        student:student_id (*),
        otp:otp_id (otp, generated_by, faculty:generated_by(name)),
        qr_session:qr_session_id (created_by_faculty_id, faculty:created_by_faculty_id(name))
      `)
      .eq('date', today)
      .order('time', { ascending: false });

    let filteredLogs = logs || [];
    if (req.user.role === 'faculty') {
      filteredLogs = filteredLogs.filter(log => 
        (log.qr_session && String(log.qr_session.created_by_faculty_id) === String(req.user.id)) ||
        (log.otp && String(log.otp.generated_by) === String(req.user.id)) ||
        (log.device_id === 'Manual' && !log.qr_session && !log.otp)
      );
    }

    const flatLogs = filteredLogs.map(log => ({
      id: log.id,
      enrollment_no: log.student?.enrollment_no,
      roll_no: log.student?.roll_no,
      division: log.student?.division,
      name: log.student?.name,
      course: log.student?.course,
      semester: log.student?.semester,
      mobile: log.student?.mobile,
      time: log.time,
      distance: log.distance,
      status: log.status,
      device_id: log.device_id,
      otp: log.otp?.otp,
      qr_session_id: log.qr_session_id,
      faculty_name: log.qr_session?.faculty?.name || log.otp?.faculty?.name || (log.device_id === 'Manual' ? 'Faculty (Manual)' : 'Admin')
    }));

    res.json(flatLogs);
  } catch (err) {
    console.error('Error fetching live monitor logs:', err);
    res.status(500).json({ error: 'Failed to retrieve live monitor logs.' });
  }
});

// GET report list with filters (Admin only)
router.get('/reports', authenticateJWT, requireAdmin, async (req, res) => {
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
      otp: log.otp?.otp,
      qr_session_id: log.qr_session_id,
      faculty_name: log.qr_session?.faculty?.name || log.otp?.faculty?.name || (log.device_id === 'Manual' ? 'Faculty (Manual)' : 'Admin')
    }));

    res.json(flatReports);
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
    const { count: totalStudents } = await supabase.from('students').select('*', { count: 'exact', head: true });
    
    // 1b. Total Faculty
    const { count: totalFaculty } = await supabase.from('faculty').select('*', { count: 'exact', head: true });
    
    // 2. Present Today (Success logs count unique student_id)
    const { data: presentRows } = await supabase.from('attendance')
      .select('student_id, qr_session:qr_session_id(created_by_faculty_id), otp:otp_id(generated_by)')
      .eq('date', today).eq('status', 'Success');
    let filteredPresent = presentRows || [];
    if (req.user.role === 'faculty') {
      filteredPresent = filteredPresent.filter(r => 
        (r.qr_session && String(r.qr_session.created_by_faculty_id) === String(req.user.id)) ||
        (r.otp && String(r.otp.generated_by) === String(req.user.id))
      );
    }
    const presentToday = new Set(filteredPresent.map(r => r.student_id)).size;

    // 3. Absent Today
    const absentToday = Math.max(0, (totalStudents || 0) - presentToday);

    // 4. Legacy OTPs generated today
    let otpsQuery = supabase.from('otp').select('*', { count: 'exact', head: true }).eq('date', today);
    if (req.user.role === 'faculty') {
      otpsQuery = otpsQuery.eq('generated_by', req.user.id);
    }
    const { count: otpsGenerated } = await otpsQuery;
    const otpsRemaining = Math.max(0, 5 - (otpsGenerated || 0));

    // 5. Legacy Active OTP info
    let latestOtpQuery = supabase.from('otp').select('*').order('id', { ascending: false }).limit(1);
    if (req.user.role === 'faculty') {
      latestOtpQuery = latestOtpQuery.eq('generated_by', req.user.id);
    }
    const { data: latestOtp } = await latestOtpQuery.maybeSingle();
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
      const { count } = await supabase.from('qr_sessions').select('*', { count: 'exact', head: true })
        .eq('date', today).eq('created_by_faculty_id', req.user.id);
      qrSessionsGenerated = count || 0;
    } else {
      const { count } = await supabase.from('qr_sessions').select('*', { count: 'exact', head: true }).eq('date', today);
      qrSessionsGenerated = count || 0;
    }

    // 7. Active QR session info
    let latestQrQuery = supabase.from('qr_sessions').select('*').order('id', { ascending: false }).limit(1);
    if (req.user.role === 'faculty') {
      latestQrQuery = latestQrQuery.eq('created_by_faculty_id', req.user.id);
    }
    const { data: latestQr } = await latestQrQuery.maybeSingle();
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

module.exports = router;
