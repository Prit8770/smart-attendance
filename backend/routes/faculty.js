const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

// Helper to generate a random 8-character alphanumeric password
function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Admin only middleware check
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

const fs = require('fs');
const path = require('path');

const subjectsFilePath = path.join(__dirname, '../data/faculty_subjects.json');

const ensureSubjectsFile = () => {
  const dir = path.dirname(subjectsFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(subjectsFilePath)) fs.writeFileSync(subjectsFilePath, JSON.stringify({}), 'utf8');
};

const loadFacultySubjectsMap = () => {
  ensureSubjectsFile();
  try {
    const raw = fs.readFileSync(subjectsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
};

const saveFacultySubjectsMap = (map) => {
  ensureSubjectsFile();
  fs.writeFileSync(subjectsFilePath, JSON.stringify(map, null, 2), 'utf8');
};

// GET all faculty
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { data: faculty, error } = await supabase.from('faculty').select('*');
    if (error) throw error;

    const subjectsMap = loadFacultySubjectsMap();

    const formatted = (faculty || []).map(f => {
      let deptName = f.department || '';
      let embeddedSubjects = [];

      if (deptName.includes('||SUB:')) {
        const parts = deptName.split('||SUB:');
        deptName = parts[0].trim();
        try {
          const jsonStr = parts[1].split('||')[0];
          embeddedSubjects = JSON.parse(jsonStr);
        } catch (e) {}
      }

      let fileSubjects = subjectsMap[f.id] || subjectsMap[f.employee_no] || subjectsMap[String(f.id)] || subjectsMap[String(f.employee_no)] || [];
      let finalSubjects = (embeddedSubjects && embeddedSubjects.length > 0) 
        ? embeddedSubjects 
        : (fileSubjects && fileSubjects.length > 0) 
          ? fileSubjects 
          : [];

      return {
        ...f,
        department: deptName || 'BCA',
        subjects: Array.isArray(finalSubjects) ? finalSubjects : []
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching faculty:', err);
    res.status(500).json({ error: 'Failed to fetch faculty members' });
  }
});

// POST add new faculty
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { employee_no, name, department, mobile, subjects, password: customPassword } = req.body;

  if (!employee_no || !name || !department || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Clean subjects list with optional shortName support
  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && s.subjectName && String(s.subjectName).trim() !== '')
        .map(s => ({
          subjectName: String(s.subjectName).trim(),
          shortName: s.shortName ? String(s.shortName).trim() : '',
          semester: String(s.semester || '1').trim()
        }))
    : [];

  // Generate username and password
  const username = employee_no.toLowerCase().trim();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : generatePassword();
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  // Encode subjects inside department string as DB fallback
  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanSubjects.length > 0 
    ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
    : cleanDeptName;

  try {
    // Check if employee number or username already exists
    const { data: existing } = await supabase.from('faculty')
      .select('id')
      .or(`employee_no.eq.${employee_no},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Faculty with this Employee ID or username already exists' });
    }

    let insertObj = {
      employee_no, name, department: encodedDepartment, mobile, username, password: hashedPassword, plain_password: rawPassword
    };

    const { data: result, error } = await supabase.from('faculty').insert([insertObj]).select().single();
    if (error) throw error;

    // Save subjects in persistent map
    const map = loadFacultySubjectsMap();
    if (result.id) map[result.id] = cleanSubjects;
    if (result.id) map[String(result.id)] = cleanSubjects;
    map[employee_no] = cleanSubjects;
    map[String(employee_no)] = cleanSubjects;
    saveFacultySubjectsMap(map);

    res.status(201).json({
      message: 'Faculty added successfully',
      faculty: {
        id: result.id,
        employee_no,
        name,
        department: cleanDeptName,
        mobile,
        username,
        subjects: cleanSubjects,
        plain_password: rawPassword,
        generatedPassword: rawPassword
      }
    });
  } catch (err) {
    console.error('Error adding faculty:', err);
    res.status(500).json({ error: 'Failed to add faculty member' });
  }
});

// PUT edit faculty
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, department, mobile, subjects, resetPassword, password } = req.body;

  if (!name || !department || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && s.subjectName && String(s.subjectName).trim() !== '')
        .map(s => ({
          subjectName: String(s.subjectName).trim(),
          shortName: s.shortName ? String(s.shortName).trim() : '',
          semester: String(s.semester || '1').trim()
        }))
    : [];

  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanSubjects.length > 0 
    ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
    : cleanDeptName;

  try {
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    let updateObj = { name, department: encodedDepartment, mobile };
    let newPassword = null;

    if (password && password.trim() !== '') {
      newPassword = password.trim();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    } else if (resetPassword) {
      newPassword = generatePassword();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    }

    const { error } = await supabase.from('faculty').update(updateObj).eq('id', id);
    if (error) throw error;

    // Save subjects in persistent map
    const map = loadFacultySubjectsMap();
    map[id] = cleanSubjects;
    map[String(id)] = cleanSubjects;
    if (faculty.employee_no) {
      map[faculty.employee_no] = cleanSubjects;
      map[String(faculty.employee_no)] = cleanSubjects;
    }
    saveFacultySubjectsMap(map);

    res.json({
      message: 'Faculty updated successfully',
      faculty: {
        id,
        name,
        department: cleanDeptName,
        mobile,
        subjects: cleanSubjects,
        plain_password: newPassword || faculty.plain_password,
        generatedPassword: newPassword
      }
    });
  } catch (err) {
    console.error('Error updating faculty:', err);
    res.status(500).json({ error: 'Failed to update faculty' });
  }
});

// POST bulk delete faculty members
router.post('/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
  const { facultyIds } = req.body;

  if (!facultyIds || !Array.isArray(facultyIds) || facultyIds.length === 0) {
    return res.status(400).json({ error: 'No faculty IDs provided for deletion.' });
  }

  try {
    for (const id of facultyIds) {
      const { data: qrSessions } = await supabase.from('qr_sessions').select('id').eq('created_by_faculty_id', id);
      const qrIds = (qrSessions || []).map(q => q.id);

      const { data: otps } = await supabase.from('otp').select('id').eq('generated_by', id);
      const otpIds = (otps || []).map(o => o.id);

      if (qrIds.length > 0) {
        await supabase.from('attendance').delete().in('qr_session_id', qrIds);
      }
      if (otpIds.length > 0) {
        await supabase.from('attendance').delete().in('otp_id', otpIds);
      }

      await supabase.from('qr_sessions').delete().eq('created_by_faculty_id', id);
      await supabase.from('otp').delete().eq('generated_by', id);
      await supabase.from('faculty').delete().eq('id', id);
    }

    res.json({ success: true, message: `Successfully deleted ${facultyIds.length} faculty member(s).` });
  } catch (err) {
    console.error('Bulk delete faculty error:', err);
    res.status(500).json({ error: 'Failed to delete faculty members.' });
  }
});

// DELETE faculty
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: faculty } = await supabase.from('faculty').select('id, name').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    // 1. Get all QR session IDs created by this faculty
    const { data: qrSessions } = await supabase.from('qr_sessions').select('id').eq('created_by_faculty_id', id);
    const qrIds = (qrSessions || []).map(q => q.id);

    // 2. Get all OTP session IDs generated by this faculty
    const { data: otps } = await supabase.from('otp').select('id').eq('generated_by', id);
    const otpIds = (otps || []).map(o => o.id);

    // 3. Delete linked attendance records for these QR sessions and OTPs
    if (qrIds.length > 0) {
      await supabase.from('attendance').delete().in('qr_session_id', qrIds);
    }
    if (otpIds.length > 0) {
      await supabase.from('attendance').delete().in('otp_id', otpIds);
    }

    // 4. Delete QR sessions created by this faculty
    await supabase.from('qr_sessions').delete().eq('created_by_faculty_id', id);

    // 5. Delete OTP sessions generated by this faculty
    await supabase.from('otp').delete().eq('generated_by', id);

    // 6. Delete faculty member record
    const { error } = await supabase.from('faculty').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true, message: 'Faculty member and all associated sessions deleted successfully' });
  } catch (err) {
    console.error('Error deleting faculty:', err);
    res.status(500).json({ error: err.message || 'Failed to delete faculty member' });
  }
});

module.exports = router;
