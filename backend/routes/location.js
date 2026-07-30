const express = require('express');
const router = express.Router();
const { dbQuery } = require('../db');
const { authenticateJWT } = require('./auth');

// Middleware to restrict to admins
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

// GET college location details
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const loc = await dbQuery.get('SELECT * FROM college_location LIMIT 1');
    if (!loc) {
      return res.status(404).json({ error: 'College location not configured.' });
    }
    res.json(loc);
  } catch (err) {
    console.error('Error fetching college location:', err);
    res.status(500).json({ error: 'Failed to retrieve college location.' });
  }
});

// POST/PUT set college location (Admin only)
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { latitude, longitude, radius } = req.body;

  if (latitude === undefined || longitude === undefined || radius === undefined) {
    return res.status(400).json({ error: 'Latitude, longitude, and radius are required.' });
  }

  try {
    const existing = await dbQuery.get('SELECT id FROM college_location LIMIT 1');

    if (existing) {
      await dbQuery.run(
        'UPDATE college_location SET latitude = ?, longitude = ?, radius = ? WHERE id = ?',
        [parseFloat(latitude), parseFloat(longitude), parseFloat(radius), existing.id]
      );
      res.json({ message: 'College location updated successfully.', location: { latitude, longitude, radius } });
    } else {
      const result = await dbQuery.run(
        'INSERT INTO college_location (latitude, longitude, radius) VALUES (?, ?, ?)',
        [parseFloat(latitude), parseFloat(longitude), parseFloat(radius)]
      );
      res.status(201).json({
        message: 'College location configured successfully.',
        location: { id: result.id, latitude, longitude, radius }
      });
    }
  } catch (err) {
    console.error('Error setting college location:', err);
    res.status(500).json({ error: 'Failed to configure college location.' });
  }
});

module.exports = router;
