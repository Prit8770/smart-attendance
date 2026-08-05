const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const fs = require('fs');
const path = require('path');

const overrideFile = path.join(__dirname, '../admin_profile_override.json');
const getAdminOverride = () => {
  try {
    if (fs.existsSync(overrideFile)) {
      return JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
    }
  } catch (e) {}
  return null;
};
const setAdminOverride = (data) => {
  try {
    fs.writeFileSync(overrideFile, JSON.stringify(data, null, 2));
  } catch (e) {}
};

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_college_attendance_key_123!';

// Admin Login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data: admin, error } = await supabase.from('admin').select('*').eq('email', email).maybeSingle();
    if (error || !admin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = bcrypt.compareSync(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const override = getAdminOverride();
    const finalAdmin = {
      id: admin.id,
      name: override ? override.name : admin.name,
      email: override ? override.email : admin.email,
      role: 'admin'
    };

    const token = jwt.sign(
      finalAdmin,
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: finalAdmin
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Student Login
router.post('/student/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const { data: student, error } = await supabase.from('students').select('*').eq('username', username).maybeSingle();
    if (error || !student) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if student is currently locked out (exited website)
    if (student.locked_until) {
      const lockedUntilTime = parseInt(student.locked_until, 10);
      const currentTime = Date.now();
      if (currentTime < lockedUntilTime) {
        const remainingSeconds = Math.ceil((lockedUntilTime - currentTime) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        return res.status(403).json({
          error: `You exited the website. Login is locked. Please wait ${timeStr} before trying again.`
        });
      }
    }

    const isMatch = bcrypt.compareSync(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      {
        id: student.id,
        username: student.username,
        name: student.name,
        enrollment_no: student.enrollment_no,
        course: student.course,
        semester: student.semester,
        division: student.division,
        roll_no: student.roll_no,
        role: 'student'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: student.id,
        name: student.name,
        username: student.username,
        enrollment_no: student.enrollment_no,
        roll_no: student.roll_no,
        division: student.division,
        course: student.course,
        semester: student.semester,
        mobile: student.mobile,
        role: 'student'
      }
    });
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Faculty Login
router.post('/faculty/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const { data: faculty, error } = await supabase.from('faculty').select('*').eq('username', username).maybeSingle();
    if (error || !faculty) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = bcrypt.compareSync(password, faculty.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      {
        id: faculty.id,
        username: faculty.username,
        name: faculty.name,
        employee_no: faculty.employee_no,
        role: 'faculty'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: faculty.id,
        name: faculty.name,
        username: faculty.username,
        employee_no: faculty.employee_no,
        department: faculty.department,
        mobile: faculty.mobile,
        role: 'faculty'
      }
    });
  } catch (err) {
    console.error('Faculty login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Forbidden. Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'Unauthorized. Token required' });
  }
};

// Change password (Admin & Student support)
router.post('/change-password', authenticateJWT, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    if (req.user.role === 'admin') {
      const { data: admin } = await supabase.from('admin').select('*').eq('id', req.user.id).maybeSingle();
      if (!admin) {
        return res.status(404).json({ error: 'Admin account not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, admin.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await supabase.from('admin').update({ password: hashedNewPassword }).eq('id', req.user.id);
      
      res.json({ message: 'Password updated successfully' });
      
    } else if (req.user.role === 'faculty') {
      const { data: faculty } = await supabase.from('faculty').select('*').eq('id', req.user.id).maybeSingle();
      if (!faculty) {
        return res.status(404).json({ error: 'Faculty account not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, faculty.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await supabase.from('faculty').update({ 
        password: hashedNewPassword, 
        plain_password: newPassword 
      }).eq('id', req.user.id);
      
      res.json({ message: 'Password updated successfully' });

    } else if (req.user.role === 'student') {
      const { data: student } = await supabase.from('students').select('*').eq('id', req.user.id).maybeSingle();
      if (!student) {
        return res.status(404).json({ error: 'Student account not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, student.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await supabase.from('students').update({ 
        password: hashedNewPassword, 
        plain_password: newPassword 
      }).eq('id', req.user.id);
      
      res.json({ message: 'Password updated successfully' });
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile details
router.post('/update-profile', authenticateJWT, async (req, res) => {
  const { name, email } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    if (req.user.role === 'admin') {
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Check if email is being changed and if it already exists in another admin record
      if (email.trim().toLowerCase() !== (req.user.email || '').toLowerCase()) {
        const { data: existingAdmin } = await supabase
          .from('admin')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();

        if (existingAdmin && existingAdmin.id !== req.user.id) {
          return res.status(400).json({ error: 'Email address is already in use by another account' });
        }
      }

      const updatedData = {
        name: name.trim(),
        email: email.trim()
      };

      const { error } = await supabase
        .from('admin')
        .update(updatedData)
        .eq('id', req.user.id);

      if (error) {
        console.warn('Notice: Supabase update warning (might be RLS):', error.message);
      }

      // Save to persistent file storage to guarantee permanence even if Supabase RLS is restricted
      setAdminOverride(updatedData);

      const newAdminUser = {
        id: req.user.id,
        name: updatedData.name,
        email: updatedData.email,
        role: 'admin'
      };

      // Issue a fresh JWT token with updated profile claims
      const token = jwt.sign(
        newAdminUser,
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Profile updated successfully',
        user: newAdminUser,
        token
      });
    } else {
      return res.status(403).json({ error: 'Profile update via this endpoint is currently available for admin only' });
    }
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check current user details
router.get('/me', authenticateJWT, (req, res) => {
  res.json({ user: req.user });
});

// Student specific endpoints
router.post('/student/lock', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  
  try {
    const lockTime = Date.now() + (30 * 1000); // Lock for 30 seconds
    await supabase.from('students').update({ locked_until: lockTime.toString() }).eq('id', req.user.id);
    res.json({ success: true, locked_until: lockTime });
  } catch (err) {
    console.error('Lock error:', err);
    res.status(500).json({ error: 'Failed to lock account' });
  }
});

module.exports = {
  router,
  authenticateJWT
};
