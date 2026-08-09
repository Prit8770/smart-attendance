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
    const { data: loc } = await supabase.from('college_location')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

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

  const parsedLat = parseFloat(latitude);
  const parsedLon = parseFloat(longitude);
  const parsedRad = parseFloat(radius);

  try {
    const { data: existingList } = await supabase.from('college_location').select('id');

    if (existingList && existingList.length > 0) {
      // Update all existing location rows to match new location
      const ids = existingList.map(e => e.id);
      await supabase.from('college_location').update({
        latitude: parsedLat,
        longitude: parsedLon,
        radius: parsedRad
      }).in('id', ids);
      
      res.json({ message: 'College location updated successfully.', location: { latitude: parsedLat, longitude: parsedLon, radius: parsedRad } });
    } else {
      const { data: result, error } = await supabase.from('college_location').insert([{
        latitude: parsedLat,
        longitude: parsedLon,
        radius: parsedRad
      }]).select().single();
      
      if (error) throw error;
      
      res.status(201).json({
        message: 'College location configured successfully.',
        location: { id: result.id, latitude: parsedLat, longitude: parsedLon, radius: parsedRad }
      });
    }
  } catch (err) {
    console.error('Error setting college location:', err);
    res.status(500).json({ error: 'Failed to configure college location.' });
  }
});

module.exports = router;
