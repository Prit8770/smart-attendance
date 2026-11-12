const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

// Path for local fallback storage when Supabase table is not configured yet
const leavesFilePath = path.join(__dirname, '../data/leaves.json');
const dataDir = path.join(__dirname, '../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function isMissingLeavesTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|relation .*leaves.* does not exist/i.test(msg)
  );
}

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

function saveLocalLeaves(leaves) {
  try {
    fs.writeFileSync(leavesFilePath, JSON.stringify(leaves, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing leaves.json:', e);
  }
}

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractAttachmentMetadata(attachment) {
  if (!attachment || typeof attachment !== 'string') {
    return { fileType: null, fileSize: null };
  }
  const match = /^data:([^;]+);base64,(.+)$/.exec(attachment);
  if (!match) {
    return { fileType: null, fileSize: null };
  }
  return {
    fileType: match[1] || null,
    fileSize: Buffer.from(match[2], 'base64').length
  };
}

function mergeLeaveLists(primaryList, fallbackList) {
  const mergedMap = new Map();
  [...(primaryList || []), ...(fallbackList || [])].forEach(item => {
    if (item && item.id !== undefined && item.id !== null) {
      const key = String(item.id);
      const existing = mergedMap.get(key) || {};
      mergedMap.set(key, {
        ...existing,
        ...item,
        attachment: item.attachment || existing.attachment || null,
        file_name: item.file_name || existing.file_name || null
      });
    }
  });
  return Array.from(mergedMap.values()).sort((a, b) => Number(b.id) - Number(a.id));
}

function cleanRecipientLabel(name) {
  let clean = String(name || 'Admin').trim();
  if (clean.includes('(')) clean = clean.split('(')[0].trim();
  if (clean.includes('||')) clean = clean.split('||')[0].trim();
  return clean || 'Admin';
}

// GET recipients list (Faculty members + Admin) for leave application dropdown
router.get('/recipients', authenticateJWT, async (req, res) => {
  try {
    const list = [{ id: 'ADMIN', name: 'Admin' }];

    try {
      const { data: faculty, error } = await supabase.from('faculty').select('id, name');
      if (!error && faculty) {
        faculty.forEach(f => {
          if (f.name) {
            let cleanName = String(f.name).trim();
            if (cleanName.includes('(')) cleanName = cleanName.split('(')[0].trim();
            if (cleanName.includes('||')) cleanName = cleanName.split('||')[0].trim();
            if (cleanName) {
              list.push({ id: String(f.id), name: cleanName });
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

  const { type, from, to, reason, recipient_id, recipient_name, attachment, file_name } = req.body;

  if (!from || !to || !reason) {
    return res.status(400).json({ error: 'Please provide all leave details (From Date, To Date, Reason).' });
  }

  try {
    const today = getLocalDateString();
    const cleanRecName = cleanRecipientLabel(recipient_name);
    const cleanEnroll = String(req.user.enrollment_no || req.user.username || 'STUDENT').trim();
    const { fileType, fileSize } = extractAttachmentMetadata(attachment);

    const leaveObj = {
      id: Date.now(),
      student_id: String(req.user.id),
      enrollment_no: cleanEnroll,
      student_enrollment: cleanEnroll,
      email: req.user.email || null,
      roll_no: req.user.roll_no || req.user.roll || '',
      student_name: req.user.name || 'Student',
      course: req.user.course || 'BCA',
      semester: String(req.user.semester || '1'),
      division: req.user.division || 'A',
      type: type || 'Personal Leave',
      recipient_id: String(recipient_id || 'ADMIN'),
      recipient_name: cleanRecName,
      from_date: from,
      to_date: to,
      reason: String(reason).trim(),
      attachment: attachment || null,
      file_name: file_name || null,
      file_type: fileType,
      file_size: fileSize,
      status: 'Pending',
      admin_remarks: '',
      reviewed_by: '',
      date_submitted: today,
      created_at: new Date().toISOString()
    };

    let savedLeave = leaveObj;
    const { data, error } = await supabase.from('leaves').insert([leaveObj]).select().single();

    if (!error && data) {
      savedLeave = data;
    } else if (error && !isMissingLeavesTableError(error)) {
      console.error('Supabase leaves insert error:', error.message || error);
      // Fallback insert omitting newer optional columns in case of partial schema
      const minimalObj = { ...leaveObj };
      delete minimalObj.student_enrollment;
      delete minimalObj.email;
      delete minimalObj.file_type;
      delete minimalObj.file_size;
      delete minimalObj.reviewed_by;

      const retry = await supabase.from('leaves').insert([minimalObj]).select().single();
      if (!retry.error && retry.data) {
        savedLeave = retry.data;
      } else if (retry.error) {
        return res.status(400).json({ error: retry.error.message || 'Failed to store leave application in database.' });
      }
    }

    // Mirror locally as backup
    const localLeaves = getLocalLeaves();
    localLeaves.unshift(savedLeave);
    saveLocalLeaves(localLeaves);

    return res.status(201).json({
      message: 'Leave application submitted successfully for review!',
      leave: savedLeave
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
    const studentIdStr = String(req.user.id);
    const { data, error } = await supabase
      .from('leaves')
      .select('*')
      .eq('student_id', studentIdStr)
      .order('id', { ascending: false });

    if (!error) {
      return res.json(data || []);
    }

    if (!isMissingLeavesTableError(error)) {
      console.warn('Supabase fetch student leaves error:', error.message || error);
    }

    const localLeaves = getLocalLeaves().filter(l => String(l.student_id) === studentIdStr);
    return res.json(mergeLeaveLists([], localLeaves));
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
    let finalLeaves = [];
    const { data, error } = await supabase
      .from('leaves')
      .select('*')
      .order('id', { ascending: false });

    if (!error) {
      finalLeaves = data || [];
      saveLocalLeaves(finalLeaves);
    } else {
      if (!isMissingLeavesTableError(error)) {
        console.warn('Supabase fetch all leaves error:', error.message || error);
      }
      finalLeaves = mergeLeaveLists([], getLocalLeaves());
    }

    if (req.user.role === 'faculty') {
      const facultyId = String(req.user.id || '').trim();
      const facultyName = cleanRecipientLabel(req.user.name || '').toLowerCase();

      finalLeaves = finalLeaves.filter(l => {
        const recId = String(l.recipient_id || '').trim();
        const recName = cleanRecipientLabel(l.recipient_name || '').toLowerCase();

        if (!recId || recId === 'ALL') return true;
        if (recId === facultyId) return true;
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
    const updatePayload = {
      status,
      admin_remarks: admin_remarks || '',
      reviewed_by: req.user.name || 'Admin',
      reviewed_at: new Date().toISOString()
    };

    let updatedRecord = null;
    const { data, error } = await supabase
      .from('leaves')
      .update(updatePayload)
      .eq('id', leaveId)
      .select()
      .single();

    if (!error && data) {
      updatedRecord = data;
    } else if (error && !isMissingLeavesTableError(error)) {
      console.warn('Supabase update leave status error:', error.message || error);
    }

    const localLeaves = getLocalLeaves();
    const updatedLocalLeaves = localLeaves.map(l => {
      if (String(l.id) === String(id)) {
        const merged = { ...l, ...updatePayload };
        if (!updatedRecord) updatedRecord = merged;
        return merged;
      }
      return l;
    });
    saveLocalLeaves(updatedLocalLeaves);

    return res.json({
      message: `Leave application status updated to ${status}`,
      leave: updatedRecord || { id: leaveId, ...updatePayload }
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
    const leaveId = isNaN(id) ? id : Number(id);
    const { error } = await supabase.from('leaves').delete().eq('id', leaveId);
    if (error && !isMissingLeavesTableError(error)) {
      console.warn('Supabase delete leave error:', error.message || error);
    }

    const localLeaves = getLocalLeaves();
    const updatedLocalLeaves = localLeaves.filter(l => String(l.id) !== String(id));
    saveLocalLeaves(updatedLocalLeaves);

    return res.json({ message: 'Leave application deleted successfully.' });
  } catch (err) {
    console.error('Error deleting leave application:', err);
    return res.status(500).json({ error: 'Failed to delete leave application.' });
  }
});

module.exports = router;
