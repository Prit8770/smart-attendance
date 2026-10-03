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

// GET /api/subjects - Fetch all subjects from Supabase DB
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('subjects').select('*');
    if (error) {
      console.error('Supabase fetch subjects error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Server error fetching subjects:', err);
    res.status(500).json({ error: 'Failed to fetch subjects from database' });
  }
});

// POST /api/subjects - Add a new subject directly into Supabase subjects table
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { subjectName, name, shortName, code, subjectCode, semester, type } = req.body;

  const finalName = String(subjectName || name || '').trim();
  const finalSem = String(semester || '1').replace(/\D/g, '') || '1';

  if (!finalName) {
    return res.status(400).json({ error: 'Subject name is required' });
  }

  const finalCode = (code || subjectCode || '').toString().trim();
  const finalShort = (shortName || '').toString().trim() || '-';
  const finalType = (type || 'Theory').toString().trim();

  try {
    if (finalCode) {
      const { data: existingCode } = await supabase
        .from('subjects')
        .select('id, subject_name, semester, subject_code')
        .ilike('subject_code', finalCode);

      if (existingCode && existingCode.length > 0) {
        const dup = existingCode[0];
        return res.status(400).json({
          error: `Subject Code "${finalCode}" is already assigned to "${dup.subject_name}" in Semester ${dup.semester}! Subject code must be unique across all semesters.`
        });
      }
    }

    let insertObj = {
      subject_name: finalName,
      short_name: finalShort,
      subject_code: finalCode,
      semester: finalSem,
      type: finalType
    };

    let { data, error } = await supabase.from('subjects').insert([insertObj]).select().single();

    if (error) {
      console.error('Supabase insert subject error:', error);
      return res.status(400).json({ error: error.message || 'Failed to insert subject into database' });
    }

    notifyChange('SUBJECTS_CHANGED', { action: 'add', subject: data });
    res.status(201).json({ message: 'Subject added to Supabase DB successfully', subject: data });
  } catch (err) {
    console.error('Server error adding subject:', err);
    res.status(500).json({ error: 'Server error while saving subject to database' });
  }
});

// PUT /api/subjects/update-match - Update subject by matching original properties in Supabase
router.put('/update-match', authenticateJWT, requireAdmin, async (req, res) => {
  const { originalSub, newSubObj } = req.body;
  if (!newSubObj) return res.status(400).json({ error: 'newSubObj is required' });

  const origId = originalSub?.dbId || originalSub?.id;
  const origCode = (originalSub?.code || originalSub?.subjectCode || '').toString().trim();
  const origSem = String(originalSub?.semester || '1').replace(/\D/g, '') || '1';
  const origType = (originalSub?.type || 'Theory').toString().trim();
  const origName = (originalSub?.subjectName || originalSub?.name || '').toString().trim();

  const newName = String(newSubObj.subjectName || newSubObj.name || '').trim();
  const newShort = String(newSubObj.shortName || '').trim() || '-';
  const newCode = String(newSubObj.code || newSubObj.subjectCode || '').trim();
  const newSem = String(newSubObj.semester || '1').replace(/\D/g, '') || '1';
  const newType = String(newSubObj.type || 'Theory').trim();

  try {
    if (newCode) {
      let queryCheck = supabase
        .from('subjects')
        .select('id, subject_name, semester, subject_code')
        .ilike('subject_code', newCode);

      if (origId) {
        queryCheck = queryCheck.neq('id', origId);
      }

      const { data: existingCode } = await queryCheck;

      if (existingCode && existingCode.length > 0) {
        const dup = existingCode.find(s => String(s.id) !== String(origId));
        if (dup) {
          return res.status(400).json({
            error: `Subject Code "${newCode}" is already assigned to "${dup.subject_name}" in Semester ${dup.semester}! Subject code must be unique across all semesters.`
          });
        }
      }
    }

    const updateFields = {
      subject_name: newName,
      short_name: newShort,
      subject_code: newCode,
      semester: newSem,
      type: newType
    };

    let query = supabase.from('subjects').update(updateFields);

    if (origId) {
      query = query.eq('id', origId);
    } else if (origCode) {
      query = query.eq('subject_code', origCode).eq('semester', origSem);
    } else {
      query = query.ilike('subject_name', origName).eq('semester', origSem).eq('type', origType);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('Supabase update-match error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SUBJECTS_CHANGED', { action: 'update', subjects: data || [] });
    res.json({ message: 'Subject updated in Supabase DB successfully', subjects: data || [] });
  } catch (err) {
    console.error('Server error updating subject match:', err);
    res.status(500).json({ error: 'Server error updating subject in database' });
  }
});

// PUT /api/subjects/assign-faculty - Sync assigned faculty IDs for a subject in Supabase DB and update faculty.subjects JSON
router.put('/assign-faculty', authenticateJWT, requireAdmin, async (req, res) => {
  const { assigningSubject, facultyIds } = req.body;
  if (!assigningSubject) return res.status(400).json({ error: 'assigningSubject is required' });

  const subId = assigningSubject.dbId || assigningSubject.id;
  const subCode = (assigningSubject.code || assigningSubject.subjectCode || '').toString().trim();
  const subSem = String(assigningSubject.semester || '1').replace(/\D/g, '') || '1';
  const subType = (assigningSubject.type || 'Theory').toString().trim();
  const subName = (assigningSubject.subjectName || assigningSubject.name || '').toString().trim();

  const subObjToAssign = {
    subjectName: assigningSubject.subjectName || assigningSubject.name || '',
    shortName: assigningSubject.shortName || assigningSubject.shortCode || '',
    code: subCode,
    subjectCode: subCode,
    semester: subSem,
    type: subType,
    dbId: subId || null
  };

  const isSameSub = (sObj) => {
    if (!sObj) return false;
    const sDbId = sObj.dbId || sObj.id;
    if (subId && sDbId && String(subId) === String(sDbId)) return true;

    const sCode = String(sObj.code || sObj.subjectCode || sObj.subject_code || sObj.subCode || sObj.sub_code || '').toLowerCase().trim();
    const sSem = String(sObj.semester || '1').replace(/\D/g, '') || '1';
    const sType = String(sObj.type || sObj.subjectType || 'Theory').toLowerCase().trim();
    const sName = String(sObj.subjectName || sObj.name || '').toLowerCase().trim();

    if (subCode && sCode) {
      return subCode.toLowerCase() === sCode && subSem === sSem && sType === subType.toLowerCase();
    }
    if (subName && sName) {
      return subName.toLowerCase() === sName && subSem === sSem && sType === subType.toLowerCase();
    }
    return false;
  };

  try {
    const { data: dbFaculties } = await supabase.from('faculty').select('*');
    const selectedAssignFacultyIds = (facultyIds || []).map(id => String(id).trim());

    let cleanFacultyIds = [];
    if (selectedAssignFacultyIds.length > 0) {
      selectedAssignFacultyIds.forEach(rawId => {
        const strId = String(rawId).trim().toLowerCase();
        if (!strId) return;

        if (!isNaN(Number(strId))) {
          cleanFacultyIds.push(Number(strId));
          return;
        }

        const matched = (dbFaculties || []).find(f =>
          String(f.id) === strId ||
          (f.email && String(f.email).toLowerCase() === strId) ||
          (f.username && String(f.username).toLowerCase() === strId) ||
          (f.employee_no && String(f.employee_no).toLowerCase() === strId)
        );

        if (matched && matched.id && !isNaN(Number(matched.id))) {
          cleanFacultyIds.push(Number(matched.id));
        }
      });
    }

    cleanFacultyIds = Array.from(new Set(cleanFacultyIds)).slice(0, 3);

    const f1 = cleanFacultyIds[0] || null;
    const f2 = cleanFacultyIds[1] || null;
    const f3 = cleanFacultyIds[2] || null;

    const updateFields = {
      faculty_id_1: f1,
      faculty_id_2: f2,
      faculty_id_3: f3
    };

    let query = supabase.from('subjects').update(updateFields);

    if (subId && !isNaN(Number(subId))) {
      query = query.eq('id', subId);
    } else if (subCode) {
      query = query.eq('subject_code', subCode).eq('semester', subSem);
    } else {
      query = query.ilike('subject_name', subName).eq('semester', subSem).eq('type', subType);
    }

    let { data: subData, error: subError } = await query.select();

    if (subError) {
      console.error('Supabase assign-faculty update error:', subError);
    }

    // Sync faculty.subjects JSON column in DB for affected faculty in parallel
    const facultyPromises = (dbFaculties || []).map(async (f) => {
      let currentSubs = [];
      if (typeof f.subjects === 'string') {
        try { currentSubs = JSON.parse(f.subjects); } catch (e) { currentSubs = []; }
      } else if (Array.isArray(f.subjects)) {
        currentSubs = [...f.subjects];
      }

      const hasThisSub = currentSubs.some(isSameSub);
      const shouldHave = selectedAssignFacultyIds.includes(String(f.id)) ||
        cleanFacultyIds.includes(Number(f.id)) ||
        (f.email && selectedAssignFacultyIds.includes(String(f.email).toLowerCase()));

      if (shouldHave && !hasThisSub) {
        const updatedSubs = [...currentSubs, subObjToAssign];
        await supabase.from('faculty').update({ subjects: updatedSubs }).eq('id', f.id);
      } else if (!shouldHave && hasThisSub) {
        const updatedSubs = currentSubs.filter(s => !isSameSub(s));
        await supabase.from('faculty').update({ subjects: updatedSubs }).eq('id', f.id);
      }
    });

    await Promise.all(facultyPromises);

    notifyChange('SUBJECTS_CHANGED', { action: 'assign_faculty', subject: subData });
    notifyChange('FACULTY_CHANGED', { action: 'assign_faculty' });
    res.json({ message: 'Faculty assignment saved in Supabase DB successfully', subject: subData });
  } catch (err) {
    console.error('Server error assigning faculty to subject in Supabase:', err);
    res.status(500).json({ error: 'Server error saving faculty assignment to database' });
  }
});

// PUT /api/subjects/:id - Update an existing subject by ID in Supabase
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { subjectName, name, shortName, code, subjectCode, semester, type } = req.body;

  const updateObj = {};
  if (subjectName || name) updateObj.subject_name = String(subjectName || name).trim();
  if (shortName !== undefined) updateObj.short_name = String(shortName).trim() || '-';
  if (code !== undefined || subjectCode !== undefined) updateObj.subject_code = String(code || subjectCode || '').trim();
  if (semester !== undefined) updateObj.semester = String(semester).replace(/\D/g, '') || '1';
  if (type !== undefined) updateObj.type = String(type).trim() || 'Theory';

  try {
    const { data, error } = await supabase.from('subjects').update(updateObj).eq('id', id).select().single();

    if (error) {
      console.error('Supabase update subject error:', error);
      return res.status(400).json({ error: error.message });
    }

    notifyChange('SUBJECTS_CHANGED', { action: 'update', subject: data });
    res.json({ message: 'Subject updated in Supabase DB', subject: data });
  } catch (err) {
    console.error('Server error updating subject:', err);
    res.status(500).json({ error: 'Server error updating subject in database' });
  }
});

// POST /api/subjects/delete-match - Delete subject(s) by matching properties or IDs in Supabase DB
router.post('/delete-match', authenticateJWT, requireAdmin, async (req, res) => {
  const { subjects, deleteAll } = req.body;
  
  try {
    let deletedCount = 0;
    if (deleteAll) {
      const { data, error } = await supabase.from('subjects').delete().neq('id', 0).select();
      if (!error && data) {
        deletedCount = data.length;
      }
      // ALSO CLEAR ALL SUBJECTS FROM ALL FACULTIES IN DB
      const { data: dbFaculties } = await supabase.from('faculty').select('id');
      if (dbFaculties && dbFaculties.length > 0) {
        const clearPromises = dbFaculties.map(f =>
          supabase.from('faculty').update({ subjects: [] }).eq('id', f.id)
        );
        await Promise.all(clearPromises);
      }
    } else if (Array.isArray(subjects) && subjects.length > 0) {
      const deletedSubjectsList = [];
      for (const sub of subjects) {
        if (!sub) continue;
        const dbId = sub.dbId || sub.id;
        const subCode = (sub.code || sub.subjectCode || '').toString().trim();
        const subSem = String(sub.semester || '1').replace(/\D/g, '') || '1';
        const subType = (sub.type || 'Theory').toString().trim();
        const subName = (sub.subjectName || sub.name || '').toString().trim();

        let query = supabase.from('subjects').delete();
        if (dbId && !isNaN(Number(dbId))) {
          query = query.eq('id', dbId);
        } else if (subCode) {
          query = query.eq('subject_code', subCode).eq('semester', subSem);
        } else if (subName) {
          query = query.ilike('subject_name', subName).eq('semester', subSem).eq('type', subType);
        } else {
          continue;
        }

        const { data, error } = await query.select();
        if (!error && data && data.length > 0) {
          deletedCount += data.length;
          deletedSubjectsList.push(...data);
        } else {
          deletedSubjectsList.push(sub);
        }
      }

      // ALSO REMOVE DELETED SUBJECTS FROM FACULTY.SUBJECTS JSON COLUMN FOR ALL FACULTIES
      const { data: dbFaculties } = await supabase.from('faculty').select('*');
      if (dbFaculties && dbFaculties.length > 0) {
        const facultyUpdates = dbFaculties.map(async (f) => {
          let currentSubs = [];
          if (typeof f.subjects === 'string') {
            try { currentSubs = JSON.parse(f.subjects); } catch (e) { currentSubs = []; }
          } else if (Array.isArray(f.subjects)) {
            currentSubs = [...f.subjects];
          }

          if (currentSubs.length === 0) return;

          const updatedSubs = currentSubs.filter(subInFac => {
            const facSubCode = String(subInFac.code || subInFac.subjectCode || subInFac.subject_code || '').trim().toLowerCase();
            const facSubName = String(subInFac.subjectName || subInFac.name || '').trim().toLowerCase();
            const facSubSem = String(subInFac.semester || '1').replace(/\D/g, '');
            const facSubType = String(subInFac.type || 'Theory').trim().toLowerCase();

            return !deletedSubjectsList.some(dSub => {
              const dCode = String(dSub.subject_code || dSub.code || dSub.subjectCode || '').trim().toLowerCase();
              const dName = String(dSub.subject_name || dSub.subjectName || dSub.name || '').trim().toLowerCase();
              const dSem = String(dSub.semester || '1').replace(/\D/g, '');
              const dType = String(dSub.type || 'Theory').trim().toLowerCase();

              if (facSubCode && dCode) return facSubCode === dCode && facSubSem === dSem && facSubType === dType;
              if (facSubName && dName) return facSubName === dName && facSubSem === dSem && facSubType === dType;
              return false;
            });
          });

          if (updatedSubs.length !== currentSubs.length) {
            await supabase.from('faculty').update({ subjects: updatedSubs }).eq('id', f.id);
          }
        });
        await Promise.all(facultyUpdates);
      }
    }

    notifyChange('SUBJECTS_CHANGED', { action: 'delete_bulk' });
    notifyChange('FACULTY_CHANGED', { action: 'delete_subject' });
    res.json({ message: 'Subjects deleted from Supabase DB successfully', deletedCount });
  } catch (err) {
    console.error('Server error deleting subject match:', err);
    res.status(500).json({ error: 'Server error deleting subject from database' });
  }
});

// DELETE /api/subjects/:id - Delete subject by ID from Supabase DB
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: targetSub } = await supabase.from('subjects').select('*').eq('id', id).single();
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) {
      console.error('Supabase delete subject error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Also remove from faculty.subjects JSON
    if (targetSub) {
      const { data: dbFaculties } = await supabase.from('faculty').select('*');
      if (dbFaculties && dbFaculties.length > 0) {
        const dCode = String(targetSub.subject_code || targetSub.code || '').trim().toLowerCase();
        const dName = String(targetSub.subject_name || targetSub.subjectName || targetSub.name || '').trim().toLowerCase();
        const dSem = String(targetSub.semester || '1').replace(/\D/g, '');
        const dType = String(targetSub.type || 'Theory').trim().toLowerCase();

        const facultyUpdates = dbFaculties.map(async (f) => {
          let currentSubs = [];
          if (typeof f.subjects === 'string') {
            try { currentSubs = JSON.parse(f.subjects); } catch (e) { currentSubs = []; }
          } else if (Array.isArray(f.subjects)) {
            currentSubs = [...f.subjects];
          }
          if (currentSubs.length === 0) return;

          const updatedSubs = currentSubs.filter(subInFac => {
            const facSubCode = String(subInFac.code || subInFac.subjectCode || subInFac.subject_code || '').trim().toLowerCase();
            const facSubName = String(subInFac.subjectName || subInFac.name || '').trim().toLowerCase();
            const facSubSem = String(subInFac.semester || '1').replace(/\D/g, '');
            const facSubType = String(subInFac.type || 'Theory').trim().toLowerCase();

            if (facSubCode && dCode) return !(facSubCode === dCode && facSubSem === dSem && facSubType === dType);
            if (facSubName && dName) return !(facSubName === dName && facSubSem === dSem && facSubType === dType);
            return true;
          });

          if (updatedSubs.length !== currentSubs.length) {
            await supabase.from('faculty').update({ subjects: updatedSubs }).eq('id', f.id);
          }
        });
        await Promise.all(facultyUpdates);
      }
    }

    notifyChange('SUBJECTS_CHANGED', { action: 'delete', id });
    notifyChange('FACULTY_CHANGED', { action: 'delete_subject' });
    res.json({ message: 'Subject deleted from Supabase DB' });
  } catch (err) {
    console.error('Server error deleting subject:', err);
    res.status(500).json({ error: 'Failed to delete subject from database' });
  }
});

// POST /api/subjects/sync-all - Bulk sync list of subjects into Supabase subjects table
router.post('/sync-all', authenticateJWT, requireAdmin, async (req, res) => {
  const { subjects } = req.body;
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: 'Subjects array is required' });
  }

  try {
    const rowsToInsert = subjects.map(s => {
      const finalName = String(s.subjectName || s.name || '').trim();
      const finalSem = String(s.semester || '1').replace(/\D/g, '') || '1';
      const finalCode = (s.code || s.subjectCode || '').toString().trim();
      const finalShort = (s.shortName || '').toString().trim() || '-';
      const finalType = (s.type || s.subjectType || 'Theory').toString().trim();

      return {
        subject_name: finalName,
        short_name: finalShort,
        subject_code: finalCode,
        semester: finalSem,
        type: finalType
      };
    }).filter(r => r.subject_name !== '');

    if (rowsToInsert.length === 0) {
      return res.status(400).json({ error: 'No valid subjects to insert' });
    }

    const { data, error } = await supabase.from('subjects').upsert(rowsToInsert, { onConflict: 'subject_code,semester' }).select();

    if (error) {
      // Fallback: try standard insert ignoring duplicates
      const { data: insertData, error: insertError } = await supabase.from('subjects').insert(rowsToInsert).select();
      if (insertError) {
        console.warn('Upsert and Insert both failed, trying individual inserts:', insertError.message);
        for (const row of rowsToInsert) {
          await supabase.from('subjects').insert([row]).catch(() => {});
        }
      }
    }

    res.json({ message: 'Subjects bulk synced to Supabase DB successfully' });
  } catch (err) {
    console.error('Server error in sync-all subjects:', err);
    res.status(500).json({ error: 'Failed to sync subjects to database' });
  }
});

module.exports = router;
