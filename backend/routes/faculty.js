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

// GET all faculty
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const faculty = await dbQuery.all('SELECT id, employee_no, name, department, mobile, username, plain_password FROM faculty');
    res.json(faculty);
  } catch (err) {
    console.error('Error fetching faculty:', err);
    res.status(500).json({ error: 'Failed to fetch faculty members' });
  }
});

// POST add new faculty
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { employee_no, name, department, mobile, password: customPassword } = req.body;

  if (!employee_no || !name || !department || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Generate username and password
  const username = employee_no.toLowerCase().trim();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : generatePassword();
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  try {
    // Check if employee number or username already exists
    const existing = await dbQuery.get(
      'SELECT id FROM faculty WHERE employee_no = ? OR username = ?',
      [employee_no, username]
    );

    if (existing) {
      return res.status(400).json({ error: 'Faculty with this Employee ID already exists' });
    }

    const result = await dbQuery.run(
      `INSERT INTO faculty (employee_no, name, department, mobile, username, password, plain_password) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employee_no, name, department, mobile, username, hashedPassword, rawPassword]
    );

    res.status(201).json({
      message: 'Faculty added successfully',
      faculty: {
        id: result.id,
        employee_no,
        name,
        department,
        mobile,
        username,
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
  const { name, department, mobile, resetPassword, password } = req.body;

  if (!name || !department || !mobile) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const faculty = await dbQuery.get('SELECT * FROM faculty WHERE id = ?', [id]);
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    let query = `UPDATE faculty SET name = ?, department = ?, mobile = ?`;
    let params = [name, department, mobile];
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
      message: 'Faculty updated successfully',
      faculty: {
        id,
        name,
        department,
        mobile,
        plain_password: newPassword || faculty.plain_password,
        generatedPassword: newPassword
      }
    });
  } catch (err) {
    console.error('Error updating faculty:', err);
    res.status(500).json({ error: 'Failed to update faculty' });
  }
});

// DELETE faculty
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const faculty = await dbQuery.get('SELECT id FROM faculty WHERE id = ?', [id]);
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    await dbQuery.run('DELETE FROM faculty WHERE id = ?', [id]);

    res.json({ message: 'Faculty member deleted successfully' });
  } catch (err) {
    console.error('Error deleting faculty:', err);
    res.status(500).json({ error: 'Failed to delete faculty member' });
  }
});

module.exports = router;
