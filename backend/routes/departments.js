const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

const departmentsFilePath = path.join(__dirname, '../data/departments.json');
const dataDir = path.join(__dirname, '../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Default initial departments for local fallback
const DEFAULT_DEPARTMENTS = [
  {
    id: 'dept_1',
    code: 'BCA',
    name: 'Bachelor of Computer Applications',
    duration: 3,
    createdAt: new Date().toISOString()
  },
  {
    id: 'dept_2',
    code: 'B.Tech CSE',
    name: 'Computer Science & Engineering',
    duration: 4,
    createdAt: new Date().toISOString()
  },
  {
    id: 'dept_3',
    code: 'BBA',
    name: 'Bachelor of Business Administration',
    duration: 3,
    createdAt: new Date().toISOString()
  },
  {
    id: 'dept_4',
    code: 'IT',
    name: 'Information Technology',
    duration: 3,
    createdAt: new Date().toISOString()
  }
];

function isMissingDepartmentsTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|relation .*departments.* does not exist/i.test(msg)
  );
}

function normalizeDepartments(list) {
  return (list || []).map(d => {
    const updatedAt = d.updatedAt || d.updated_at;
    return {
      id: d.id,
      code: String(d.code || '').trim(),
      name: String(d.name || '').trim(),
      duration: d.duration ? Number(d.duration) : (String(d.code || '').toUpperCase().includes('TECH') ? 4 : 3),
      createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      ...(updatedAt ? { updatedAt } : {})
    };
  });
}

function getLocalDepartments() {
  if (fs.existsSync(departmentsFilePath)) {
    try {
      const content = fs.readFileSync(departmentsFilePath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeDepartments(parsed);
      }
    } catch (e) {
      console.error('Error reading departments.json:', e);
    }
  }
  saveLocalDepartments(DEFAULT_DEPARTMENTS);
  return DEFAULT_DEPARTMENTS;
}

function saveLocalDepartments(departments) {
  try {
    fs.writeFileSync(departmentsFilePath, JSON.stringify(normalizeDepartments(departments), null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing departments.json:', e);
  }
}

async function syncSettingsBackup(departments) {
  try {
    await supabase
      .from('settings')
      .upsert({ key: 'college_departments', value: JSON.stringify(departments) }, { onConflict: 'key' });
  } catch (e) {}
}

/**
 * Fetches departments directly from public.departments when the table exists,
 * keeping departments.json mirrored as a local backup.
 */
async function fetchDbDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name, duration, created_at, updated_at')
    .order('id', { ascending: true });

  if (error) {
    if (isMissingDepartmentsTableError(error)) {
      return { tableExists: false, departments: null };
    }
    throw error;
  }

  const normalized = normalizeDepartments(data || []);
  saveLocalDepartments(normalized);
  return { tableExists: true, departments: normalized };
}

function validateDepartmentInput(body = {}) {
  const cleanCode = String(body.code || '').trim().toUpperCase();
  const cleanName = String(body.name || '').trim();
  const cleanDuration = Number(body.duration);

  if (!cleanCode) {
    return { error: 'Department Code is required (e.g. BCA, CSE)' };
  }
  if (!cleanName) {
    return { error: 'Department Name is required' };
  }
  if (
    body.duration === undefined ||
    body.duration === null ||
    String(body.duration).trim() === '' ||
    !Number.isInteger(cleanDuration) ||
    cleanDuration < 1 ||
    cleanDuration > 10
  ) {
    return { error: 'Duration (Years) is required and must be a whole number between 1 and 10' };
  }

  return { cleanCode, cleanName, cleanDuration };
}

function findDuplicateDepartment(list, cleanCode, cleanName, excludeId = null) {
  const duplicate = (list || []).find(d => {
    if (excludeId !== null && String(d.id) === String(excludeId)) return false;
    return (
      String(d.code || '').trim().toUpperCase() === cleanCode ||
      String(d.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
  });

  if (!duplicate) return null;
  if (String(duplicate.code || '').trim().toUpperCase() === cleanCode) {
    return `Department with code '${cleanCode}' already exists (${duplicate.name})!`;
  }
  return `Department with name '${cleanName}' already exists (${duplicate.code})!`;
}

// Admin check middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

// GET /api/departments - Fetch all departments
router.get('/', async (req, res) => {
  try {
    // 1. Prefer dedicated Supabase departments table when present
    try {
      const dbResult = await fetchDbDepartments();
      if (dbResult.tableExists) {
        return res.json(dbResult.departments);
      }
    } catch (e) {
      console.error('Supabase departments table fetch error:', e.message || e);
    }

    // 2. Fallback to Supabase settings table if populated
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'college_departments')
        .maybeSingle();

      if (!error && data && data.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = normalizeDepartments(parsed);
          saveLocalDepartments(normalized);
          return res.json(normalized);
        }
      }
    } catch (e) {}

    // 3. Fallback to local departments.json
    res.json(getLocalDepartments());
  } catch (err) {
    console.error('Server error fetching departments:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// POST /api/departments - Add a new department
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const validated = validateDepartmentInput(req.body);
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }
  const { cleanCode, cleanName, cleanDuration } = validated;

  try {
    const dbResult = await fetchDbDepartments();
    if (dbResult.tableExists) {
      const dupError = findDuplicateDepartment(dbResult.departments, cleanCode, cleanName);
      if (dupError) {
        return res.status(400).json({ error: dupError });
      }

      const { data: inserted, error: insertError } = await supabase
        .from('departments')
        .insert([{ code: cleanCode, name: cleanName, duration: cleanDuration }])
        .select('id, code, name, duration, created_at, updated_at')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(400).json({ error: `Department '${cleanCode}' or '${cleanName}' already exists!` });
        }
        return res.status(400).json({ error: insertError.message });
      }

      const [newDept] = normalizeDepartments([inserted]);
      saveLocalDepartments([...dbResult.departments, newDept]);
      notifyChange('DEPARTMENTS_CHANGED', { action: 'add', department: newDept });
      return res.status(201).json({ message: 'Department added successfully', department: newDept });
    }

    // Fallback: local JSON + settings backup
    const list = getLocalDepartments();
    const dupError = findDuplicateDepartment(list, cleanCode, cleanName);
    if (dupError) {
      return res.status(400).json({ error: dupError });
    }

    const newDept = {
      id: `dept_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      code: cleanCode,
      name: cleanName,
      duration: cleanDuration,
      createdAt: new Date().toISOString()
    };

    list.push(newDept);
    saveLocalDepartments(list);
    await syncSettingsBackup(list);

    notifyChange('DEPARTMENTS_CHANGED', { action: 'add', department: newDept });
    res.status(201).json({ message: 'Department added successfully', department: newDept });
  } catch (err) {
    console.error('Server error adding department:', err);
    res.status(500).json({ error: 'Server error adding department' });
  }
});

// PUT /api/departments/:id - Update department details
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const validated = validateDepartmentInput(req.body);
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }
  const { cleanCode, cleanName, cleanDuration } = validated;

  try {
    const dbResult = await fetchDbDepartments();
    if (dbResult.tableExists) {
      const targetRow = dbResult.departments.find(d => String(d.id) === String(id));
      if (!targetRow) {
        return res.status(404).json({ error: 'Department not found' });
      }

      const dupError = findDuplicateDepartment(dbResult.departments, cleanCode, cleanName, targetRow.id);
      if (dupError) {
        return res.status(400).json({ error: dupError });
      }

      const { data: updated, error: updateError } = await supabase
        .from('departments')
        .update({ code: cleanCode, name: cleanName, duration: cleanDuration })
        .eq('id', targetRow.id)
        .select('id, code, name, duration, created_at, updated_at')
        .single();

      if (updateError) {
        if (updateError.code === '23505') {
          return res.status(400).json({ error: `Another department with code '${cleanCode}' or name '${cleanName}' already exists!` });
        }
        return res.status(400).json({ error: updateError.message });
      }

      const [updatedDept] = normalizeDepartments([updated]);
      saveLocalDepartments(dbResult.departments.map(d => (String(d.id) === String(targetRow.id) ? updatedDept : d)));
      notifyChange('DEPARTMENTS_CHANGED', { action: 'update', department: updatedDept });
      return res.json({ message: 'Department updated successfully', department: updatedDept });
    }

    // Fallback: local JSON + settings backup
    const list = getLocalDepartments();
    const index = list.findIndex(d => String(d.id) === String(id));

    if (index === -1) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const dupError = findDuplicateDepartment(list, cleanCode, cleanName, id);
    if (dupError) {
      return res.status(400).json({ error: dupError });
    }

    const updatedDept = {
      id: list[index].id,
      code: cleanCode,
      name: cleanName,
      duration: cleanDuration,
      createdAt: list[index].createdAt,
      updatedAt: new Date().toISOString()
    };

    list[index] = updatedDept;
    saveLocalDepartments(list);
    await syncSettingsBackup(list);

    notifyChange('DEPARTMENTS_CHANGED', { action: 'update', department: updatedDept });
    res.json({ message: 'Department updated successfully', department: updatedDept });
  } catch (err) {
    console.error('Server error updating department:', err);
    res.status(500).json({ error: 'Server error updating department' });
  }
});

// DELETE /api/departments/:id - Delete a department
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const dbResult = await fetchDbDepartments();
    if (dbResult.tableExists) {
      const targetRow = dbResult.departments.find(d => String(d.id) === String(id));
      if (!targetRow) {
        return res.status(404).json({ error: 'Department not found' });
      }

      const { error: deleteError } = await supabase
        .from('departments')
        .delete()
        .eq('id', targetRow.id);

      if (deleteError) {
        return res.status(400).json({ error: deleteError.message });
      }

      saveLocalDepartments(dbResult.departments.filter(d => String(d.id) !== String(targetRow.id)));
      notifyChange('DEPARTMENTS_CHANGED', { action: 'delete', id });
      return res.json({ message: 'Department deleted successfully' });
    }

    // Fallback: local JSON + settings backup
    const list = getLocalDepartments();
    const filtered = list.filter(d => String(d.id) !== String(id));

    if (filtered.length === list.length) {
      return res.status(404).json({ error: 'Department not found' });
    }

    saveLocalDepartments(filtered);
    await syncSettingsBackup(filtered);

    notifyChange('DEPARTMENTS_CHANGED', { action: 'delete', id });
    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error('Server error deleting department:', err);
    res.status(500).json({ error: 'Server error deleting department' });
  }
});

// POST /api/departments/bulk-delete - Delete multiple departments
router.post('/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Valid array of department IDs is required' });
  }

  const idSet = new Set(ids.map(id => String(id)));

  try {
    const dbResult = await fetchDbDepartments();
    if (dbResult.tableExists) {
      const matchingIds = dbResult.departments
        .filter(d => idSet.has(String(d.id)))
        .map(d => d.id);

      if (matchingIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('departments')
          .delete()
          .in('id', matchingIds);

        if (deleteError) {
          return res.status(400).json({ error: deleteError.message });
        }
      }

      saveLocalDepartments(dbResult.departments.filter(d => !idSet.has(String(d.id))));
      notifyChange('DEPARTMENTS_CHANGED', { action: 'bulk-delete', ids });
      return res.json({ message: `${ids.length} department(s) deleted successfully` });
    }

    // Fallback: local JSON + settings backup
    const list = getLocalDepartments();
    const filtered = list.filter(d => !idSet.has(String(d.id)));

    saveLocalDepartments(filtered);
    await syncSettingsBackup(filtered);

    notifyChange('DEPARTMENTS_CHANGED', { action: 'bulk-delete', ids });
    res.json({ message: `${ids.length} department(s) deleted successfully` });
  } catch (err) {
    console.error('Server error bulk deleting departments:', err);
    res.status(500).json({ error: 'Server error bulk deleting departments' });
  }
});

module.exports = router;
