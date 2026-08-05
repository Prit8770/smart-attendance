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

// GET all students
router.get('/', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const { data: students, error } = await supabase.from('students').select('*');
    if (error) throw error;
    const safeStudents = (students || []).map(({ password, ...rest }) => rest);
    safeStudents.sort((a, b) => {
      const semA = parseInt(a.semester, 10) || 0;
      const semB = parseInt(b.semester, 10) || 0;
      if (semA !== semB) return semA - semB;

      const divA = (a.division || '').trim().toUpperCase();
      const divB = (b.division || '').trim().toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rollA = String(a.roll_no || '').trim();
      const rollB = String(b.roll_no || '').trim();
      if (!rollA && !rollB) return String(a.name || '').localeCompare(String(b.name || ''));
      if (!rollA) return 1;
      if (!rollB) return -1;
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });
    res.json(safeStudents);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// POST add new student
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { enrollment_no, roll_no, division, name, course, semester, mobile, password: customPassword } = req.body;

  if (!enrollment_no || !name || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^\d{10}$/.test(String(enrollment_no).trim())) {
    return res.status(400).json({ error: 'Please enter valid enrollment number' });
  }

  if (!/^\d{10}$/.test(String(mobile).trim())) {
    return res.status(400).json({ error: 'Please enter valid mobile number' });
  }

  // Generate username and password
  const username = enrollment_no.toLowerCase().trim();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : generatePassword();
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  try {
    // Check if enrollment number or username already exists
    const { data: existing } = await supabase.from('students')
      .select('id')
      .or(`enrollment_no.eq.${enrollment_no},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Student with this enrollment number or username already exists' });
    }

    const newStudentObj = {
      enrollment_no, name, course, semester, mobile, username, password: hashedPassword, plain_password: rawPassword
    };
    if (roll_no && String(roll_no).trim() !== '') newStudentObj.roll_no = String(roll_no).trim();
    if (division && String(division).trim() !== '') newStudentObj.division = String(division).trim();

    const { data: result, error } = await supabase.from('students').insert([newStudentObj]).select().single();

    if (error) throw error;

    res.status(201).json({
      message: 'Student added successfully',
      student: {
        id: result.id,
        enrollment_no,
        name,
        course,
        semester,
        mobile,
        username,
        plain_password: rawPassword,
        generatedPassword: rawPassword // Backward compatibility
      }
    });
  } catch (err) {
    console.error('Error adding student:', err);
    if (err.code === 'PGRST204' || (err.message && err.message.includes('schema cache'))) {
      return res.status(400).json({
        error: "Supabase DB Error: 'division' (ya 'roll_no') column database table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE students ADD COLUMN IF NOT EXISTS roll_no TEXT;\nALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;"
      });
    }
    res.status(500).json({ error: err.message || 'Failed to add student' });
  }
});

// PUT edit student
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { roll_no, division, name, course, semester, mobile, resetPassword, password } = req.body;

  if (!name || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^\d{10}$/.test(String(mobile).trim())) {
    return res.status(400).json({ error: 'Please enter valid mobile number' });
  }

  try {
    const { data: student } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let updateObj = { name, course, semester, mobile };
    if (student.hasOwnProperty('roll_no') || (roll_no && String(roll_no).trim() !== '')) {
      updateObj.roll_no = (roll_no && String(roll_no).trim() !== '') ? String(roll_no).trim() : null;
    }
    if (student.hasOwnProperty('division') || (division && String(division).trim() !== '')) {
      updateObj.division = (division && String(division).trim() !== '') ? String(division).trim() : null;
    }
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

    const { error } = await supabase.from('students').update(updateObj).eq('id', id);
    if (error) throw error;

    res.json({
      message: 'Student updated successfully',
      student: {
        id,
        name,
        course,
        semester,
        mobile,
        plain_password: newPassword || student.plain_password,
        generatedPassword: newPassword // Will be null if not reset/modified
      }
    });
  } catch (err) {
    console.error('Error updating student:', err);
    if (err.code === 'PGRST204' || (err.message && err.message.includes('schema cache'))) {
      return res.status(400).json({
        error: "Supabase DB Error: 'division' (ya 'roll_no') column database table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE students ADD COLUMN IF NOT EXISTS roll_no TEXT;\nALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;"
      });
    }
    res.status(500).json({ error: err.message || 'Failed to update student' });
  }
});

// POST import batch of students
router.post('/import', authenticateJWT, requireAdmin, async (req, res) => {
  const { students: importedList } = req.body;

  if (!importedList || !Array.isArray(importedList)) {
    return res.status(400).json({ error: 'Invalid data format. Array expected.' });
  }

  const results = {
    successCount: 0,
    errors: []
  };

  for (let i = 0; i < importedList.length; i++) {
    const student = importedList[i];
    const { enrollment_no, roll_no, division, name, course, semester, mobile, password } = student;

    if (!enrollment_no || !name || !course || !semester || !mobile) {
      results.errors.push(`Row ${i + 1}: Missing required fields.`);
      continue;
    }

    if (!/^\d{10}$/.test(String(enrollment_no).trim())) {
      results.errors.push(`Row ${i + 1}: Please enter valid enrollment number (Must be 10 digits).`);
      continue;
    }

    const username = enrollment_no.toString().toLowerCase().trim();

    try {
      const { data: existing } = await supabase.from('students').select('id').eq('enrollment_no', enrollment_no.toString().trim()).maybeSingle();
      if (existing) {
        // Update existing student record if roll_no, division or other details are provided
        const updateObj = {
          name: name.trim(),
          course: course.trim(),
          semester: semester.toString().trim(),
          mobile: mobile.toString().trim()
        };
        if (roll_no && String(roll_no).trim() !== '') updateObj.roll_no = String(roll_no).trim();
        if (division && String(division).trim() !== '') updateObj.division = String(division).trim();
        if (password && String(password).toString().trim() !== '') {
          const rawPassword = String(password).trim();
          updateObj.password = bcrypt.hashSync(rawPassword, 10);
          updateObj.plain_password = rawPassword;
        }

        const { error: updateErr } = await supabase.from('students').update(updateObj).eq('id', existing.id);
        if (updateErr) throw updateErr;

        results.successCount++;
        continue;
      }

      const rawPassword = (password && password.toString().trim() !== '') ? password.toString().trim() : generatePassword();
      const hashedPassword = bcrypt.hashSync(rawPassword, 10);

      const importObj = {
        enrollment_no: enrollment_no.toString().trim(),
        name: name.trim(),
        course: course.trim(),
        semester: semester.toString().trim(),
        mobile: mobile.toString().trim(),
        username,
        password: hashedPassword,
        plain_password: rawPassword
      };
      if (roll_no && String(roll_no).trim() !== '') importObj.roll_no = String(roll_no).trim();
      if (division && String(division).trim() !== '') importObj.division = String(division).trim();

      const { error } = await supabase.from('students').insert([importObj]);

      if (error) throw error;

      results.successCount++;
    } catch (err) {
      console.error('Import row error:', err);
      results.errors.push(`Row ${i + 1}: DB error - ${err.message}`);
    }
  }

  res.json(results);
});

// DELETE student
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: student } = await supabase.from('students').select('id').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Optional: Delete this student's attendance records first to avoid orphan rows
    await supabase.from('attendance').delete().eq('student_id', id);
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Student and their attendance history deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

module.exports = router;
