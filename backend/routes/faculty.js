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

// GET all faculty
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { data: faculty, error } = await supabase.from('faculty').select('id, employee_no, name, department, mobile, username, plain_password');
    if (error) throw error;
    res.json(faculty || []);
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
    const { data: existing } = await supabase.from('faculty')
      .select('id')
      .or(`employee_no.eq.${employee_no},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Faculty with this Employee ID or username already exists' });
    }

    const { data: result, error } = await supabase.from('faculty').insert([{
      employee_no, name, department, mobile, username, password: hashedPassword, plain_password: rawPassword
    }]).select().single();
    
    if (error) throw error;

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
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    let updateObj = { name, department, mobile };
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
    const { data: faculty } = await supabase.from('faculty').select('id').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    const { error } = await supabase.from('faculty').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Faculty member deleted successfully' });
  } catch (err) {
    console.error('Error deleting faculty:', err);
    res.status(500).json({ error: 'Failed to delete faculty member' });
  }
});

module.exports = router;
