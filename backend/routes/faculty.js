const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

// Helper to generate a strong password meeting policy (min 8 chars, 1 uppercase, 1 digit, 1 special character)
function generatePassword() {
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specials = '@#$%&*!';

  let password = '';
  password += uppers.charAt(Math.floor(Math.random() * uppers.length));
  password += lowers.charAt(Math.floor(Math.random() * lowers.length));
  password += digits.charAt(Math.floor(Math.random() * digits.length));
  password += specials.charAt(Math.floor(Math.random() * specials.length));

  const all = uppers + lowers + digits + specials;
  for (let i = 4; i < 9; i++) {
    password += all.charAt(Math.floor(Math.random() * all.length));
  }
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

// Strong Password Validation Helper
function validateStrongPassword(pass) {
  if (!pass || String(pass).trim() === '') return { isValid: true };
  const trimmed = String(pass).trim();
  if (trimmed.length < 8) return { isValid: false, error: 'Password must be at least 8 characters long.' };
  if (!/[A-Z]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 uppercase letter (A-Z).' };
  if (!/[0-9]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 numeric digit (0-9).' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 special character (e.g. @, #, $, !).' };
  return { isValid: true };
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

      const fileSubjects = subjectsMap[f.id] || subjectsMap[f.employee_no] || subjectsMap[String(f.id)] || subjectsMap[String(f.employee_no)] || [];
      const subMap = new Map();
      if (Array.isArray(fileSubjects)) {
        fileSubjects.forEach(s => {
          if (s && s.subjectName) subMap.set(String(s.subjectName).trim().toLowerCase(), s);
        });
      }
      if (Array.isArray(embeddedSubjects)) {
        embeddedSubjects.forEach(s => {
          if (s && s.subjectName) subMap.set(String(s.subjectName).trim().toLowerCase(), s);
        });
      }
      const finalSubjects = Array.from(subMap.values());

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
  const { name, email, department, mobile, subjects, password: customPassword, employee_no: inputEmpNo, employeeNo } = req.body;

  if (!name || !email || !department || !mobile) {
    return res.status(400).json({ error: 'Name, Email ID, Department, and Mobile are required' });
  }

  const employee_no = String(inputEmpNo || employeeNo || `EMP${String(Date.now()).slice(-6)}${Math.floor(100 + Math.random() * 900)}`).trim();

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

  if (customPassword && customPassword.trim() !== '') {
    const passCheck = validateStrongPassword(customPassword);
    if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
  }

  const cleanEmail = String(email).trim();
  const username = cleanEmail.toLowerCase();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : generatePassword();
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  // Encode subjects inside department string as DB fallback
  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanSubjects.length > 0 
    ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
    : cleanDeptName;

  try {
    // Check if email or username already exists
    const { data: existing } = await supabase.from('faculty')
      .select('id')
      .or(`email.eq.${cleanEmail},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Faculty with this Email ID already exists' });
    }

    let insertObj = {
      name,
      department: encodedDepartment,
      mobile,
      username,
      password: hashedPassword,
      plain_password: rawPassword,
      email: cleanEmail
    };

    let { data: result, error } = await supabase.from('faculty').insert([insertObj]).select().single();

    if (error && (error.message?.includes('email') || error.code === '42703' || error.message?.includes('column'))) {
      console.warn('Supabase faculty table missing column, retrying insert without missing fields:', error.message);
      if (error.message?.includes('email')) delete insertObj.email;
      const retry = await supabase.from('faculty').insert([insertObj]).select().single();
      result = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Supabase insert faculty error:', error);
      return res.status(400).json({ error: error.message || 'Failed to add faculty member' });
    }

    // Save subjects in persistent map
    const map = loadFacultySubjectsMap();
    if (result && result.id) map[result.id] = cleanSubjects;
    if (result && result.id) map[String(result.id)] = cleanSubjects;
    if (employee_no) {
      map[employee_no] = cleanSubjects;
      map[String(employee_no)] = cleanSubjects;
    }
    saveFacultySubjectsMap(map);

    res.status(201).json({
      message: 'Faculty added successfully',
      faculty: {
        id: result ? result.id : Date.now(),
        name,
        email: cleanEmail,
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
    res.status(500).json({ error: err.message || 'Failed to add faculty member' });
  }
});

// PUT update logged in faculty's own subjects
router.put('/my-subjects', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'faculty' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Faculty access only.' });
  }

  const { subjects } = req.body;
  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
        .map(s => ({
          subjectName: String(s.subjectName || s.name).trim(),
          shortName: s.shortName ? String(s.shortName).trim() : '',
          code: s.code || s.subjectCode ? String(s.code || s.subjectCode).trim() : '',
          semester: String(s.semester || '1').trim(),
          type: s.type || s.subjectType ? String(s.type || s.subjectType).trim() : 'Theory'
        }))
    : [];

  try {
    const facultyId = req.user.id;
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', facultyId).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member profile not found.' });
    }

    const cleanDeptName = String(faculty.department || 'BCA').split('||SUB:')[0].trim();
    const encodedDepartment = cleanSubjects.length > 0 
      ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
      : cleanDeptName;

    await supabase.from('faculty').update({ department: encodedDepartment }).eq('id', facultyId);

    // Save in persistent JSON map
    const map = loadFacultySubjectsMap();
    map[facultyId] = cleanSubjects;
    map[String(facultyId)] = cleanSubjects;
    if (faculty.employee_no) {
      map[faculty.employee_no] = cleanSubjects;
      map[String(faculty.employee_no)] = cleanSubjects;
    }
    saveFacultySubjectsMap(map);

    res.json({
      success: true,
      message: 'Subjects updated successfully',
      subjects: cleanSubjects
    });
  } catch (err) {
    console.error('Error updating faculty subjects:', err);
    res.status(500).json({ error: 'Failed to update subjects' });
  }
});

// PUT edit faculty
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, department, mobile, subjects, resetPassword, password } = req.body;

  if (!name || !email || !department || !mobile) {
    return res.status(400).json({ error: 'Name, Email ID, Department, and Mobile are required' });
  }

  const map = loadFacultySubjectsMap();
  const existingSubs = map[id] || map[String(id)] || [];

  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
        .map(s => ({
          subjectName: String(s.subjectName || s.name).trim(),
          shortName: s.shortName ? String(s.shortName).trim() : '',
          code: s.code || s.subjectCode ? String(s.code || s.subjectCode).trim() : '',
          semester: String(s.semester || '1').trim(),
          type: s.type || s.subjectType ? String(s.type || s.subjectType).trim() : 'Theory'
        }))
    : (subjects === undefined ? existingSubs : []);

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
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      updateObj.email = String(email).trim();
    }
    let newPassword = null;

    if (password && password.trim() !== '') {
      newPassword = password.trim();
      const passCheck = validateStrongPassword(newPassword);
      if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    } else if (resetPassword) {
      newPassword = generatePassword();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    }

    let { error } = await supabase.from('faculty').update(updateObj).eq('id', id);

    if (error && (error.message?.includes('email') || error.code === '42703' || error.message?.includes('column'))) {
      console.warn('Supabase faculty table missing email column on update, retrying without email:', error.message);
      delete updateObj.email;
      const retry = await supabase.from('faculty').update(updateObj).eq('id', id);
      error = retry.error;
    }

    if (error) {
      console.error('Supabase update faculty error:', error);
      return res.status(400).json({ error: error.message || 'Failed to update faculty member' });
    }

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

// DELETE single faculty member (FK-Safe execution)
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Faculty ID is required.' });
  }

  try {
    // 1. Fetch all QR session IDs created by this faculty
    const { data: qrSessions } = await supabase
      .from('qr_sessions')
      .select('id')
      .eq('created_by_faculty_id', id);
    const qrIds = (qrSessions || []).map(q => q.id);

    // 2. Fetch all OTP session IDs generated by this faculty
    const { data: otps } = await supabase
      .from('otp')
      .select('id')
      .eq('generated_by', id);
    const otpIds = (otps || []).map(o => o.id);

    // 3. Delete attendance child rows linked to these QR or OTP sessions FIRST
    if (qrIds.length > 0) {
      await supabase.from('attendance').delete().in('qr_session_id', qrIds);
    }
    if (otpIds.length > 0) {
      await supabase.from('attendance').delete().in('otp_id', otpIds);
    }

    // 4. Delete QR & OTP session parent rows
    await supabase.from('qr_sessions').delete().eq('created_by_faculty_id', id);
    await supabase.from('otp').delete().eq('generated_by', id);

    // 5. Delete faculty row from faculty table
    const { error: deleteErr } = await supabase.from('faculty').delete().eq('id', id);

    if (deleteErr) {
      console.error('Error deleting faculty row:', deleteErr);
      return res.status(400).json({ error: deleteErr.message || 'Failed to delete faculty member.' });
    }

    // 6. Clean up subjects mapping in local JSON file if exists
    try {
      const subjectsMap = loadFacultySubjectsMap();
      if (subjectsMap[id]) {
        delete subjectsMap[id];
        saveFacultySubjectsMap(subjectsMap);
      }
    } catch (e) {
      console.error('Error updating subjects map after deletion:', e);
    }

    res.json({ success: true, message: 'Faculty member deleted successfully.' });
  } catch (err) {
    console.error('Error in DELETE /api/faculty/:id:', err);
    res.status(500).json({ error: err.message || 'Failed to delete faculty member.' });
  }
});
// POST import batch of faculty members
router.post('/import', authenticateJWT, requireAdmin, async (req, res) => {
  const { faculty: importedList } = req.body;

  if (!importedList || !Array.isArray(importedList) || importedList.length === 0) {
    return res.status(400).json({ error: 'No faculty records provided for import.' });
  }

  try {
    let successCount = 0;
    const errors = [];

    const subjectsMap = loadFacultySubjectsMap();

    for (const fac of importedList) {
      if (!fac.name && !fac.email) continue;

      const name = String(fac.name || 'Faculty').trim();
      const email = fac.email ? String(fac.email).trim() : `faculty_${Date.now()}@college.edu`;
      const department = fac.department ? String(fac.department).trim() : 'BCA';
      const mobile = fac.mobile ? String(fac.mobile).trim() : '0000000000';
      const rawPassword = fac.password ? String(fac.password).trim() : generatePassword();

      const valRes = validateStrongPassword(rawPassword);
      const plain_password = valRes.isValid ? rawPassword : generatePassword();

      const hashedPassword = await bcrypt.hash(plain_password, 10);

      let subjectsToSave = [];
      if (Array.isArray(fac.subjects)) {
        subjectsToSave = fac.subjects;
      }

      const encodedDept = `${department}||SUB:${JSON.stringify(subjectsToSave)}||`;

      const employee_no = String(fac.employee_no || fac.employeeNo || `EMP${String(Date.now()).slice(-6)}${Math.floor(100 + Math.random() * 900)}`).trim();

      const { data: existing } = await supabase.from('faculty').select('id').eq('email', email).maybeSingle();

      const payload = {
        name,
        email,
        department: encodedDept,
        mobile,
        username: email,
        password: hashedPassword,
        plain_password
      };

      if (existing) {
        await supabase.from('faculty').update(payload).eq('id', existing.id);
        subjectsMap[existing.id] = subjectsToSave;
      } else {
        const { data: newFac, error: insErr } = await supabase.from('faculty').insert([payload]).select().single();

        if (insErr) {
          errors.push(`Email ${email}: ${insErr.message}`);
          continue;
        }

        if (newFac) {
          subjectsMap[newFac.id] = subjectsToSave;
        }
      }

      successCount++;
    }

    saveFacultySubjectsMap(subjectsMap);

    res.json({ success: true, successCount, errors });
  } catch (err) {
    console.error('Faculty bulk import error:', err);
    res.status(500).json({ error: err.message || 'Failed to import faculty data.' });
  }
});

module.exports = router;
