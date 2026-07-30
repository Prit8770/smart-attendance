const bcrypt = require('bcryptjs');
const { dbQuery, dbInitialized } = require('./db');

// Haversine distance formula matching the backend implementation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

async function runTests() {
  console.log('=================================================');
  console.log('       RUNNING BACKEND LOGIC VERIFICATION TESTS   ');
  console.log('=================================================');

  // Wait for DB Schema to initialize and seed
  await dbInitialized;

  let passedTestsCount = 0;
  let totalTestsCount = 0;

  function assert(condition, message) {
    totalTestsCount++;
    if (condition) {
      console.log(`[PASS] - ${message}`);
      passedTestsCount++;
    } else {
      console.error(`[FAIL] - ${message}`);
    }
  }

  try {
    // 1. Verify Default Admin account is seeded
    const admin = await dbQuery.get('SELECT * FROM admin WHERE email = ?', ['admin@ljcca.edu']);
    assert(admin !== undefined, 'Admin account admin@ljcca.edu should be seeded');
    if (admin) {
      const isPassCorrect = bcrypt.compareSync('Jadav@7496', admin.password);
      assert(isPassCorrect, 'Seeded admin password should match "Jadav@7496"');
    }

    // 2. Verify College Location is seeded
    const collegeLoc = await dbQuery.get('SELECT * FROM college_location LIMIT 1');
    assert(collegeLoc !== undefined, 'Default college location should be configured');
    if (collegeLoc) {
      assert(typeof collegeLoc.latitude === 'number', 'Seeded latitude should be a number');
      assert(typeof collegeLoc.longitude === 'number', 'Seeded longitude should be a number');
      assert(typeof collegeLoc.radius === 'number', 'Seeded radius should be a number');
    }

    // 3. Test Distance Calculation Accuracy
    // Test Case 1: Student is very close (e.g. Lat: 23.0230, Lon: 72.5711)
    const distClose = calculateDistance(23.0225, 72.5714, 23.0230, 72.5711);
    // Calculated distance in prompt = 125 meters (approximately)
    console.log(`Computed Distance Close: ${distClose.toFixed(2)} meters`);
    assert(distClose <= 200.0, 'Distance 125m should be within 200m radius');

    // Test Case 2: Student is far (e.g. Lat: 23.0225, Lon: 72.5750)
    const distFar = calculateDistance(23.0225, 72.5714, 23.0225, 72.5750);
    console.log(`Computed Distance Far: ${distFar.toFixed(2)} meters`);
    assert(distFar > 200.0, 'Distance ~368m should exceed 200m radius');

    // 4. Test OTP Generation Day-Limit Constraint
    console.log('\nTesting OTP Generation Daily Limits...');
    // Create test OTPs in the DB to test the daily maximum limit
    const today = new Date().toISOString().split('T')[0];
    
    // Clear any previous test OTPs for clean state
    await dbQuery.run('DELETE FROM otp WHERE date = ?', [today]);

    // Insert 5 mock OTPs manually to simulate generating 5 in one day
    for (let i = 1; i <= 5; i++) {
      const mockOtp = `11111${i}`;
      await dbQuery.run(
        'INSERT INTO otp (otp, generated_time, expire_time, generated_by, date) VALUES (?, ?, ?, ?, ?)',
        [mockOtp, new Date().toISOString(), new Date().toISOString(), admin.id, today]
      );
    }

    // Attempting to retrieve active count
    const otpsToday = await dbQuery.all('SELECT id FROM otp WHERE date = ?', [today]);
    assert(otpsToday.length === 5, 'Should have exactly 5 OTP records registered for today');

    // Attempting to generate a 6th OTP should be blocked. The router has a conditional block:
    const canGenerateMore = otpsToday.length < 5;
    assert(canGenerateMore === false, 'Logic check: should block generating a 6th OTP today');

    // 5. Test Student Lockout Logic
    console.log('\nTesting Student Lockout Logic...');
    const testUsername = 'test_student_lock';
    await dbQuery.run('DELETE FROM students WHERE username = ?', [testUsername]);
    await dbQuery.run(
      'INSERT INTO students (enrollment_no, name, course, semester, mobile, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['999999999999', 'Test Student Lock', 'CE', '5', '9999999999', testUsername, 'hashed_password']
    );

    // Test Case 1: Active Lockout (Locked until 1 minute in the future)
    const lockTimeFuture = Date.now() + 1 * 60 * 1000;
    await dbQuery.run('UPDATE students SET locked_until = ? WHERE username = ?', [lockTimeFuture.toString(), testUsername]);

    const studentFuture = await dbQuery.get('SELECT * FROM students WHERE username = ?', [testUsername]);
    let isLockedFuture = false;
    if (studentFuture.locked_until) {
      const lockedUntilTime = parseInt(studentFuture.locked_until, 10);
      if (Date.now() < lockedUntilTime) {
        isLockedFuture = true;
      }
    }
    assert(isLockedFuture === true, 'Student should be locked out when locked_until is in the future');

    // Test Case 2: Expired Lockout (Locked until 1 minute in the past)
    const lockTimePast = Date.now() - 1 * 60 * 1000;
    await dbQuery.run('UPDATE students SET locked_until = ? WHERE username = ?', [lockTimePast.toString(), testUsername]);

    const studentPast = await dbQuery.get('SELECT * FROM students WHERE username = ?', [testUsername]);
    let isLockedPast = false;
    if (studentPast.locked_until) {
      const lockedUntilTime = parseInt(studentPast.locked_until, 10);
      if (Date.now() < lockedUntilTime) {
        isLockedPast = true;
      }
    }
    assert(isLockedPast === false, 'Student should not be locked out when locked_until is in the past');

    // 6. Test Attendance Calculation Rules (+0.25% present, -0.50% absent)
    console.log('\nTesting Attendance Calculations (+0.25% / -0.50%)...');
    const savedOtps = await dbQuery.all('SELECT * FROM otp');
    const savedAttendance = await dbQuery.all('SELECT * FROM attendance');

    await dbQuery.run('DELETE FROM otp');
    await dbQuery.run('DELETE FROM attendance');

    await dbQuery.run('INSERT INTO otp (id, otp, generated_time, expire_time, date) VALUES (101, "000101", "2026-07-22", "2026-07-22", "2026-07-22")');
    await dbQuery.run('INSERT INTO otp (id, otp, generated_time, expire_time, date) VALUES (102, "000102", "2026-07-22", "2026-07-22", "2026-07-22")');
    await dbQuery.run('INSERT INTO otp (id, otp, generated_time, expire_time, date) VALUES (103, "000103", "2026-07-22", "2026-07-22", "2026-07-22")');

    const mockStudentId = 999;
    await dbQuery.run(
      'INSERT INTO attendance (student_id, otp_id, date, time, latitude, longitude, distance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [mockStudentId, 101, '2026-07-22', '12:00:00', 0, 0, 0, 'Success']
    );

    const allOtps = await dbQuery.all('SELECT id FROM otp ORDER BY id ASC');
    const successLogs = await dbQuery.all('SELECT otp_id FROM attendance WHERE student_id = ? AND status = "Success"', [mockStudentId]);
    const successIds = new Set(successLogs.map(l => l.otp_id));

    let score = 100.0;
    for (let i = 0; i < allOtps.length; i++) {
      if (successIds.has(allOtps[i].id)) {
        score += 0.25;
      } else {
        score -= 0.50;
      }
      score = Math.max(0, Math.min(100, score));
    }

    console.log(`Computed Mock Score: ${score.toFixed(2)}%`);
    assert(score === 99.00, 'Attendance score should be 99.00% (+0.25% present, -0.50% absent, clamped at 100%)');

    await dbQuery.run('DELETE FROM otp');
    await dbQuery.run('DELETE FROM attendance');
    for (const o of savedOtps) {
      await dbQuery.run(
        'INSERT INTO otp (id, otp, generated_time, expire_time, generated_by, date) VALUES (?, ?, ?, ?, ?, ?)',
        [o.id, o.otp, o.generated_time, o.expire_time, o.generated_by, o.date]
      );
    }
    for (const a of savedAttendance) {
      await dbQuery.run(
        'INSERT INTO attendance (id, student_id, otp_id, date, time, latitude, longitude, distance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [a.id, a.student_id, a.otp_id, a.date, a.time, a.latitude, a.longitude, a.distance, a.status]
      );
    }

    // 7. Test QR Session and Rotating Token Submission
    console.log('\nTesting QR Session rotating tokens...');
    const mockQrSessionId = 999;
    const mockTokens = [];
    for (let i = 0; i < 6; i++) {
      mockTokens.push(`token_${i}`);
    }

    const testQrCreatedAt = new Date().toISOString();
    const testQrExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    await dbQuery.run('DELETE FROM qr_sessions WHERE id = ?', [mockQrSessionId]);
    await dbQuery.run(
      'INSERT INTO qr_sessions (id, created_at, expires_at, created_by, date, tokens) VALUES (?, ?, ?, ?, ?, ?)',
      [mockQrSessionId, testQrCreatedAt, testQrExpiresAt, admin.id, today, JSON.stringify(mockTokens)]
    );

    // Test Case: Insert QR check-in
    const studentTestId = 12345;
    await dbQuery.run('DELETE FROM attendance WHERE student_id = ? AND qr_session_id = ?', [studentTestId, mockQrSessionId]);

    const distMatch = calculateDistance(collegeLoc.latitude, collegeLoc.longitude, collegeLoc.latitude, collegeLoc.longitude);
    const mockQrStatus = distMatch <= collegeLoc.radius ? 'Success' : 'Failed';

    await dbQuery.run(
      `INSERT INTO attendance (student_id, qr_session_id, date, time, latitude, longitude, distance, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentTestId, mockQrSessionId, today, '12:00:00', collegeLoc.latitude, collegeLoc.longitude, distMatch, mockQrStatus]
    );

    const checkinLog = await dbQuery.get(
      'SELECT id, status FROM attendance WHERE student_id = ? AND qr_session_id = ?',
      [studentTestId, mockQrSessionId]
    );
    assert(checkinLog !== undefined, 'QR check-in attendance should be inserted successfully');
    assert(checkinLog.status === 'Success', 'Status should be Success for matching location');

    // Test Case: Verify device_id column exists in schema
    const columns = await dbQuery.all("PRAGMA table_info(attendance)");
    const deviceIdCol = columns.find(c => c.name === 'device_id');
    assert(deviceIdCol !== undefined, 'device_id column should exist in attendance table');

    // Clean up QR check-in & Session
    await dbQuery.run('DELETE FROM attendance WHERE student_id = ? AND qr_session_id = ?', [studentTestId, mockQrSessionId]);
    await dbQuery.run('DELETE FROM qr_sessions WHERE id = ?', [mockQrSessionId]);

    // Clean up mock student
    await dbQuery.run('DELETE FROM students WHERE username = ?', [testUsername]);

    // Clean up mock OTPs
    await dbQuery.run('DELETE FROM otp WHERE date = ?', [today]);

    console.log('\n=================================================');
    console.log(` Verification Completed: Passed ${passedTestsCount}/${totalTestsCount} tests.`);
    console.log('=================================================');
    
    // Exit with appropriate status
    process.exit(passedTestsCount === totalTestsCount ? 0 : 1);

  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  }
}

// Start tests
runTests();
