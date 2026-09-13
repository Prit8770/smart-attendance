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

// GET all faculty
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { data: faculty, error } = await supabase.from('faculty').select('*');
    if (error) throw error;

    const subjectsMap = loadFacultySubjectsMap();
    const rolesMap = loadFacultyRolesMap();
    const override = getAdminOverride();

    const adminEmail = (override?.email || 'admin@ljcca.edu').toLowerCase();
    const adminName = override?.name || 'Administrative';
    const adminMobile = override?.mobile || '9510479002';

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

      const fileSubjects = subjectsMap[f.id] || subjectsMap[f.employee_no] || subjectsMap[String(f.id)] || subjectsMap[String(f.employee_no)] || [];
      const subMap = new Map();
      const mergeSub = (s) => {
        if (!s || (!s.subjectName && !s.name)) return;
        const name = String(s.subjectName || s.name).trim();
        const sem = String(s.semester || '1').replace(/\D/g, '') || '1';
        const key = `${name.toLowerCase()}_sem_${sem}`;
        const existing = subMap.get(key) || {};
        const mergedCode = (s.code || s.subjectCode || s.subject_code || s.subCode || existing.code || existing.subjectCode || '').toString().trim();
        const mergedShort = (s.shortName || s.shortCode || existing.shortName || '').toString().trim();
        const mergedType = (s.type || s.subjectType || existing.type || 'Theory').toString().trim();
        subMap.set(key, {
          ...existing,
          ...s,
          subjectName: name,
          shortName: mergedShort,
          code: mergedCode,
          subjectCode: mergedCode,
          semester: sem,
          type: mergedType
        });
      };
      const hasFileRecord = subjectsMap[f.id] !== undefined || subjectsMap[String(f.id)] !== undefined || (f.employee_no && subjectsMap[f.employee_no] !== undefined) || (f.email && subjectsMap[f.email.toLowerCase()] !== undefined);
      if (hasFileRecord) {
        if (Array.isArray(fileSubjects)) fileSubjects.forEach(mergeSub);
      } else {
        if (Array.isArray(embeddedSubjects)) embeddedSubjects.forEach(mergeSub);
      }
      const finalSubjects = Array.from(subMap.values());
      const fRoles = rolesMap[f.id] || rolesMap[String(f.id)] || (f.email ? rolesMap[f.email.toLowerCase()] : null) || (f.username ? rolesMap[f.username.toLowerCase()] : null) || (f.employee_no ? rolesMap[f.employee_no] : null) || (f.role === 'admin' ? ['admin', 'faculty'] : ['faculty']);

      const isThisAdmin = (f.email && f.email.toLowerCase() === adminEmail) || (f.username && f.username.toLowerCase() === adminEmail) || String(f.id) === '78';
      const assignedAdminRoles = rolesMap['admin_primary'] || rolesMap[adminEmail] || rolesMap['78'] || (Array.isArray(fRoles) ? fRoles : ['admin', 'faculty']);

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

    // Auto-include Admin as a primary faculty member so they automatically appear in faculty options
    const hasAdminInFaculty = formatted.some(f => f.isPrimaryAdmin || (f.email && f.email.toLowerCase() === adminEmail) || (f.username && f.username.toLowerCase() === adminEmail));
    if (!hasAdminInFaculty) {
      const adminSubs = subjectsMap['admin_primary'] || subjectsMap[adminEmail] || [];
      const assignedAdminRoles = rolesMap['admin_primary'] || rolesMap[adminEmail] || ['admin', 'faculty'];
      const adminFacultyRecord = {
        id: 'admin_primary',
        employee_no: 'ADMIN-01',
        name: adminName,
        email: adminEmail,
        department: 'BCA',
        mobile: adminMobile,
        username: adminEmail,
        roles: assignedAdminRoles,
        isPrimaryAdmin: true,
        plain_password: 'Uses Admin Account (No separate password needed)',
        subjects: Array.isArray(adminSubs) ? adminSubs : []
      };
      formatted.unshift(adminFacultyRecord);
    } else {
      // Sort primary admin to the very top
      formatted.sort((a, b) => (b.isPrimaryAdmin ? 1 : 0) - (a.isPrimaryAdmin ? 1 : 0));
    }

    res.json(formatted);
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

  // Encode subjects inside department string as DB fallback
  const cleanDeptName = String(department).split('||SUB:')[0].trim();
  const encodedDepartment = cleanSubjects.length > 0 
    ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
    : cleanDeptName;

  try {
    // Check if email or username already exists
    const { data: existing } = await supabase.from('faculty')
      .select('id')
      .or(`email.eq.${cleanEmail},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Faculty with this Email ID already exists' });
    }

    let insertObj = {
      name,
      department: encodedDepartment,
      mobile,
      username,
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

    // Save subjects in persistent map
    const map = loadFacultySubjectsMap();
    if (result && result.id) map[result.id] = cleanSubjects;
    if (result && result.id) map[String(result.id)] = cleanSubjects;
    if (employee_no) {
      map[employee_no] = cleanSubjects;
      map[String(employee_no)] = cleanSubjects;
    }
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
    const encodedDepartment = cleanSubjects.length > 0 
      ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
      : cleanDeptName;

    await supabase.from('faculty').update({ department: encodedDepartment }).eq('id', facultyId);

    // Save in persistent JSON map
    const map = loadFacultySubjectsMap();
    map[facultyId] = cleanSubjects;
    map[String(facultyId)] = cleanSubjects;
    if (faculty.employee_no) {
      map[faculty.employee_no] = cleanSubjects;
      map[String(faculty.employee_no)] = cleanSubjects;
    }
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

    // Also update row in Supabase faculty table (id 78) if it exists
    const encodedAdminDept = cleanSubjects.length > 0 
      ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
      : cleanDeptName;
    try {
      await supabase.from('faculty').update({
        name: override.name || 'Administrative',
        department: encodedAdminDept,
        mobile: override.mobile || '9510479002'
      }).or(`id.eq.78,email.eq.${adminEmail}`);
    } catch(e) {}

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
  const encodedDepartment = cleanSubjects.length > 0 
    ? `${cleanDeptName}||SUB:${JSON.stringify(cleanSubjects)}||`
    : cleanDeptName;

  try {
    const { data: faculty } = await supabase.from('faculty').select('*').eq('id', id).maybeSingle();
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty member not found' });
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

    // Save subjects in persistent map
    const map = loadFacultySubjectsMap();
    map[id] = cleanSubjects;
    map[String(id)] = cleanSubjects;
    if (faculty.employee_no) {
      map[faculty.employee_no] = cleanSubjects;
      map[String(faculty.employee_no)] = cleanSubjects;
    }
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
      const encodedDept = remainingSubs.length > 0 ? `${cleanDept}||SUB:${JSON.stringify(remainingSubs)}||` : cleanDept;
      try {
        await supabase.from('faculty').update({ department: encodedDept }).or(`id.eq.78,email.eq.${adminEmail}`);
      } catch (e) {}
    } else if (facultyRow) {
      const cleanDept = String(facultyRow.department || 'BCA').split('||SUB:')[0].trim();
      const encodedDept = remainingSubs.length > 0 ? `${cleanDept}||SUB:${JSON.stringify(remainingSubs)}||` : cleanDept;
      await supabase.from('faculty').update({ department: encodedDept }).eq('id', id);
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
    const targetIds = (facultyIds || []).filter(id => id !== 'admin_primary' && !String(id).startsWith('admin') && String(id) !== '78');
    for (const id of targetIds) {
      const { data: qrSessions } = await supabase.from('qr_sessions').select('id').eq('created_by_faculty_id', id);
      const qrIds = (qrSessions || []).map(q => q.id);

      const { data: otps } = await supabase.from('otp').select('id').eq('generated_by', id);
      const otpIds = (otps || []).map(o => o.id);

      if (qrIds.length > 0) {
        await supabase.from('attendance').delete().in('qr_session_id', qrIds);
      }
      if (otpIds.length > 0) {
        await supabase.from('attendance').delete().in('otp_id', otpIds);
      }

      await supabase.from('qr_sessions').delete().eq('created_by_faculty_id', id);
      await supabase.from('otp').delete().eq('generated_by', id);
      await supabase.from('faculty').delete().eq('id', id);
    }

    // Emit real-time synchronization event
    notifyChange('FACULTY_CHANGED', { action: 'bulk_delete' });

    res.json({ success: true, message: `Successfully deleted ${facultyIds.length} faculty member(s).` });
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

  if (id === 'admin_primary' || String(id).startsWith('admin') || String(id) === '78') {
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

    for (const fac of importedList) {
      if (!fac.name && !fac.email) continue;

      const name = String(fac.name || 'Faculty').trim();
      const email = fac.email ? String(fac.email).trim() : `faculty_${Date.now()}@college.edu`;
      const department = fac.department ? String(fac.department).trim() : 'BCA';
      const mobile = fac.mobile ? String(fac.mobile).trim() : '0000000000';
      const rawPassword = fac.password ? String(fac.password).trim() : generatePassword();

      const valRes = validateStrongPassword(rawPassword);
      const plain_password = valRes.isValid ? rawPassword : generatePassword();

      const hashedPassword = await bcrypt.hash(plain_password, 10);

      let subjectsToSave = [];
      if (Array.isArray(fac.subjects)) {
        subjectsToSave = fac.subjects;
      }

      const encodedDept = `${department}||SUB:${JSON.stringify(subjectsToSave)}||`;

      const employee_no = String(fac.employee_no || fac.employeeNo || `EMP${String(Date.now()).slice(-6)}${Math.floor(100 + Math.random() * 900)}`).trim();

      const { data: existing } = await supabase.from('faculty').select('id').eq('email', email).maybeSingle();

      const payload = {
        name,
        email,
        department: encodedDept,
        mobile,
        username: email,
        password: hashedPassword,
        plain_password
      };

      if (existing) {
        await supabase.from('faculty').update(payload).eq('id', existing.id);
        subjectsMap[existing.id] = subjectsToSave;
      } else {
        const { data: newFac, error: insErr } = await supabase.from('faculty').insert([payload]).select().single();

        if (insErr) {
          errors.push(`Email ${email}: ${insErr.message}`);
          continue;
        }

        if (newFac) {
          subjectsMap[newFac.id] = subjectsToSave;
        }
      }

      successCount++;
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
