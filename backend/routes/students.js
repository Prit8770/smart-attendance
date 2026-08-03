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
    const { data: students, error } = await supabase.from('students').select('id, enrollment_no, name, course, semester, mobile, username, plain_password');
    if (error) throw error;
    res.json(students || []);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// POST add new student
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { enrollment_no, name, course, semester, mobile, password: customPassword } = req.body;

  if (!enrollment_no || !name || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
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

    const { data: result, error } = await supabase.from('students').insert([{
      enrollment_no, name, course, semester, mobile, username, password: hashedPassword, plain_password: rawPassword
    }]).select().single();
    
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
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// PUT edit student
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, course, semester, mobile, resetPassword, password } = req.body;

  if (!name || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const { data: student } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let updateObj = { name, course, semester, mobile };
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
    res.status(500).json({ error: 'Failed to update student' });
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
    const { enrollment_no, name, course, semester, mobile, password } = student;

    if (!enrollment_no || !name || !course || !semester || !mobile) {
      results.errors.push(`Row ${i + 1}: Missing required fields.`);
      continue;
    }

    const username = enrollment_no.toString().toLowerCase().trim();

    try {
      const { data: existing } = await supabase.from('students').select('id').eq('enrollment_no', enrollment_no).maybeSingle();
      if (existing) {
        results.errors.push(`Row ${i + 1}: Enrollment No ${enrollment_no} already exists.`);
        continue;
      }

      const rawPassword = (password && password.toString().trim() !== '') ? password.toString().trim() : generatePassword();
      const hashedPassword = bcrypt.hashSync(rawPassword, 10);

      const { error } = await supabase.from('students').insert([{
        enrollment_no: enrollment_no.toString().trim(),
        name: name.trim(),
        course: course.trim(),
        semester: semester.toString().trim(),
        mobile: mobile.toString().trim(),
        username,
        password: hashedPassword,
        plain_password: rawPassword
      }]);
      
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
