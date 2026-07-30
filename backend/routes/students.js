const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbQuery } = require('../db');
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
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const students = await dbQuery.all('SELECT id, enrollment_no, name, course, semester, mobile, username, plain_password FROM students');
    res.json(students);
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
    const existing = await dbQuery.get(
      'SELECT id FROM students WHERE enrollment_no = ? OR username = ?',
      [enrollment_no, username]
    );

    if (existing) {
      return res.status(400).json({ error: 'Student with this enrollment number already exists' });
    }

    const result = await dbQuery.run(
      `INSERT INTO students (enrollment_no, name, course, semester, mobile, username, password, plain_password) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [enrollment_no, name, course, semester, mobile, username, hashedPassword, rawPassword]
    );

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
    const student = await dbQuery.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let query = `UPDATE students SET name = ?, course = ?, semester = ?, mobile = ?`;
    let params = [name, course, semester, mobile];
    let newPassword = null;

    if (password && password.trim() !== '') {
      newPassword = password.trim();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      query += `, password = ?, plain_password = ?`;
      params.push(hashedPassword, newPassword);
    } else if (resetPassword) {
      newPassword = generatePassword();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      query += `, password = ?, plain_password = ?`;
      params.push(hashedPassword, newPassword);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await dbQuery.run(query, params);

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
      const existing = await dbQuery.get('SELECT id FROM students WHERE enrollment_no = ?', [enrollment_no]);
      if (existing) {
        results.errors.push(`Row ${i + 1}: Enrollment No ${enrollment_no} already exists.`);
        continue;
      }

      const rawPassword = (password && password.toString().trim() !== '') ? password.toString().trim() : generatePassword();
      const hashedPassword = bcrypt.hashSync(rawPassword, 10);

      await dbQuery.run(
        `INSERT INTO students (enrollment_no, name, course, semester, mobile, username, password, plain_password) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          enrollment_no.toString().trim(),
          name.trim(),
          course.trim(),
          semester.toString().trim(),
          mobile.toString().trim(),
          username,
          hashedPassword,
          rawPassword
        ]
      );

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
    const student = await dbQuery.get('SELECT id FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Optional: Delete this student's attendance records first to avoid orphan rows
    await dbQuery.run('DELETE FROM attendance WHERE student_id = ?', [id]);
    await dbQuery.run('DELETE FROM students WHERE id = ?', [id]);

    res.json({ message: 'Student and their attendance history deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

module.exports = router;
