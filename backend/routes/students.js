const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

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

// GET all students (Paginated loop to fetch ALL students without 1000-row limit restriction)
router.get('/', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'faculty') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    let allStudents = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunk, error } = await supabase.from('students')
        .select('id, enrollment_no, roll_no, division, name, email, course, semester, mobile, username, plain_password, device_id, locked_until')
        .range(from, from + step - 1);

      if (error) throw error;

      if (chunk && chunk.length > 0) {
        allStudents = allStudents.concat(chunk);
        from += step;
        if (chunk.length < step) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    const safeStudents = (allStudents || []).map(({ password, ...rest }) => rest);
    safeStudents.sort((a, b) => {
      const semA = parseInt(a.semester, 10) || 0;
      const semB = parseInt(b.semester, 10) || 0;
      if (semA !== semB) return semA - semB;

      const divA = (a.division || '').trim().toUpperCase();
      const divB = (b.division || '').trim().toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rollA = String(a.roll_no || '').trim();
      const rollB = String(b.roll_no || '').trim();
      if (!rollA && !rollB) return String(a.name || '').localeCompare(String(b.name || ''));
      if (!rollA) return 1;
      if (!rollB) return -1;
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });
    res.json(safeStudents);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// POST add new student
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { enrollment_no, roll_no, division, name, email, course, semester, mobile, password: customPassword } = req.body;

  if (!enrollment_no || !name || !email || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'Enrollment Number, Student Name, Email ID, Course, Semester, and Mobile are required' });
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid Email ID format (e.g. student@college.edu)' });
  }

  const cleanEnroll = String(enrollment_no).trim();
  if (!/^\d{10}$/.test(cleanEnroll)) {
    return res.status(400).json({ error: 'Please enter valid 10-digit enrollment number' });
  }

  const cleanMobile = String(mobile).trim();
  if (!/^\d{10}$/.test(cleanMobile)) {
    return res.status(400).json({ error: 'Please enter valid 10-digit mobile number' });
  }

  const cleanSem = String(semester).trim();
  const cleanDiv = division ? String(division).trim().toUpperCase() : '';
  const cleanRoll = roll_no ? String(roll_no).trim() : '';

  if (customPassword && customPassword.trim() !== '') {
    const passCheck = validateStrongPassword(customPassword);
    if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
  }

  const username = cleanEnroll.toLowerCase();
  const rawPassword = (customPassword && customPassword.trim() !== '') ? customPassword.trim() : cleanMobile;
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  try {
    // 1. Check if enrollment number already exists
    const { data: existingEnroll } = await supabase.from('students')
      .select('id, name, enrollment_no')
      .eq('enrollment_no', cleanEnroll)
      .maybeSingle();

    if (existingEnroll) {
      return res.status(400).json({ error: `Student with Enrollment Number '${cleanEnroll}' already exists (${existingEnroll.name}).` });
    }

    // 2. Check if mobile number already exists for another student
    const { data: existingMobile } = await supabase.from('students')
      .select('id, name, enrollment_no, mobile')
      .eq('mobile', cleanMobile)
      .maybeSingle();

    if (existingMobile) {
      return res.status(400).json({ error: `Mobile number '${cleanMobile}' is already registered for student ${existingMobile.name} (Enrollment: ${existingMobile.enrollment_no}).` });
    }

    // 3. Check if email already exists for another student
    if (cleanEmail) {
      const { data: existingEmail } = await supabase.from('students')
        .select('id, name, enrollment_no, email')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (existingEmail) {
        return res.status(400).json({ error: `Email ID '${cleanEmail}' is already registered for student ${existingEmail.name} (Enrollment: ${existingEmail.enrollment_no}).` });
      }
    }

    // 4. Check if Roll Number already exists in the SAME semester and SAME division
    if (cleanRoll && cleanSem) {
      let rollQuery = supabase.from('students')
        .select('id, name, enrollment_no, roll_no, semester, division')
        .eq('semester', cleanSem)
        .eq('roll_no', cleanRoll);

      if (cleanDiv) {
        rollQuery = rollQuery.ilike('division', cleanDiv);
      }

      const { data: existingRolls } = await rollQuery;
      if (existingRolls && existingRolls.length > 0) {
        const match = cleanDiv 
          ? existingRolls.find(s => (s.division || '').trim().toUpperCase() === cleanDiv)
          : existingRolls.find(s => !(s.division || '').trim());

        if (match) {
          const divLabel = cleanDiv ? `Division ${cleanDiv}` : 'General Division';
          return res.status(400).json({
            error: `Roll Number '${cleanRoll}' already exists in Semester ${cleanSem}, ${divLabel} (Assigned to: ${match.name} - ${match.enrollment_no}).`
          });
        }
      }
    }

    const newStudentObj = {
      enrollment_no: cleanEnroll,
      name: String(name).trim(),
      email: cleanEmail,
      course: String(course).trim(),
      semester: cleanSem,
      mobile: cleanMobile,
      username,
      password: hashedPassword,
      plain_password: rawPassword
    };
    if (cleanRoll) newStudentObj.roll_no = cleanRoll;
    if (cleanDiv) newStudentObj.division = cleanDiv;

    let { data: result, error } = await supabase.from('students').insert([newStudentObj]).select().single();

    if (error && (error.message?.includes('email') || error.code === '42703')) {
      console.warn('Supabase students table missing email column, retrying insert without email:', error.message);
      delete newStudentObj.email;
      const retry = await supabase.from('students').insert([newStudentObj]).select().single();
      result = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    const returnedStudent = {
      id: result.id,
      enrollment_no: cleanEnroll,
      roll_no: result.roll_no || (cleanRoll || null),
      division: result.division || (cleanDiv || null),
      name: String(name).trim(),
      course: String(course).trim(),
      semester: cleanSem,
      mobile: cleanMobile,
      username,
      plain_password: rawPassword,
      generatedPassword: rawPassword // Backward compatibility
    };

    res.status(201).json({
      message: 'Student added successfully',
      student: returnedStudent
    });
  } catch (err) {
    console.error('Error adding student:', err);
    if (err.code === 'PGRST204' || (err.message && err.message.includes('schema cache'))) {
      return res.status(400).json({
        error: "Supabase DB Error: 'division' (ya 'roll_no') column database table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE students ADD COLUMN IF NOT EXISTS roll_no TEXT;\nALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;"
      });
    }
    res.status(500).json({ error: err.message || 'Failed to add student' });
  }
});

// PUT edit student
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { roll_no, division, name, email, course, semester, mobile, resetPassword, password } = req.body;

  if (!name || !course || !semester || !mobile) {
    return res.status(400).json({ error: 'Name, Course, Semester, and Mobile are required' });
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (cleanEmail !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid Email ID format (e.g. student@college.edu)' });
  }

  const cleanMobile = String(mobile).trim();
  if (!/^\d{10}$/.test(cleanMobile)) {
    return res.status(400).json({ error: 'Please enter valid 10-digit mobile number' });
  }

  const cleanSem = String(semester).trim();
  const cleanDiv = division ? String(division).trim().toUpperCase() : '';
  const cleanRoll = roll_no ? String(roll_no).trim() : '';

  try {
    const { data: student } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // 1. Check if mobile number already belongs to another student
    const { data: existingMobile } = await supabase.from('students')
      .select('id, name, enrollment_no, mobile')
      .eq('mobile', cleanMobile)
      .neq('id', id)
      .maybeSingle();

    if (existingMobile) {
      return res.status(400).json({ error: `Mobile number '${cleanMobile}' is already registered for student ${existingMobile.name} (Enrollment: ${existingMobile.enrollment_no}).` });
    }

    // 2. Check if email already belongs to another student
    if (cleanEmail) {
      const { data: existingEmail } = await supabase.from('students')
        .select('id, name, enrollment_no, email')
        .ilike('email', cleanEmail)
        .neq('id', id)
        .maybeSingle();

      if (existingEmail) {
        return res.status(400).json({ error: `Email ID '${cleanEmail}' is already registered for student ${existingEmail.name} (Enrollment: ${existingEmail.enrollment_no}).` });
      }
    }

    // 3. Check if Roll Number already exists in the SAME semester and SAME division for another student
    if (cleanRoll && cleanSem) {
      let rollQuery = supabase.from('students')
        .select('id, name, enrollment_no, roll_no, semester, division')
        .eq('semester', cleanSem)
        .eq('roll_no', cleanRoll)
        .neq('id', id);

      if (cleanDiv) {
        rollQuery = rollQuery.ilike('division', cleanDiv);
      }

      const { data: existingRolls } = await rollQuery;
      if (existingRolls && existingRolls.length > 0) {
        const match = cleanDiv 
          ? existingRolls.find(s => (s.division || '').trim().toUpperCase() === cleanDiv)
          : existingRolls.find(s => !(s.division || '').trim());

        if (match) {
          const divLabel = cleanDiv ? `Division ${cleanDiv}` : 'General Division';
          return res.status(400).json({
            error: `Roll Number '${cleanRoll}' already exists in Semester ${cleanSem}, ${divLabel} (Assigned to: ${match.name} - ${match.enrollment_no}).`
          });
        }
      }
    }

    let updateObj = {
      name: String(name).trim(),
      email: cleanEmail,
      course: String(course).trim(),
      semester: cleanSem,
      mobile: cleanMobile
    };
    if (student.hasOwnProperty('roll_no') || cleanRoll !== '') {
      updateObj.roll_no = cleanRoll !== '' ? cleanRoll : null;
    }
    if (student.hasOwnProperty('division') || cleanDiv !== '') {
      updateObj.division = cleanDiv !== '' ? cleanDiv : null;
    }
    let newPassword = null;

    if (password && password.trim() !== '') {
      newPassword = password.trim();
      const passCheck = validateStrongPassword(newPassword);
      if (!passCheck.isValid) return res.status(400).json({ error: passCheck.error });
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    } else if (resetPassword) {
      newPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateObj.password = hashedPassword;
      updateObj.plain_password = newPassword;
    }

    let { error } = await supabase.from('students').update(updateObj).eq('id', id);

    if (error && (error.message?.includes('email') || error.code === '42703')) {
      console.warn('Supabase students table missing email column, retrying update without email:', error.message);
      delete updateObj.email;
      const retry = await supabase.from('students').update(updateObj).eq('id', id);
      error = retry.error;
    }

    if (error) throw error;

    res.json({
      message: 'Student updated successfully',
      student: {
        id: student.id,
        enrollment_no: student.enrollment_no,
        roll_no: updateObj.roll_no !== undefined ? updateObj.roll_no : student.roll_no,
        division: updateObj.division !== undefined ? updateObj.division : student.division,
        name: updateObj.name,
        email: updateObj.email !== undefined ? updateObj.email : student.email,
        course: updateObj.course,
        semester: updateObj.semester,
        mobile: updateObj.mobile,
        username: student.username,
        device_id: updateObj.device_id !== undefined ? updateObj.device_id : student.device_id,
        plain_password: newPassword || student.plain_password,
        generatedPassword: newPassword // Will be null if not reset/modified
      }
    });
  } catch (err) {
    console.error('Error updating student:', err);
    if (err.code === 'PGRST204' || (err.message && err.message.includes('schema cache'))) {
      return res.status(400).json({
        error: "Supabase DB Error: 'division' (ya 'roll_no') column database table me nahi hai.\n\nKripya Supabase Dashboard -> SQL Editor me ye command run karein:\n\nALTER TABLE students ADD COLUMN IF NOT EXISTS roll_no TEXT;\nALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;"
      });
    }
    res.status(500).json({ error: err.message || 'Failed to update student' });
  }
});

// POST bulk reset student device IDs (Must be defined BEFORE /:id/reset-device)
router.post('/bulk-reset-device', authenticateJWT, requireAdmin, async (req, res) => {
  const { studentIds, resetAll } = req.body;
  
  try {
    if (resetAll || !studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      const { error } = await supabase
        .from('students')
        .update({ device_id: null, locked_until: null })
        .not('id', 'is', null);

      if (error) throw error;
      return res.json({ success: true, message: 'All student device bindings & lockouts reset successfully!' });
    }

    const chunkSize = 500;
    for (let i = 0; i < studentIds.length; i += chunkSize) {
      const chunk = studentIds.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('students')
        .update({ device_id: null, locked_until: null })
        .in('id', chunk);

      if (error) throw error;
    }

    res.json({ success: true, message: `Device binding & lockout reset successfully for ${studentIds.length} student(s)!` });
  } catch (err) {
    console.error('Bulk reset device binding error:', err);
    res.status(500).json({ error: err.message || 'Failed to reset student device bindings.' });
  }
});

// POST reset single student device ID
router.post('/:id/reset-device', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: student } = await supabase.from('students').select('id, name, enrollment_no').eq('id', id).maybeSingle();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const { error } = await supabase.from('students').update({ device_id: null, locked_until: null }).eq('id', id);
    if (error) throw error;
    res.json({
      success: true,
      message: `Device ID for ${student.name} (${student.enrollment_no}) reset successfully. Student can now log in from a new device.`
    });
  } catch (err) {
    console.error('Error resetting device ID:', err);
    res.status(500).json({ error: err.message || 'Failed to reset device ID' });
  }
});
router.put('/:id/reset-device', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase.from('students').update({ device_id: null, locked_until: null }).eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Device binding & lockout reset successfully!' });
  } catch (err) {
    console.error('Reset device binding error:', err);
    res.status(500).json({ error: err.message || 'Failed to reset student device binding.' });
  }
});

// POST import batch of students (High Performance Batch Validation & Insert)
router.post('/import', authenticateJWT, requireAdmin, async (req, res) => {
  const { students: importedList } = req.body;
  const passwordHashCache = new Map();

  if (!importedList || !Array.isArray(importedList) || importedList.length === 0) {
    return res.status(400).json({ error: 'Invalid data format. Non-empty array of students expected.' });
  }

  try {
    // 1. Fetch all existing students from DB for duplicate checking
    let allDbStudents = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: chunk, error: fetchErr } = await supabase.from('students')
        .select('id, enrollment_no, roll_no, division, semester, mobile, email, name')
        .range(from, from + step - 1);
      if (fetchErr) throw fetchErr;
      if (chunk && chunk.length > 0) {
        allDbStudents = allDbStudents.concat(chunk);
        from += step;
        if (chunk.length < step) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    const dbEnrollMap = new Map();
    const dbMobileMap = new Map();
    const dbEmailMap = new Map();
    const dbRollMap = new Map();

    for (const s of allDbStudents) {
      if (s.enrollment_no) dbEnrollMap.set(String(s.enrollment_no).trim(), s);
      if (s.mobile) dbMobileMap.set(String(s.mobile).trim(), s);
      if (s.email && String(s.email).trim()) dbEmailMap.set(String(s.email).trim().toLowerCase(), s);
      if (s.roll_no && s.semester) {
        const key = `${String(s.semester).trim()}__${String(s.division || '').trim().toUpperCase()}__${String(s.roll_no).trim()}`;
        dbRollMap.set(key, s);
      }
    }

    const fileEnrollMap = new Map();
    const fileMobileMap = new Map();
    const fileEmailMap = new Map();
    const fileRollMap = new Map();

    const validRows = [];
    const errors = [];

    for (let i = 0; i < importedList.length; i++) {
      const student = importedList[i];
      const rowNum = i + 1;
      const name = String(student.name || '').trim();
      const rawEnroll = student.enrollment_no;
      const rawMobile = student.mobile;
      const rawEmail = student.email;
      const rawSem = student.semester;
      const rawDiv = student.division;
      const rawRoll = student.roll_no;
      const rawCourse = student.course;

      if (!rawEnroll || !name || !rawCourse || !rawSem || !rawMobile) {
        errors.push(`Row ${rowNum} (${name || 'Unnamed'}): Missing required fields (Enrollment No, Name, Course, Semester, or Mobile).`);
        continue;
      }

      let cleanEnroll = String(rawEnroll).trim();
      if (cleanEnroll.includes('.') || cleanEnroll.includes('e') || cleanEnroll.includes('E')) {
        const num = Number(cleanEnroll);
        if (!isNaN(num)) cleanEnroll = Math.round(num).toString();
      }
      cleanEnroll = cleanEnroll.replace(/\D/g, '');

      if (!cleanEnroll || !/^\d{10}$/.test(cleanEnroll)) {
        errors.push(`Row ${rowNum} (${name}): Invalid Enrollment Number "${rawEnroll}". Enrollment number must be exactly 10 digits.`);
        continue;
      }

      let cleanMobile = String(rawMobile).trim().replace(/\D/g, '');
      if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
        errors.push(`Row ${rowNum} (${name}): Invalid Mobile Number "${rawMobile}". Mobile number must be exactly 10 digits.`);
        continue;
      }

      const cleanEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.push(`Row ${rowNum} (${name}): Invalid Email ID format "${rawEmail}".`);
        continue;
      }

      const cleanSem = String(rawSem).trim();
      const cleanDiv = rawDiv ? String(rawDiv).trim().toUpperCase() : '';
      const cleanRoll = rawRoll ? String(rawRoll).trim() : '';

      // Check 1: In-file duplicate Enrollment No
      if (fileEnrollMap.has(cleanEnroll)) {
        const prev = fileEnrollMap.get(cleanEnroll);
        errors.push(`Row ${rowNum} (${name}): Duplicate Enrollment Number '${cleanEnroll}' in file (Same as Row ${prev.rowNum} - ${prev.name}).`);
        continue;
      }

      // Check 2: In-file duplicate Mobile No
      if (fileMobileMap.has(cleanMobile)) {
        const prev = fileMobileMap.get(cleanMobile);
        errors.push(`Row ${rowNum} (${name}): Duplicate Mobile Number '${cleanMobile}' in file (Same as Row ${prev.rowNum} - ${prev.name}).`);
        continue;
      }

      // Check 3: In-file duplicate Email ID
      if (cleanEmail && fileEmailMap.has(cleanEmail)) {
        const prev = fileEmailMap.get(cleanEmail);
        errors.push(`Row ${rowNum} (${name}): Duplicate Email ID '${cleanEmail}' in file (Same as Row ${prev.rowNum} - ${prev.name}).`);
        continue;
      }

      // Check 4: In-file duplicate Roll No in same Semester & Division
      if (cleanRoll && cleanSem) {
        const rollKey = `${cleanSem}__${cleanDiv}__${cleanRoll}`;
        if (fileRollMap.has(rollKey)) {
          const prev = fileRollMap.get(rollKey);
          const divLabel = cleanDiv ? `Division ${cleanDiv}` : 'General Division';
          errors.push(`Row ${rowNum} (${name}): Duplicate Roll Number '${cleanRoll}' in Semester ${cleanSem}, ${divLabel} in file (Same as Row ${prev.rowNum} - ${prev.name}).`);
          continue;
        }
        fileRollMap.set(rollKey, { rowNum, name });
      }

      fileEnrollMap.set(cleanEnroll, { rowNum, name });
      fileMobileMap.set(cleanMobile, { rowNum, name });
      if (cleanEmail) fileEmailMap.set(cleanEmail, { rowNum, name });

      // Check 5: Database duplicate Enrollment No
      if (dbEnrollMap.has(cleanEnroll)) {
        const existing = dbEnrollMap.get(cleanEnroll);
        errors.push(`Row ${rowNum} (${name}): Enrollment Number '${cleanEnroll}' already exists in database for student '${existing.name}'.`);
        continue;
      }

      // Check 6: Database duplicate Mobile No
      if (dbMobileMap.has(cleanMobile)) {
        const existing = dbMobileMap.get(cleanMobile);
        errors.push(`Row ${rowNum} (${name}): Mobile Number '${cleanMobile}' is already registered in database for student '${existing.name}' (Enrollment: ${existing.enrollment_no}).`);
        continue;
      }

      // Check 7: Database duplicate Email ID
      if (cleanEmail && dbEmailMap.has(cleanEmail)) {
        const existing = dbEmailMap.get(cleanEmail);
        errors.push(`Row ${rowNum} (${name}): Email ID '${cleanEmail}' is already registered in database for student '${existing.name}' (Enrollment: ${existing.enrollment_no}).`);
        continue;
      }

      // Check 8: Database duplicate Roll No in same Semester & Division
      if (cleanRoll && cleanSem) {
        const rollKey = `${cleanSem}__${cleanDiv}__${cleanRoll}`;
        if (dbRollMap.has(rollKey)) {
          const existing = dbRollMap.get(rollKey);
          const divLabel = cleanDiv ? `Division ${cleanDiv}` : 'General Division';
          errors.push(`Row ${rowNum} (${name}): Roll Number '${cleanRoll}' already exists in Semester ${cleanSem}, ${divLabel} in database for student '${existing.name}' (Enrollment: ${existing.enrollment_no}).`);
          continue;
        }
      }

      const username = cleanEnroll.toLowerCase();
      const rawPassword = cleanMobile;
      if (!passwordHashCache.has(rawPassword)) {
        passwordHashCache.set(rawPassword, bcrypt.hashSync(rawPassword, 4));
      }
      const hashedPassword = passwordHashCache.get(rawPassword);

      const importObj = {
        enrollment_no: cleanEnroll,
        name,
        course: String(rawCourse).trim(),
        semester: cleanSem,
        mobile: cleanMobile,
        username,
        password: hashedPassword,
        plain_password: rawPassword
      };
      if (cleanEmail) importObj.email = cleanEmail;
      if (cleanRoll) importObj.roll_no = cleanRoll;
      if (cleanDiv) importObj.division = cleanDiv;

      validRows.push(importObj);
    }

    // If there are ANY errors or duplicate conflicts, reject the entire import and return descriptive errors
    if (errors.length > 0) {
      return res.status(400).json({
        error: `Bulk Upload failed: ${errors.length} duplicate/validation issue(s) detected. No records were saved.`,
        errors,
        totalErrors: errors.length
      });
    }

    // High performance chunked insertion
    const chunkSize = 500;
    let successCount = 0;
    for (let c = 0; c < validRows.length; c += chunkSize) {
      const chunk = validRows.slice(c, c + chunkSize);
      let { error: insertErr } = await supabase.from('students').insert(chunk);

      if (insertErr && (insertErr.message?.includes('email') || insertErr.code === '42703')) {
        const sanitizedChunk = chunk.map(({ email, ...rest }) => rest);
        const retry = await supabase.from('students').insert(sanitizedChunk);
        insertErr = retry.error;
      }

      if (insertErr) {
        console.error('Batch insert chunk error:', insertErr);
        throw insertErr;
      }
      successCount += chunk.length;
    }

    res.json({
      message: `Successfully imported ${successCount} student records!`,
      successCount
    });
  } catch (err) {
    console.error('Import process error:', err);
    res.status(500).json({ error: err.message || 'Failed to process student import batch.' });
  }
});

// POST bulk delete students (Sequential FK-Safe Chunked Execution for Unlimited Students)
router.post('/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
  const { studentIds } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: 'No student IDs provided for deletion.' });
  }

  try {
    const idSet = new Set();
    studentIds.forEach(id => {
      idSet.add(id);
      idSet.add(String(id));
      if (!isNaN(Number(id))) idSet.add(Number(id));
    });
    const allIds = Array.from(idSet);

    // Process in batches of 500 to handle thousands of records safely without payload or Postgres IN-clause limits
    const chunkSize = 500;
    for (let i = 0; i < allIds.length; i += chunkSize) {
      const chunkIds = allIds.slice(i, i + chunkSize);

      // 1. Fetch enrollment numbers for chunk students
      const { data: targetStudents } = await supabase.from('students').select('id, enrollment_no').in('id', chunkIds);
      const enrollments = (targetStudents || []).map(s => s.enrollment_no).filter(Boolean);

      // 2. Delete attendance child rows FIRST
      try {
        await supabase.from('attendance').delete().in('student_id', chunkIds);
        if (enrollments.length > 0) {
          await supabase.from('attendance').delete().in('enrollment_no', enrollments);
        }
      } catch (attErr) {
        console.warn('Attendance bulk cleanup warning:', attErr.message);
      }

      // 3. Delete parent rows from students table
      const { error: stuErr } = await supabase.from('students').delete().in('id', chunkIds);
      if (stuErr) {
        console.error('Bulk delete student chunk error:', stuErr);
        return res.status(400).json({ error: stuErr.message || 'Failed to delete selected students.' });
      }
    }

    res.json({ success: true, message: `Successfully deleted ${studentIds.length} student(s).` });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete selected students.' });
  }
});

// DELETE single student (Sequential FK-Safe Execution)
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const idSet = new Set([id, String(id)]);
    if (!isNaN(Number(id))) idSet.add(Number(id));
    const targetIds = Array.from(idSet);

    // 1. Fetch student enrollment_no if present
    const { data: studentObj } = await supabase.from('students').select('id, enrollment_no').in('id', targetIds).maybeSingle();
    const enrollNo = studentObj ? studentObj.enrollment_no : null;

    // 2. Delete attendance child rows FIRST to avoid foreign key violation
    try {
      await supabase.from('attendance').delete().in('student_id', targetIds);
      if (enrollNo) {
        await supabase.from('attendance').delete().eq('enrollment_no', enrollNo);
      }
    } catch (attErr) {
      console.warn('Attendance cleanup warning:', attErr.message);
    }

    // 3. Delete parent student row from database
    const { error: stuError } = await supabase.from('students').delete().in('id', targetIds);
    if (stuError) {
      console.error('Error deleting student:', stuError);
      return res.status(400).json({ error: stuError.message || 'Failed to delete student' });
    }

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: err.message || 'Failed to delete student' });
  }
});

// POST promote all students to next semester (Sem 1..7 -> +1, Sem 8 -> Delete)
router.post('/promote', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    let allStudents = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunk, error } = await supabase.from('students')
        .select('id, enrollment_no, semester')
        .range(from, from + step - 1);

      if (error) throw error;
      if (chunk && chunk.length > 0) {
        allStudents = allStudents.concat(chunk);
        from += step;
        if (chunk.length < step) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    if (!allStudents || allStudents.length === 0) {
      return res.status(400).json({ error: 'No student accounts found to promote.' });
    }

    const sem8StudentIds = [];
    const sem8Enrollments = [];
    const promoMap = {}; // semNum -> array of student IDs

    allStudents.forEach(s => {
      const semNum = parseInt(String(s.semester || '').replace(/\D/g, ''), 10);
      if (semNum >= 8) {
        sem8StudentIds.push(s.id);
        if (s.enrollment_no) sem8Enrollments.push(s.enrollment_no);
      } else if (!isNaN(semNum) && semNum >= 1 && semNum < 8) {
        if (!promoMap[semNum]) promoMap[semNum] = [];
        promoMap[semNum].push(s.id);
      }
    });

    let graduatedCount = 0;
    let promotedCount = 0;

    // Delete Sem 8 students and their attendance records
    if (sem8StudentIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < sem8StudentIds.length; i += chunkSize) {
        const chunkIds = sem8StudentIds.slice(i, i + chunkSize);
        const chunkEnrollments = sem8Enrollments.slice(i, i + chunkSize);

        try {
          await supabase.from('attendance').delete().in('student_id', chunkIds);
          if (chunkEnrollments.length > 0) {
            await supabase.from('attendance').delete().in('enrollment_no', chunkEnrollments);
          }
        } catch (attErr) {
          console.warn('Attendance sem 8 cleanup warning:', attErr.message);
        }

        await supabase.from('students').delete().in('id', chunkIds);
      }
      graduatedCount = sem8StudentIds.length;
    }

    // Promote Sem 7 to 8, 6 to 7, ... 1 to 2 (descending order to avoid overlap)
    for (let sem = 7; sem >= 1; sem--) {
      const idsToPromote = promoMap[sem];
      if (idsToPromote && idsToPromote.length > 0) {
        const nextSemStr = String(sem + 1);
        const chunkSize = 500;
        for (let i = 0; i < idsToPromote.length; i += chunkSize) {
          const chunkIds = idsToPromote.slice(i, i + chunkSize);
          await supabase.from('students').update({ semester: nextSemStr }).in('id', chunkIds);
        }
        promotedCount += idsToPromote.length;
      }
    }

    // Completely clear all old QR sessions, OTP codes, and live attendance logs on promotion so session trackers restart 100% fresh for the new term
    try {
      await supabase.from('attendance').delete().not('id', 'is', null);
      await supabase.from('qr_sessions').delete().not('id', 'is', null);
      await supabase.from('otp').delete().not('id', 'is', null);
    } catch (cleanErr) {
      console.warn('Warning clearing old sessions on promotion:', cleanErr.message);
    }

    res.json({
      success: true,
      promotedCount,
      graduatedCount,
      message: `Successfully promoted ${promotedCount} student(s) to the next semester! ${graduatedCount > 0 ? `${graduatedCount} Semester 8 student(s) graduated & removed.` : ''}`
    });
  } catch (err) {
    console.error('Promotion error:', err);
    res.status(500).json({ error: err.message || 'Failed to promote students.' });
  }
});

module.exports = router;



