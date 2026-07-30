const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbQuery } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_college_attendance_key_123!';

// Admin Login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const admin = await dbQuery.get('SELECT * FROM admin WHERE email = ?', [email]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = bcrypt.compareSync(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' }
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
    const student = await dbQuery.get('SELECT * FROM students WHERE username = ?', [username]);
    if (!student) {
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

    // Direct password match (or hashed comparison if hashed)
    // We will hash passwords when creating students. Let's compare hashes.
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
    const faculty = await dbQuery.get('SELECT * FROM faculty WHERE username = ?', [username]);
    if (!faculty) {
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
      const admin = await dbQuery.get('SELECT * FROM admin WHERE id = ?', [req.user.id]);
      if (!admin) {
        return res.status(404).json({ error: 'Admin account not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, admin.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await dbQuery.run('UPDATE admin SET password = ? WHERE id = ?', [hashedNewPassword, req.user.id]);
      
      res.json({ message: 'Password updated successfully' });
    } else if (req.user.role === 'faculty') {
      const faculty = await dbQuery.get('SELECT * FROM faculty WHERE id = ?', [req.user.id]);
      if (!faculty) {
        return res.status(404).json({ error: 'Faculty profile not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, faculty.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await dbQuery.run(
        'UPDATE faculty SET password = ?, plain_password = ? WHERE id = ?',
        [hashedNewPassword, newPassword, req.user.id]
      );

      res.json({ message: 'Password updated successfully' });
    } else {
      const student = await dbQuery.get('SELECT * FROM students WHERE id = ?', [req.user.id]);
      if (!student) {
        return res.status(404).json({ error: 'Student profile not found' });
      }

      const isMatch = bcrypt.compareSync(currentPassword, student.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      await dbQuery.run(
        'UPDATE students SET password = ?, plain_password = ? WHERE id = ?',
        [hashedNewPassword, newPassword, req.user.id]
      );

      res.json({ message: 'Password updated successfully' });
    }
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check current user details
router.get('/me', authenticateJWT, (req, res) => {
  res.json({ user: req.user });
});

// Lock student for 1 minute (when they exit/logout)
router.post('/student/lock', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(400).json({ error: 'Only students can be locked' });
  }

  try {
    const lockTime = Date.now() + 1 * 60 * 1000; // 1 minute lock
    await dbQuery.run('UPDATE students SET locked_until = ? WHERE id = ?', [lockTime.toString(), req.user.id]);
    res.json({ message: 'Student locked successfully for 1 minute' });
  } catch (err) {
    console.error('Lock student error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = {
  router,
  authenticateJWT
};
