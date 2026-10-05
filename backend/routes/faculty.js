const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

// Helper to generate a strong password meeting policy (min 8 chars, 1 uppercase, 1 digit, 1 special character)
function generatePassword() {
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specials = '@#$%&*!';

  let password = '';
  password += uppers.charAt(Math.floor(Math.random() * uppers.length));
  password += lowers.charAt(Math.floor(Math.random() * lowers.length));
  password += digits.charAt(Math.floor(Math.random() * digits.length));
  password += specials.charAt(Math.floor(Math.random() * specials.length));

  const all = uppers + lowers + digits + specials;
  for (let i = 4; i < 9; i++) {
    password += all.charAt(Math.floor(Math.random() * all.length));
  }
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

// Strong Password Validation Helper
function validateStrongPassword(pass) {
  if (!pass || String(pass).trim() === '') return { isValid: true };
  const trimmed = String(pass).trim();
  if (trimmed.length < 8) return { isValid: false, error: 'Password must be at least 8 characters long.' };
  if (!/[A-Z]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 uppercase letter (A-Z).' };
  if (!/[0-9]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 numeric digit (0-9).' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) return { isValid: false, error: 'Password must contain at least 1 special character (e.g. @, #, $, !).' };
  return { isValid: true };
}

// Admin only middleware check
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

const fs = require('fs');
const path = require('path');

const subjectsFilePath = path.join(__dirname, '../data/faculty_subjects.json');
const rolesFilePath = path.join(__dirname, '../data/faculty_roles.json');

const ensureSubjectsFile = () => {
  const dir = path.dirname(subjectsFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(subjectsFilePath)) fs.writeFileSync(subjectsFilePath, JSON.stringify({}), 'utf8');
};

const loadFacultySubjectsMap = () => {
  ensureSubjectsFile();
  try {
    const raw = fs.readFileSync(subjectsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
};

const saveFacultySubjectsMap = (map) => {
  ensureSubjectsFile();
  fs.writeFileSync(subjectsFilePath, JSON.stringify(map, null, 2), 'utf8');
};

const ensureRolesFile = () => {
  const dir = path.dirname(rolesFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(rolesFilePath)) fs.writeFileSync(rolesFilePath, JSON.stringify({}), 'utf8');
};

const loadFacultyRolesMap = () => {
  ensureRolesFile();
  try {
    const raw = fs.readFileSync(rolesFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
};

const saveFacultyRolesMap = (map) => {
  ensureRolesFile();
  fs.writeFileSync(rolesFilePath, JSON.stringify(map, null, 2), 'utf8');
};

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

// Helper function to ensure Admin user is physically created/synced in Supabase faculty table
let adminSynced = false;
async function ensureAdminInSupabaseFaculty(adminEmail, adminName, adminMobile, force = false) {
  if (adminSynced && !force) return null;
  try {
    const cleanEmail = String(adminEmail || 'admin@ljcca.edu').trim().toLowerCase();
    const { data: existingRows } = await supabase
      .from('faculty')
      .select('*')
      .or(`email.eq.${cleanEmail},username.eq.${cleanEmail}`);

    if (!existingRows || existingRows.length === 0) {
      let adminPasswordHash = '$2a$10$0pxQ8vu0Bi/hnUQ7hW/HhOxCR.pFyVpaogs8rgL9S2W8EFITQTqTW';
      try {
        const { data: adminRow } = await supabase.from('admin').select('password').eq('email', cleanEmail).maybeSingle();
        if (adminRow && adminRow.password) adminPasswordHash = adminRow.password;
      } catch (e) {}

      const insertAdminObj = {
        name: adminName || 'Administrative',
        department: 'BCA',
        mobile: adminMobile || '9510479002',
        username: cleanEmail,
        password: adminPasswordHash,
        plain_password: 'Uses Admin Account (No separate password needed)',
        email: cleanEmail
      };

      const { data: inserted, error } = await supabase
        .from('faculty')
        .insert([insertAdminObj])
        .select()
        .single();

      if (!error) adminSynced = true;
      return inserted;
    } else {
      // Purge any extra duplicate admin rows from Supabase DB to guarantee exactly 1 Primary Admin row
      if (existingRows.length > 1) {
        const primaryAdmin = existingRows.find(r => String(r.id) === '78' || r.isPrimaryAdmin) || existingRows[0];
        const extraIds = existingRows.filter(r => r.id !== primaryAdmin.id).map(r => r.id);
        if (extraIds.length > 0) {
          await supabase.from('faculty').delete().in('id', extraIds);
        }
      }
      adminSynced = true;
      return existingRows[0];
    }
  } catch (err) {
    console.warn('Error in ensureAdminInSupabaseFaculty:', err.message);
  }
  return null;
}

// GET all faculty
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const subjectsMap = loadFacultySubjectsMap();
    const rolesMap = loadFacultyRolesMap();
    const override = getAdminOverride();

    const adminEmail = (override?.email || 'admin@ljcca.edu').toLowerCase();
    const adminName = override?.name || 'Administrative';
    const adminMobile = override?.mobile || '9510479002';

    // Non-blocking sync for admin in faculty table
    ensureAdminInSupabaseFaculty(adminEmail, adminName, adminMobile).catch(() => {});

    const { data: faculty, error } = await supabase.from('faculty').select('*');
    if (error) throw error;

    const formatted = (faculty || []).map(f => {
      let deptName = f.department || '';
      let embeddedSubjects = [];

      if (deptName.includes('||SUB:')) {
        const parts = deptName.split('||SUB:');
        deptName = parts[0].trim();
        try {
          const jsonStr = parts[1].split('||')[0];
          embeddedSubjects = JSON.parse(jsonStr);
        } catch (e) {}
      }

      const fileSubjects = subjectsMap[f.id] ||
        subjectsMap[String(f.id)] ||
        (f.employee_no && subjectsMap[f.employee_no]) ||
        (f.employee_no && subjectsMap[String(f.employee_no)]) ||
        (f.email && subjectsMap[f.email.toLowerCase()]) ||
        (f.username && subjectsMap[f.username.toLowerCase()]) ||
        [];
      const subMap = new Map();
      const mergeSub = (s) => {
        if (!s || (!s.subjectName && !s.name && !s.subject_name)) return;
        const name = String(s.subjectName || s.name || s.subject_name || '').trim();
        const sem = String(s.semester || '1').replace(/\D/g, '') || '1';
        const code = (s.code || s.subjectCode || s.subject_code || s.subCode || '').toString().trim();
        const shortName = (s.shortName || s.short_name || s.shortCode || s.short_code || s.short || '').toString().trim();
        const type = (s.type || s.subjectType || s.subject_type || 'Theory').toString().trim();

        const codeKey = code ? code.toLowerCase() : '';
        const typeKey = type ? type.toLowerCase() : 'theory';
        const key = codeKey 
          ? `code_${codeKey}_sem_${sem}_type_${typeKey}` 
          : `name_${name.toLowerCase()}_sem_${sem}_type_${typeKey}`;

        const existing = subMap.get(key) || {};
        subMap.set(key, {
          ...existing,
          ...s,
          subjectName: name,
          shortName: shortName || existing.shortName || '',
          code: code || existing.code || '',
          subjectCode: code || existing.subjectCode || '',
          semester: sem,
          type: type || existing.type || 'Theory'
        });
      };
      
      if (Array.isArray(fileSubjects) && fileSubjects.length > 0) {
        fileSubjects.forEach(mergeSub);
      } else if (Array.isArray(embeddedSubjects) && embeddedSubjects.length > 0) {
        embeddedSubjects.forEach(mergeSub);
      }
      const finalSubjects = Array.from(subMap.values());
      const fRoles = rolesMap[f.id] || rolesMap[String(f.id)] || (f.email ? rolesMap[f.email.toLowerCase()] : null) || (f.username ? rolesMap[f.username.toLowerCase()] : null) || (f.employee_no ? rolesMap[f.employee_no] : null) || (f.role === 'admin' ? ['admin', 'faculty'] : ['faculty']);

      const isThisAdmin = (f.email && f.email.toLowerCase() === adminEmail) || (f.username && f.username.toLowerCase() === adminEmail) || String(f.id) === '78' || String(f.id) === '86';
      const assignedAdminRoles = rolesMap['admin_primary'] || rolesMap[adminEmail] || rolesMap['78'] || rolesMap['86'] || (Array.isArray(fRoles) ? fRoles : ['admin', 'faculty']);

      return {
        ...f,
        name: isThisAdmin ? adminName : f.name,
        department: deptName || 'BCA',
        mobile: isThisAdmin ? adminMobile : f.mobile,
        subjects: Array.isArray(finalSubjects) ? finalSubjects : [],
        roles: isThisAdmin ? assignedAdminRoles : fRoles,
        isPrimaryAdmin: isThisAdmin,
        plain_password: isThisAdmin ? 'Uses Admin Account (No separate password needed)' : f.plain_password
      };
    });

    // Deduplicate response to guarantee only 1 Primary Admin row and no duplicate IDs
    const uniqueFormatted = [];
    const seenAdminEmails = new Set();
    const seenIds = new Set();

    for (const item of formatted) {
      if (seenIds.has(item.id)) continue;
      if (item.isPrimaryAdmin) {
        if (seenAdminEmails.has(adminEmail)) continue; // Skip extra primary admin duplicates
        seenAdminEmails.add(adminEmail);
      }
      seenIds.add(item.id);
      uniqueFormatted.push(item);
    }

    // Sort primary admin to the very top, and sort remaining faculty A to Z alphabetically by name
    uniqueFormatted.sort((a, b) => {
      if (a.isPrimaryAdmin && !b.isPrimaryAdmin) return -1;
      if (!a.isPrimaryAdmin && b.isPrimaryAdmin) return 1;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    res.json(uniqueFormatted);
  } catch (err) {
    console.error('Error fetching faculty:', err);
    res.status(500).json({ error: 'Failed to fetch faculty members' });
  }
});

// POST add new faculty
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { name, email, department, mobile, subjects, roles, password: customPassword, employee_no: inputEmpNo, employeeNo } = req.body;

  if (!name || !email || !department || !mobile) {
    return res.status(400).json({ error: 'Name, Email ID, Department, and Mobile are required' });
  }

  const cleanRoles = Array.isArray(roles) && roles.length > 0
    ? Array.from(new Set(roles.map(r => String(r).toLowerCase().trim())))
    : ['faculty'];

  const employee_no = String(inputEmpNo || employeeNo || `EMP${String(Date.now()).slice(-6)}${Math.floor(100 + Math.random() * 900)}`).trim();

  // Clean subjects list with optional shortName support
  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
        .map(s => {
          const c = (s.code || s.subjectCode || s.subject_code || s.subCode) ? String(s.code || s.subjectCode || s.subject_code || s.subCode).trim() : '';
          return {
            subjectName: String(s.subjectName || s.name).trim(),
            shortName: s.shortName ? String(s.shortName).trim() : '',
            code: c,
            subjectCode: c,
            semester: String(s.semester || '1').trim(),
            type: (s.type || s.subjectType) ? String(s.type || s.subjectType).trim() : 'Theory'
          };
        })
    : [];

  if (customPassword && customPassword.trim() !== '') {
    const passCheck = validateStrongPassword(customPassword);
    if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
  }

  const cleanEmail = String(email).trim();
  const username = cleanEmail.toLowerCase();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : generatePassword();
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  // Store clean department string in DB column (avoid DB column truncation since department is VARCHAR(255))
  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanDeptName;

  try {
    // Fetch all existing faculty to perform department-scoped validation
    const { data: allFac } = await supabase.from('faculty').select('*');
    const sameDeptFac = (allFac || []).filter(f => {
      const fDept = String(f.department || '').split('||SUB:')[0].trim().toLowerCase();
      return fDept === cleanDeptName.toLowerCase();
    });

    const isEmailDupInSameDept = sameDeptFac.some(f => {
      const fEmail = String(f.email || f.username || '').trim().toLowerCase();
      return fEmail && fEmail === cleanEmail.toLowerCase();
    });

    if (isEmailDupInSameDept) {
      return res.status(400).json({ error: `Faculty with Email ID "${cleanEmail}" already exists in ${cleanDeptName} department.` });
    }

    if (mobile && String(mobile).trim()) {
      const cleanMob = String(mobile).trim();
      const isMobileDupInSameDept = sameDeptFac.some(f => {
        const fMob = String(f.mobile || '').trim();
        return fMob && fMob === cleanMob;
      });

      if (isMobileDupInSameDept) {
        return res.status(400).json({ error: `Faculty with Mobile Number "${cleanMob}" already exists in ${cleanDeptName} department.` });
      }
    }

    // Determine unique username for DB column to avoid unique index violation when email exists in another dept
    let finalUsername = username;
    const isUsernameTaken = (allFac || []).some(f => String(f.username || '').toLowerCase() === username.toLowerCase());
    if (isUsernameTaken) {
      const deptSlug = cleanDeptName.toLowerCase().replace(/[^a-z0-9]/g, '');
      finalUsername = `${cleanEmail.toLowerCase()}_${deptSlug}_${Math.floor(100 + Math.random() * 900)}`;
    }

    let insertObj = {
      name,
      department: encodedDepartment,
      mobile,
      username: finalUsername,
      password: hashedPassword,
      plain_password: rawPassword,
      email: cleanEmail
    };

    let { data: result, error } = await supabase.from('faculty').insert([insertObj]).select().single();

    if (error && (error.message?.includes('email') || error.code === '42703' || error.message?.includes('column'))) {
      console.warn('Supabase faculty table missing column, retrying insert without missing fields:', error.message);
      if (error.message?.includes('email')) delete insertObj.email;
      const retry = await supabase.from('faculty').insert([insertObj]).select().single();
      result = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Supabase insert faculty error:', error);
      return res.status(400).json({ error: error.message || 'Failed to add faculty member' });
    }

    // Save subjects in persistent map under all alias keys
    const map = loadFacultySubjectsMap();
    const aliasKeys = [];
    if (result && result.id) aliasKeys.push(result.id, String(result.id));
    if (employee_no) aliasKeys.push(employee_no, String(employee_no));
    if (cleanEmail) aliasKeys.push(cleanEmail.toLowerCase());
    if (username) aliasKeys.push(username.toLowerCase());
    aliasKeys.forEach(k => { map[k] = cleanSubjects; });
    saveFacultySubjectsMap(map);

    // Save roles in persistent map
    const rolesMap = loadFacultyRolesMap();
    if (result && result.id) {
      rolesMap[result.id] = cleanRoles;
      rolesMap[String(result.id)] = cleanRoles;
    }
    if (cleanEmail) rolesMap[cleanEmail.toLowerCase()] = cleanRoles;
    if (username) rolesMap[username.toLowerCase()] = cleanRoles;
    if (employee_no) rolesMap[employee_no] = cleanRoles;
    saveFacultyRolesMap(rolesMap);

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'create', facultyId: result ? result.id : null });

    res.status(201).json({
      message: 'Faculty added successfully',
      faculty: {
        id: result ? result.id : Date.now(),
        name,
        email: cleanEmail,
        department: cleanDeptName,
        mobile,
        username,
        subjects: cleanSubjects,
        roles: cleanRoles,
        plain_password: rawPassword,
        generatedPassword: rawPassword
      }
    });
  } catch (err) {
    console.error('Error adding faculty:', err);
    res.status(500).json({ error: err.message || 'Failed to add faculty member' });
  }
});

// PUT update logged in faculty's own subjects
router.put('/my-subjects', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'faculty' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Faculty access only.' });
  }

  const { subjects } = req.body;
  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
        .map(s => ({
          subjectName: String(s.subjectName || s.name).trim(),
          shortName: s.shortName ? String(s.shortName).trim() : '',
          code: s.code || s.subjectCode ? String(s.code || s.subjectCode).trim() : '',
          semester: String(s.semester || '1').trim(),
          type: s.type || s.subjectType ? String(s.type || s.subjectType).trim() : 'Theory'
        }))
    : [];

  try {
    const facultyId = req.user.id;
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', facultyId).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member profile not found.' });
    }

    const cleanDeptName = String(faculty.department || 'BCA').split('||SUB:')[0].trim();
    await supabase.from('faculty').update({ department: cleanDeptName }).eq('id', facultyId);

    // Save in persistent JSON map for all alias keys
    const map = loadFacultySubjectsMap();
    const aliasKeys = [facultyId, String(facultyId)];
    if (faculty.employee_no) aliasKeys.push(faculty.employee_no, String(faculty.employee_no));
    if (faculty.email) aliasKeys.push(faculty.email.toLowerCase());
    if (faculty.username) aliasKeys.push(faculty.username.toLowerCase());
    aliasKeys.forEach(k => { map[k] = cleanSubjects; });
    saveFacultySubjectsMap(map);

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'subjects', facultyId });

    res.json({
      success: true,
      message: 'Subjects updated successfully',
      subjects: cleanSubjects
    });
  } catch (err) {
    console.error('Error updating faculty subjects:', err);
    res.status(500).json({ error: 'Failed to update subjects' });
  }
});

// PUT edit faculty
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, department, mobile, subjects, roles, resetPassword, password } = req.body;

  // Handle Admin's faculty details update
  const override = getAdminOverride() || {};
  const adminEmail = (override.email || 'admin@ljcca.edu').toLowerCase();
  const isAdminTarget = id === 'admin_primary' || String(id).startsWith('admin') || String(id) === '78' || (req.body && req.body.isPrimaryAdmin) || (email && String(email).toLowerCase() === adminEmail);

  if (isAdminTarget) {
    const cleanDeptName = department ? String(department).split('||SUB:')[0].trim() : 'BCA';
    const cleanSubjects = Array.isArray(subjects)
      ? subjects
          .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
          .map(s => {
            const c = (s.code || s.subjectCode || s.subject_code || s.subCode) ? String(s.code || s.subjectCode || s.subject_code || s.subCode).trim() : '';
            return {
              subjectName: String(s.subjectName || s.name).trim(),
              shortName: s.shortName ? String(s.shortName).trim() : '',
              code: c,
              subjectCode: c,
              semester: String(s.semester || '1').trim(),
              type: (s.type || s.subjectType) ? String(s.type || s.subjectType).trim() : 'Theory'
            };
          })
      : [];

    if (name && name.trim()) override.name = name.trim();
    if (mobile && mobile.trim()) override.mobile = mobile.trim();
    setAdminOverride(override);

    const map = loadFacultySubjectsMap();
    map['admin_primary'] = cleanSubjects;
    map[adminEmail] = cleanSubjects;
    map['78'] = cleanSubjects;
    saveFacultySubjectsMap(map);

    // Save roles: Admin role CANNOT be removed from primary admin, but faculty role can be toggled!
    const passedRoles = Array.isArray(roles) ? roles : ['admin', 'faculty'];
    const finalRoles = Array.from(new Set([...passedRoles.filter(r => r === 'faculty' || r === 'admin'), 'admin']));

    const rolesMap = loadFacultyRolesMap();
    rolesMap['admin_primary'] = finalRoles;
    rolesMap[adminEmail] = finalRoles;
    rolesMap['78'] = finalRoles;
    saveFacultyRolesMap(rolesMap);

    // Also update/upsert row in Supabase faculty table
    await ensureAdminInSupabaseFaculty(adminEmail, override.name || 'Administrative', override.mobile || '9510479002');

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'admin_faculty_update' });

    return res.json({
      message: 'Admin faculty details updated successfully',
      faculty: {
        id: id === 'admin_primary' ? 'admin_primary' : (id || '78'),
        name: override.name || 'Administrative',
        email: adminEmail,
        department: cleanDeptName,
        mobile: override.mobile || '9510479002',
        username: adminEmail,
        subjects: cleanSubjects,
        roles: finalRoles,
        isPrimaryAdmin: true,
        plain_password: 'Uses Admin Account (No separate password needed)'
      }
    });
  }

  if (!name || !email || !department || !mobile) {
    return res.status(400).json({ error: 'Name, Email ID, Department, and Mobile are required' });
  }

  const map = loadFacultySubjectsMap();
  const existingSubs = map[id] || map[String(id)] || [];

  const cleanSubjects = Array.isArray(subjects)
    ? subjects
        .filter(s => s && (s.subjectName || s.name) && String(s.subjectName || s.name).trim() !== '')
        .map(s => {
          const c = (s.code || s.subjectCode || s.subject_code || s.subCode) ? String(s.code || s.subjectCode || s.subject_code || s.subCode).trim() : '';
          return {
            subjectName: String(s.subjectName || s.name).trim(),
            shortName: s.shortName ? String(s.shortName).trim() : '',
            code: c,
            subjectCode: c,
            semester: String(s.semester || '1').trim(),
            type: (s.type || s.subjectType) ? String(s.type || s.subjectType).trim() : 'Theory'
          };
        })
    : (subjects === undefined ? existingSubs : []);

  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanDeptName;

  try {
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
    }

    // Check duplicate Email or Mobile in the SAME Department (excluding current faculty id)
    const { data: allFac } = await supabase.from('faculty').select('*');
    const sameDeptFac = (allFac || []).filter(f => {
      if (String(f.id) === String(id)) return false;
      const fDept = String(f.department || '').split('||SUB:')[0].trim().toLowerCase();
      return fDept === cleanDeptName.toLowerCase();
    });

    if (email && String(email).trim()) {
      const cleanEmail = String(email).trim().toLowerCase();
      const isEmailDup = sameDeptFac.some(f => {
        const fEmail = String(f.email || f.username || '').trim().toLowerCase();
        return fEmail && fEmail === cleanEmail;
      });
      if (isEmailDup) {
        return res.status(400).json({ error: `Faculty with Email ID "${email}" already exists in ${cleanDeptName} department.` });
      }
    }

    if (mobile && String(mobile).trim()) {
      const cleanMob = String(mobile).trim();
      const isMobileDup = sameDeptFac.some(f => {
        const fMob = String(f.mobile || '').trim();
        return fMob && fMob === cleanMob;
      });
      if (isMobileDup) {
        return res.status(400).json({ error: `Faculty with Mobile Number "${cleanMob}" already exists in ${cleanDeptName} department.` });
      }
    }

    let updateObj = { name, department: encodedDepartment, mobile };
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      updateObj.email = String(email).trim();
    }
    let newPassword = null;

    if (password && password.trim() !== '') {
      newPassword = password.trim();
      const passCheck = validateStrongPassword(newPassword);
      if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    } else if (resetPassword) {
      newPassword = generatePassword();
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    }

    let { error } = await supabase.from('faculty').update(updateObj).eq('id', id);

    if (error && (error.message?.includes('email') || error.code === '42703' || error.message?.includes('column'))) {
      console.warn('Supabase faculty table missing email column on update, retrying without email:', error.message);
      delete updateObj.email;
      const retry = await supabase.from('faculty').update(updateObj).eq('id', id);
      error = retry.error;
    }

    if (error) {
      console.error('Supabase update faculty error:', error);
      return res.status(400).json({ error: error.message || 'Failed to update faculty member' });
    }

    // Save subjects in persistent map under all alias keys
    const map = loadFacultySubjectsMap();
    const aliasKeys = [id, String(id)];
    if (faculty.employee_no) aliasKeys.push(faculty.employee_no, String(faculty.employee_no));
    if (faculty.email) aliasKeys.push(faculty.email.toLowerCase());
    if (email && String(email).trim()) aliasKeys.push(String(email).trim().toLowerCase());
    if (faculty.username) aliasKeys.push(faculty.username.toLowerCase());
    aliasKeys.forEach(k => { map[k] = cleanSubjects; });
    saveFacultySubjectsMap(map);

    // Save roles in persistent map if provided
    let updatedRoles = ['faculty'];
    if (roles !== undefined) {
      updatedRoles = Array.isArray(roles) && roles.length > 0
        ? Array.from(new Set(roles.map(r => String(r).toLowerCase().trim())))
        : ['faculty'];
      const rolesMap = loadFacultyRolesMap();
      rolesMap[id] = updatedRoles;
      rolesMap[String(id)] = updatedRoles;
      if (email) rolesMap[String(email).trim().toLowerCase()] = updatedRoles;
      if (faculty.username) rolesMap[faculty.username.toLowerCase()] = updatedRoles;
      if (faculty.employee_no) rolesMap[faculty.employee_no] = updatedRoles;
      saveFacultyRolesMap(rolesMap);
    } else {
      const rolesMap = loadFacultyRolesMap();
      updatedRoles = rolesMap[id] || rolesMap[String(id)] || (faculty.email ? rolesMap[faculty.email.toLowerCase()] : null) || ['faculty'];
    }

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'update', facultyId: id });

    res.json({
      message: 'Faculty updated successfully',
      faculty: {
        id,
        name,
        department: cleanDeptName,
        mobile,
        subjects: cleanSubjects,
        roles: updatedRoles,
        plain_password: newPassword || faculty.plain_password,
        generatedPassword: newPassword
      }
    });
  } catch (err) {
    console.error('Error updating faculty:', err);
    res.status(500).json({ error: 'Failed to update faculty' });
  }
});

// POST delete one or more subjects assigned to a faculty member
router.post('/:id/delete-subject', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { subject, subjects, subKeys, subKey } = req.body;

  const targetList = [];
  if (subject && typeof subject === 'object') targetList.push(subject);
  if (Array.isArray(subjects)) targetList.push(...subjects);
  if (subKey) targetList.push({ subKey });
  if (Array.isArray(subKeys)) subKeys.forEach(k => targetList.push({ subKey: k }));

  if (targetList.length === 0) {
    return res.status(400).json({ error: 'No subject specified for deletion.' });
  }

  try {
    const override = getAdminOverride() || {};
    const adminEmail = (override.email || 'admin@ljcca.edu').toLowerCase();
    const isAdminTarget = id === 'admin_primary' || String(id).startsWith('admin') || String(id) === '78' || (req.body && req.body.isPrimaryAdmin);

    const map = loadFacultySubjectsMap();
    let currentSubs = [];
    let aliasKeys = [];

    let facultyRow = null;
    if (isAdminTarget) {
      aliasKeys = ['admin_primary', '78', adminEmail];
      currentSubs = map['admin_primary'] || map['78'] || map[adminEmail] || [];
    } else {
      const { data: fac } = await supabase.from('faculty').select('*').eq('id', id).maybeSingle();
      facultyRow = fac;
      aliasKeys = [String(id), id];
      if (fac?.employee_no) aliasKeys.push(fac.employee_no, String(fac.employee_no));
      if (fac?.email) aliasKeys.push(fac.email.toLowerCase());
      if (fac?.username) aliasKeys.push(fac.username.toLowerCase());

      for (const k of aliasKeys) {
        if (Array.isArray(map[k]) && map[k].length > 0) {
          currentSubs = map[k];
          break;
        }
      }
      if (currentSubs.length === 0 && fac?.department && fac.department.includes('||SUB:')) {
        try {
          const jsonStr = fac.department.split('||SUB:')[1].split('||')[0];
          currentSubs = JSON.parse(jsonStr);
        } catch (e) {}
      }
    }

    const matchesTarget = (s, idx) => {
      const sName = String(s.subjectName || s.name || '').trim().toLowerCase();
      const sSem = String(s.semester || '1').replace(/\D/g, '');
      const sCode = String(s.code || s.subjectCode || s.subject_code || s.subCode || '').trim().toLowerCase();
      const generatedKey1 = s.id || (sCode ? `${id}_${sCode}` : null) || `${id}_${sName}_${idx}`;
      const generatedKey2 = s.id || (sCode ? `admin_primary_${sCode}` : null) || `admin_primary_${sName}_${idx}`;
      const generatedKey3 = s.id || (sCode ? `78_${sCode}` : null) || `78_${sName}_${idx}`;

      for (const t of targetList) {
        if (!t) continue;
        const tKey = t.subKey || t.id || t.key;
        if (tKey && (tKey === generatedKey1 || tKey === generatedKey2 || tKey === generatedKey3 || tKey === sCode || tKey === s.id)) {
          return true;
        }
        const tName = String(t.subjectName || t.name || '').trim().toLowerCase();
        const tSem = String(t.semester || '1').replace(/\D/g, '');
        const tCode = String(t.code || t.subjectCode || t.subject_code || t.subCode || '').trim().toLowerCase();
        if (tName && sName === tName) {
          if (!tSem || sSem === tSem) {
            if (!tCode || !sCode || sCode === tCode) return true;
          }
        }
        if (tCode && sCode && sCode === tCode) return true;
      }
      return false;
    };

    const remainingSubs = currentSubs.filter((s, idx) => !matchesTarget(s, idx));

    // Update faculty_subjects.json for all alias keys
    aliasKeys.forEach(k => {
      map[k] = remainingSubs;
    });
    saveFacultySubjectsMap(map);

    // Update Supabase department column
    if (isAdminTarget) {
      const cleanDept = 'BCA';
      try {
        await supabase.from('faculty').update({ department: cleanDept }).or(`id.eq.78,email.eq.${adminEmail}`);
      } catch (e) {}
    } else if (facultyRow) {
      const cleanDept = String(facultyRow.department || 'BCA').split('||SUB:')[0].trim();
      await supabase.from('faculty').update({ department: cleanDept }).eq('id', id);
    }

    notifyChange('FACULTY_CHANGED', { action: 'delete_subject', facultyId: id });

    res.json({
      success: true,
      message: 'Subject(s) deleted successfully',
      subjects: remainingSubs
    });
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

// POST bulk delete faculty members
router.post('/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
  const { facultyIds } = req.body;

  if (!facultyIds || !Array.isArray(facultyIds) || facultyIds.length === 0) {
    return res.status(400).json({ error: 'No faculty IDs provided for deletion.' });
  }

  try {
    const override = getAdminOverride();
    const adminEmail = (override?.email || 'admin@ljcca.edu').toLowerCase();

    // Query primary admin DB row IDs to guarantee protection
    const { data: adminFacs } = await supabase
      .from('faculty')
      .select('id, email, username')
      .or(`email.eq.${adminEmail},username.eq.${adminEmail}`);

    const protectedAdminIds = new Set(['admin_primary', '78']);
    (adminFacs || []).forEach(af => {
      if (af.id) {
        protectedAdminIds.add(af.id);
        protectedAdminIds.add(String(af.id));
      }
    });

    const rawTargetIds = (facultyIds || []).filter(id =>
      !protectedAdminIds.has(id) &&
      !protectedAdminIds.has(String(id)) &&
      id !== 'admin_primary' &&
      !String(id).startsWith('admin') &&
      String(id) !== '78'
    );
    
    // Normalize target IDs to handle both strings and numbers for Supabase postgrest type matching
    const expandedIds = Array.from(new Set(
      rawTargetIds.flatMap(id => {
        const str = String(id).trim();
        const num = Number(id);
        return !isNaN(num) && str !== '' ? [str, num] : [str];
      })
    ));

    if (expandedIds.length > 0) {
      // 1. Fetch all dependent QR session and OTP IDs in batch queries
      const [qrRes, otpRes] = await Promise.all([
        supabase.from('qr_sessions').select('id').in('created_by_faculty_id', expandedIds),
        supabase.from('otp').select('id').in('generated_by', expandedIds)
      ]);

      const qrIds = (qrRes.data || []).map(q => q.id);
      const otpIds = (otpRes.data || []).map(o => o.id);

      // 2. Batch delete attendance records dependent on QR or OTP sessions
      const deleteAttendanceTasks = [];
      if (qrIds.length > 0) {
        deleteAttendanceTasks.push(supabase.from('attendance').delete().in('qr_session_id', qrIds));
      }
      if (otpIds.length > 0) {
        deleteAttendanceTasks.push(supabase.from('attendance').delete().in('otp_id', otpIds));
      }
      if (deleteAttendanceTasks.length > 0) {
        await Promise.all(deleteAttendanceTasks);
      }

      // 3. Batch delete qr_sessions & otps FIRST to release FK constraints
      await Promise.all([
        supabase.from('qr_sessions').delete().in('created_by_faculty_id', expandedIds),
        supabase.from('otp').delete().in('generated_by', expandedIds)
      ]);

      // 4. Delete faculty rows AFTER child session records are completely deleted
      const { error: deleteErr } = await supabase.from('faculty').delete().in('id', expandedIds);
      if (deleteErr) {
        console.error('Error deleting faculty rows in bulk-delete:', deleteErr.message);
      }

      // 5. Clean up subjects and roles mapping in local JSON files
      try {
        const subjectsMap = loadFacultySubjectsMap();
        let mapChanged = false;
        for (const id of expandedIds) {
          if (subjectsMap[id]) {
            delete subjectsMap[id];
            mapChanged = true;
          }
        }
        if (mapChanged) {
          saveFacultySubjectsMap(subjectsMap);
        }
      } catch (e) {
        console.error('Error updating subjects map after bulk deletion:', e);
      }
    }

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'bulk_delete' });

    res.json({ success: true, message: `Successfully deleted ${rawTargetIds.length} faculty member(s).` });
  } catch (err) {
    console.error('Bulk delete faculty error:', err);
    res.status(500).json({ error: 'Failed to delete faculty members.' });
  }
});

// DELETE single faculty member (FK-Safe execution)
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Faculty ID is required.' });
  }

  const override = getAdminOverride();
  const adminEmail = (override?.email || 'admin@ljcca.edu').toLowerCase();
  const { data: adminFac } = await supabase
    .from('faculty')
    .select('id')
    .or(`email.eq.${adminEmail},username.eq.${adminEmail}`)
    .maybeSingle();

  if (id === 'admin_primary' || String(id).startsWith('admin') || String(id) === '78' || (adminFac && String(adminFac.id) === String(id))) {
    return res.status(400).json({ error: 'Primary Admin account cannot be deleted.' });
  }

  try {
    // 1. Fetch all QR session IDs created by this faculty
    const { data: qrSessions } = await supabase
      .from('qr_sessions')
      .select('id')
      .eq('created_by_faculty_id', id);
    const qrIds = (qrSessions || []).map(q => q.id);

    // 2. Fetch all OTP session IDs generated by this faculty
    const { data: otps } = await supabase
      .from('otp')
      .select('id')
      .eq('generated_by', id);
    const otpIds = (otps || []).map(o => o.id);

    // 3. Delete attendance child rows linked to these QR or OTP sessions FIRST
    if (qrIds.length > 0) {
      await supabase.from('attendance').delete().in('qr_session_id', qrIds);
    }
    if (otpIds.length > 0) {
      await supabase.from('attendance').delete().in('otp_id', otpIds);
    }

    // 4. Delete QR & OTP session parent rows
    await supabase.from('qr_sessions').delete().eq('created_by_faculty_id', id);
    await supabase.from('otp').delete().eq('generated_by', id);

    // 5. Delete faculty row from faculty table
    const { error: deleteErr } = await supabase.from('faculty').delete().eq('id', id);

    if (deleteErr) {
      console.error('Error deleting faculty row:', deleteErr);
      return res.status(400).json({ error: deleteErr.message || 'Failed to delete faculty member.' });
    }

    // 6. Clean up subjects mapping in local JSON file if exists
    try {
      const subjectsMap = loadFacultySubjectsMap();
      if (subjectsMap[id]) {
        delete subjectsMap[id];
        saveFacultySubjectsMap(subjectsMap);
      }
    } catch (e) {
      console.error('Error updating subjects map after deletion:', e);
    }

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'delete', facultyId: id });

    res.json({ success: true, message: 'Faculty member deleted successfully.' });
  } catch (err) {
    console.error('Error in DELETE /api/faculty/:id:', err);
    res.status(500).json({ error: err.message || 'Failed to delete faculty member.' });
  }
});
// POST import batch of faculty members
router.post('/import', authenticateJWT, requireAdmin, async (req, res) => {
  const { faculty: importedList } = req.body;

  if (!importedList || !Array.isArray(importedList) || importedList.length === 0) {
    return res.status(400).json({ error: 'No faculty records provided for import.' });
  }

  try {
    let successCount = 0;
    const errors = [];
    const subjectsMap = loadFacultySubjectsMap();

    // 1. Parallelize password validation & hashing across all rows
    const hashedRows = await Promise.all(importedList.map(async (fac, index) => {
      if (!fac || (!fac.name && !fac.email)) return null;

      const name = String(fac.name || 'Faculty').trim();
      const email = fac.email ? String(fac.email).trim() : `faculty_${Date.now()}_${index}@college.edu`;
      const department = fac.department ? String(fac.department).trim() : 'BCA';
      const mobile = fac.mobile ? String(fac.mobile).trim() : '0000000000';
      const rawPassword = fac.password ? String(fac.password).trim() : generatePassword();

      const valRes = validateStrongPassword(rawPassword);
      const plain_password = valRes.isValid ? rawPassword : generatePassword();
      const hashedPassword = await bcrypt.hash(plain_password, 10);

      const subjectsToSave = Array.isArray(fac.subjects) ? fac.subjects : [];
      const cleanDept = department ? String(department).split('||SUB:')[0].trim() : 'BCA';

      return {
        fac,
        name,
        email,
        department: cleanDept,
        mobile,
        plain_password,
        hashedPassword,
        subjectsToSave
      };
    }));

    const validRows = hashedRows.filter(Boolean);

    // 2. Fetch existing faculty in ONE batch query for fast in-memory matching
    const override = getAdminOverride();
    const adminEmail = (override?.email || 'admin@ljcca.edu').toLowerCase();

    const { data: existingFaculties } = await supabase.from('faculty').select('id, email, mobile, department, username');
    const emailMap = new Map();
    const mobileMap = new Map();
    const usernameSet = new Set();

    (existingFaculties || []).forEach(f => {
      if (f.email) {
        emailMap.set(String(f.email).trim().toLowerCase(), f);
      }
      if (f.username) {
        emailMap.set(String(f.username).trim().toLowerCase(), f);
        usernameSet.add(String(f.username).trim().toLowerCase());
      }
      if (f.mobile && String(f.mobile).trim() !== '0000000000') {
        mobileMap.set(String(f.mobile).trim(), f);
      }
    });

    const toInsert = [];
    const toUpdate = [];

    // 3. Build payloads in memory
    for (const item of validRows) {
      const cleanEmail = item.email.trim().toLowerCase();
      const cleanMob = item.mobile.trim();

      // NEVER import or overwrite primary admin account from CSV/XLSX file
      if (cleanEmail === adminEmail || cleanEmail === 'admin@ljcca.edu' || cleanEmail === 'admin_primary') {
        continue;
      }

      // Check if account already exists by Email or Mobile
      const existingFac = emailMap.get(cleanEmail) || (cleanMob && cleanMob !== '0000000000' ? mobileMap.get(cleanMob) : null);

      let finalUsername = item.email;
      if (usernameSet.has(finalUsername.toLowerCase()) && (!existingFac || existingFac.username?.toLowerCase() !== finalUsername.toLowerCase())) {
        const deptSlug = item.department.toLowerCase().replace(/[^a-z0-9]/g, '');
        finalUsername = `${item.email.toLowerCase()}_${deptSlug}_${Math.floor(100 + Math.random() * 900)}`;
      }
      usernameSet.add(finalUsername.toLowerCase());

      const payload = {
        name: item.name,
        email: item.email,
        department: item.department,
        mobile: item.mobile,
        username: finalUsername,
        password: item.hashedPassword,
        plain_password: item.plain_password
      };

      if (existingFac) {
        // Update existing record instead of creating duplicate account
        toUpdate.push({ id: existingFac.id, payload, subjectsToSave: item.subjectsToSave });
      } else {
        // Insert new record
        toInsert.push({ payload, subjectsToSave: item.subjectsToSave, email: item.email, dept: item.department });
      }
    }

    // 4. Batch insert new records in 1 query
    if (toInsert.length > 0) {
      const payloadsToInsert = toInsert.map(i => i.payload);
      const { data: newFacList, error: insErr } = await supabase.from('faculty').insert(payloadsToInsert).select();

      if (insErr) {
        console.error('Batch insert faculty error:', insErr);
        // Fallback or record error
        errors.push(`Bulk insert error: ${insErr.message}`);
      } else if (newFacList && newFacList.length > 0) {
        successCount += newFacList.length;
        newFacList.forEach((newFac, idx) => {
          if (toInsert[idx] && toInsert[idx].subjectsToSave) {
            subjectsMap[newFac.id] = toInsert[idx].subjectsToSave;
          }
        });
      }
    }

    // 5. Batch update existing records concurrently
    if (toUpdate.length > 0) {
      const updateResults = await Promise.allSettled(
        toUpdate.map(u => supabase.from('faculty').update(u.payload).eq('id', u.id))
      );
      updateResults.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          successCount++;
          subjectsMap[toUpdate[idx].id] = toUpdate[idx].subjectsToSave;
        } else {
          errors.push(`Update error for ID ${toUpdate[idx].id}: ${res.reason?.message}`);
        }
      });
    }

    saveFacultySubjectsMap(subjectsMap);

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'import' });

    res.json({ success: true, successCount, errors });
  } catch (err) {
    console.error('Faculty bulk import error:', err);
    res.status(500).json({ error: err.message || 'Failed to import faculty data.' });
  }
});

module.exports = router;
