const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
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
    const { data: loc } = await supabase.from('college_location').select('*').limit(1).maybeSingle();
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
    const { data: existing } = await supabase.from('college_location').select('id').limit(1).maybeSingle();

    if (existing) {
      await supabase.from('college_location').update({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseFloat(radius)
      }).eq('id', existing.id);
      
      res.json({ message: 'College location updated successfully.', location: { latitude, longitude, radius } });
    } else {
      const { data: result, error } = await supabase.from('college_location').insert([{
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseFloat(radius)
      }]).select().single();
      
      if (error) throw error;
      
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
