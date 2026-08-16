const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

// Path for local fallback storage if Supabase table is not configured
const leavesFilePath = path.join(__dirname, '../data/leaves.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Helper to get local leaves JSON
function getLocalLeaves() {
  if (fs.existsSync(leavesFilePath)) {
    try {
      const content = fs.readFileSync(leavesFilePath, 'utf8');
      return JSON.parse(content) || [];
    } catch (e) {
      console.error('Error reading leaves.json:', e);
      return [];
    }
  }
  return [];
}

// Helper to save local leaves JSON
function saveLocalLeaves(leaves) {
  try {
    fs.writeFileSync(leavesFilePath, JSON.stringify(leaves, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing leaves.json:', e);
  }
}

// Helper to get local date string YYYY-MM-DD
function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET recipients list (Faculty members + Admin) for leave application dropdown
router.get('/recipients', authenticateJWT, async (req, res) => {
  try {
    const list = [
      { id: 'ADMIN', name: 'Admin' }
    ];

    try {
      const { data: faculty, error } = await supabase.from('faculty').select('id, name');
      if (!error && faculty) {
        faculty.forEach(f => {
          if (f.name) {
            let cleanName = String(f.name).trim();
            if (cleanName.includes('(')) cleanName = cleanName.split('(')[0].trim();
            if (cleanName.includes('||')) cleanName = cleanName.split('||')[0].trim();

            if (cleanName) {
              list.push({
                id: String(f.id),
                name: cleanName
              });
            }
          }
        });
      }
    } catch (dbErr) {
      console.warn('Recipients faculty fetch fallback:', dbErr.message);
    }

    return res.json(list);
  } catch (err) {
    console.error('Error fetching leave recipients:', err);
    return res.status(500).json({ error: 'Failed to fetch recipients list.' });
  }
});

// POST apply for leave (Student only)
router.post('/apply', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can submit leave applications.' });
  }

  const { type, from, to, reason, recipient_id, recipient_name } = req.body;

  if (!from || !to || !reason) {
    return res.status(400).json({ error: 'Please provide all leave details (From Date, To Date, Reason).' });
  }

  try {
    const today = getLocalDateString();
    let cleanRecName = recipient_name || 'Admin';
    if (cleanRecName.includes('(')) cleanRecName = cleanRecName.split('(')[0].trim();
    if (cleanRecName.includes('||')) cleanRecName = cleanRecName.split('||')[0].trim();

    const leaveObj = {
      id: Date.now(),
      student_id: req.user.id,
      enrollment_no: req.user.enrollment_no || req.user.username || 'STUDENT',
      roll_no: req.user.roll_no || req.user.roll || '',
      student_name: req.user.name || 'Student',
      course: req.user.course || 'BCA',
      semester: req.user.semester || '1',
      division: req.user.division || 'A',
      type: type || 'Personal Leave',
      recipient_id: recipient_id || 'ADMIN',
      recipient_name: cleanRecName,
      from_date: from,
      to_date: to,
      reason: reason,
      status: 'Pending',
      admin_remarks: '',
      date_submitted: today,
      created_at: new Date().toISOString()
    };

    // 1. Save to Supabase (if table exists)
    let supabaseSaved = false;
    try {
      const { data, error } = await supabase.from('leaves').insert([leaveObj]).select().single();
      if (!error && data) {
        supabaseSaved = true;
      }
    } catch (dbErr) {
      console.warn('Supabase leaves insert fallback:', dbErr.message);
    }

    // 2. Always persist to local JSON fallback as backup
    const localLeaves = getLocalLeaves();
    localLeaves.unshift(leaveObj);
    saveLocalLeaves(localLeaves);

    return res.status(201).json({
      message: 'Leave application submitted successfully for review!',
      leave: leaveObj
    });
  } catch (err) {
    console.error('Error submitting leave application:', err);
    return res.status(500).json({ error: 'Failed to submit leave application.' });
  }
});

// GET my leave applications (Student only)
router.get('/my', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student access only.' });
  }

  try {
    let leavesList = [];
    
    // Try Supabase first
    try {
      const { data, error } = await supabase.from('leaves')
        .select('*')
        .eq('student_id', req.user.id)
        .order('id', { ascending: false });
      
      if (!error && data && data.length > 0) {
        leavesList = data;
      }
    } catch (e) {}

    // Combine with local JSON fallback
    const localLeaves = getLocalLeaves().filter(l => String(l.student_id) === String(req.user.id));
    const mergedMap = new Map();
    [...leavesList, ...localLeaves].forEach(item => {
      if (item && item.id) mergedMap.set(String(item.id), item);
    });

    const finalLeaves = Array.from(mergedMap.values()).sort((a, b) => Number(b.id) - Number(a.id));

    return res.json(finalLeaves);
  } catch (err) {
    console.error('Error fetching student leaves:', err);
    return res.status(500).json({ error: 'Failed to fetch leave applications.' });
  }
});

// GET all leave applications (Admin & Faculty)
router.get('/all', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Admin / Faculty access required.' });
  }

  try {
    let leavesList = [];

    // Try Supabase
    try {
      const { data, error } = await supabase.from('leaves')
        .select('*')
        .order('id', { ascending: false });
      
      if (!error && data) {
        leavesList = data;
      }
    } catch (e) {}

    // Combine with local JSON fallback
    const localLeaves = getLocalLeaves();
    const mergedMap = new Map();
    [...leavesList, ...localLeaves].forEach(item => {
      if (item && item.id) mergedMap.set(String(item.id), item);
    });

    let finalLeaves = Array.from(mergedMap.values()).sort((a, b) => Number(b.id) - Number(a.id));

    // Filter for Faculty Panel: show only leaves targeted to ALL, or specifically to this Faculty
    if (req.user.role === 'faculty') {
      const facultyId = String(req.user.id || '').trim();
      let facultyName = String(req.user.name || '').trim().toLowerCase();
      if (facultyName.includes('(')) facultyName = facultyName.split('(')[0].trim();
      if (facultyName.includes('||')) facultyName = facultyName.split('||')[0].trim();

      finalLeaves = finalLeaves.filter(l => {
        const recId = String(l.recipient_id || '').trim();
        let recName = String(l.recipient_name || '').trim().toLowerCase();
        if (recName.includes('(')) recName = recName.split('(')[0].trim();
        if (recName.includes('||')) recName = recName.split('||')[0].trim();

        // 1. Target is ALL or missing
        if (!recId || recId === 'ALL') return true;
        // 2. Target ID matches Faculty ID
        if (recId === facultyId) return true;
        // 3. Target Name matches Faculty Name
        if (facultyName && recName && (recName.includes(facultyName) || facultyName.includes(recName))) return true;

        return false;
      });
    }

    return res.json(finalLeaves);
  } catch (err) {
    console.error('Error fetching all leaves:', err);
    return res.status(500).json({ error: 'Failed to fetch leave applications.' });
  }
});

// PUT update leave application status (Approve / Reject by Admin / Faculty)
router.put('/:id/status', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Admin / Faculty access required.' });
  }

  const { id } = req.params;
  const { status, admin_remarks } = req.body;

  if (!status || (status !== 'Approved' && status !== 'Rejected' && status !== 'Pending')) {
    return res.status(400).json({ error: 'Invalid status. Must be Approved or Rejected.' });
  }

  try {
    const leaveId = isNaN(id) ? id : Number(id);

    // 1. Update in local JSON
    const localLeaves = getLocalLeaves();
    let updatedLocalObj = null;
    const updatedLocalLeaves = localLeaves.map(l => {
      if (String(l.id) === String(id)) {
        l.status = status;
        if (admin_remarks !== undefined) l.admin_remarks = admin_remarks;
        l.reviewed_by = req.user.name || 'Admin';
        l.reviewed_at = new Date().toISOString();
        updatedLocalObj = l;
      }
      return l;
    });
    saveLocalLeaves(updatedLocalLeaves);

    // 2. Update in Supabase (if table exists)
    try {
      await supabase.from('leaves').update({
        status,
        admin_remarks: admin_remarks || '',
        reviewed_by: req.user.name || 'Admin',
        reviewed_at: new Date().toISOString()
      }).eq('id', leaveId);
    } catch (e) {}

    return res.json({
      message: `Leave application status updated to ${status}`,
      leave: updatedLocalObj || { id: leaveId, status }
    });
  } catch (err) {
    console.error('Error updating leave status:', err);
    return res.status(500).json({ error: 'Failed to update leave application status.' });
  }
});

// DELETE leave application (Admin / Faculty)
router.delete('/:id', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Admin / Faculty access required.' });
  }

  const { id } = req.params;

  try {
    // 1. Delete from local JSON
    const localLeaves = getLocalLeaves();
    const updatedLocalLeaves = localLeaves.filter(l => String(l.id) !== String(id));
    saveLocalLeaves(updatedLocalLeaves);

    // 2. Delete from Supabase (if table exists)
    try {
      const leaveId = isNaN(id) ? id : Number(id);
      await supabase.from('leaves').delete().eq('id', leaveId);
    } catch (e) {}

    return res.json({ message: 'Leave application deleted successfully.' });
  } catch (err) {
    console.error('Error deleting leave application:', err);
    return res.status(500).json({ error: 'Failed to delete leave application.' });
  }
});

module.exports = router;
