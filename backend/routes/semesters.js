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
    const list = data || [];
    list.sort((a, b) => {
      const semNumA = String(a.semester_number || a.id || '').trim();
      const semNumB = String(b.semester_number || b.id || '').trim();
      const digitsA = parseInt(semNumA.replace(/\D/g, ''), 10);
      const digitsB = parseInt(semNumB.replace(/\D/g, ''), 10);

      if (!isNaN(digitsA) && !isNaN(digitsB) && digitsA !== digitsB) {
        return digitsA - digitsB;
      }
      return semNumA.localeCompare(semNumB, undefined, { numeric: true, sensitivity: 'base' });
    });
    res.json(list);
  } catch (err) {
    console.error('Server error fetching semesters:', err);
    res.status(500).json({ error: 'Failed to fetch semesters from database' });
  }
});

const normalizeAndValidateTermType = (rawTerm) => {
  if (!rawTerm) return 'Odd';
  const clean = String(rawTerm).trim().toLowerCase();
  if (clean === 'odd' || clean === 'odd term') return 'Odd';
  if (clean === 'even' || clean === 'even term') return 'Even';
  return null;
};

// POST /api/semesters - Add new semester to Supabase DB
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { semester_number, semNumber, semester_display_name, name, term_type, term } = req.body;

  const numVal = parseInt(String(semester_number || semNumber || '1').replace(/\D/g, ''), 10) || 1;
  const nameVal = String(semester_display_name || name || `Semester ${numVal}`).trim();
  const termVal = normalizeAndValidateTermType(term_type || term);

  if (!termVal) {
    return res.status(400).json({ error: `Invalid Term Type '${term_type || term}'. Allowed values are 'Odd', 'Even', 'Odd Term', or 'Even Term'.` });
  }

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
    const validTerm = normalizeAndValidateTermType(term_type || term);
    if (!validTerm) {
      return res.status(400).json({ error: `Invalid Term Type '${term_type || term}'. Allowed values are 'Odd', 'Even', 'Odd Term', or 'Even Term'.` });
    }
    updateObj.term_type = validTerm;
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

// POST /api/semesters/bulk - Bulk add semesters into Supabase DB
router.post('/bulk', authenticateJWT, requireAdmin, async (req, res) => {
  const { semesters } = req.body;
  if (!Array.isArray(semesters) || semesters.length === 0) {
    return res.status(400).json({ error: 'Semesters array is required' });
  }

  try {
    const { data: existingData, error: fetchErr } = await supabase
      .from('semesters')
      .select('*');

    if (fetchErr) {
      console.error('Supabase fetch semesters error during bulk insert:', fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    const existingSemesters = existingData || [];
    const insertedSemesters = [];
    const skippedSemesters = [];

    for (const sem of semesters) {
      const numVal = parseInt(String(sem.semester_number || sem.semNumber || '1').replace(/\D/g, ''), 10) || 1;
      const nameVal = String(sem.semester_display_name || sem.name || `Semester ${numVal}`).trim();
      const termVal = normalizeAndValidateTermType(sem.term_type || sem.term);

      if (!termVal) {
        return res.status(400).json({ error: `Invalid Term Type '${sem.term_type || sem.term}' for ${nameVal}. Allowed values are 'Odd', 'Even', 'Odd Term', or 'Even Term'.` });
      }

      const isDuplicateInDb = existingSemesters.some(e => e.semester_number === numVal || (e.semester_display_name && e.semester_display_name.toLowerCase() === nameVal.toLowerCase()));
      const isDuplicateInBatch = insertedSemesters.some(i => i.semester_number === numVal || (i.semester_display_name && i.semester_display_name.toLowerCase() === nameVal.toLowerCase()));

      if (isDuplicateInDb || isDuplicateInBatch) {
        skippedSemesters.push(nameVal);
        continue;
      }

      const insertObj = {
        semester_number: numVal,
        semester_display_name: nameVal,
        term_type: termVal
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('semesters')
        .insert([insertObj])
        .select()
        .single();

      if (insertErr) {
        console.error('Error inserting semester row in bulk:', insertErr);
      } else if (inserted) {
        insertedSemesters.push(inserted);
        existingSemesters.push(inserted);
      }
    }

    notifyChange('SEMESTERS_CHANGED', { action: 'bulk_add', inserted: insertedSemesters });
    return res.status(201).json({
      message: `Successfully imported ${insertedSemesters.length} new semester(s)`,
      inserted: insertedSemesters,
      skippedCount: skippedSemesters.length
    });
  } catch (err) {
    console.error('Server error bulk adding semesters:', err);
    return res.status(500).json({ error: 'Server error bulk adding semesters to database' });
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

