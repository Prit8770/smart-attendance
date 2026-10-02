const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

// Admin check middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

// GET /api/semesters - Fetch all semesters from Supabase DB
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('semesters')
      .select('*')
      .order('semester_number', { ascending: true });

    if (error) {
      console.error('Supabase fetch semesters error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Server error fetching semesters:', err);
    res.status(500).json({ error: 'Failed to fetch semesters from database' });
  }
});

// POST /api/semesters - Add new semester to Supabase DB
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { semester_number, semNumber, semester_display_name, name, term_type, term } = req.body;

  const numVal = parseInt(String(semester_number || semNumber || '1').replace(/\D/g, ''), 10) || 1;
  const nameVal = String(semester_display_name || name || `Semester ${numVal}`).trim();
  const termVal = String(term_type || term || 'Odd').trim();

  try {
    const { data: existing } = await supabase
      .from('semesters')
      .select('id, semester_number, semester_display_name')
      .eq('semester_number', numVal);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Semester with code/number ${numVal} already exists in database!` });
    }

    const insertObj = {
      semester_number: numVal,
      semester_display_name: nameVal,
      term_type: termVal
    };

    const { data, error } = await supabase
      .from('semesters')
      .insert([insertObj])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert semester error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SEMESTERS_CHANGED', { action: 'add', semester: data });
    res.status(201).json({ message: 'Semester added to Supabase DB successfully', semester: data });
  } catch (err) {
    console.error('Server error adding semester:', err);
    res.status(500).json({ error: 'Server error adding semester to database' });
  }
});

// PUT /api/semesters/:id - Update semester in Supabase DB
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { semester_number, semNumber, semester_display_name, name, term_type, term } = req.body;

  const updateObj = {};
  if (semester_number !== undefined || semNumber !== undefined) {
    updateObj.semester_number = parseInt(String(semester_number || semNumber || '1').replace(/\D/g, ''), 10) || 1;
  }
  if (semester_display_name !== undefined || name !== undefined) {
    updateObj.semester_display_name = String(semester_display_name || name || '').trim();
  }
  if (term_type !== undefined || term !== undefined) {
    updateObj.term_type = String(term_type || term || '').trim();
  }

  try {
    if (updateObj.semester_number) {
      const { data: existing } = await supabase
        .from('semesters')
        .select('id, semester_number')
        .eq('semester_number', updateObj.semester_number)
        .neq('id', id);

      if (existing && existing.length > 0) {
        return res.status(400).json({ error: `Semester with code/number ${updateObj.semester_number} already exists in database!` });
      }
    }

    const { data, error } = await supabase
      .from('semesters')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update semester error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SEMESTERS_CHANGED', { action: 'update', semester: data });
    res.json({ message: 'Semester updated in Supabase DB successfully', semester: data });
  } catch (err) {
    console.error('Server error updating semester:', err);
    res.status(500).json({ error: 'Server error updating semester in database' });
  }
});

// DELETE /api/semesters/:id - Delete semester from Supabase DB
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('semesters')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete semester error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SEMESTERS_CHANGED', { action: 'delete', id });
    res.json({ message: 'Semester deleted from Supabase DB successfully' });
  } catch (err) {
    console.error('Server error deleting semester:', err);
    res.status(500).json({ error: 'Server error deleting semester from database' });
  }
});

// POST /api/semesters/bulk-delete - Delete multiple semesters from Supabase DB
router.post('/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Ids array is required' });
  }

  try {
    const { data, error } = await supabase
      .from('semesters')
      .delete()
      .in('id', ids)
      .select();

    if (error) {
      console.error('Supabase bulk delete semesters error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SEMESTERS_CHANGED', { action: 'delete_bulk', ids });
    res.json({ message: 'Semesters deleted from Supabase DB successfully', deletedCount: data ? data.length : 0 });
  } catch (err) {
    console.error('Server error bulk deleting semesters:', err);
    res.status(500).json({ error: 'Server error bulk deleting semesters from database' });
  }
});

module.exports = router;
