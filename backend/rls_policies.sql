-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR COLLEGE ATTENDANCE SYSTEM
-- ====================================================================
-- Since our Express.js backend acts as the secure API gateway and 
-- manages JWT authentication & role-based access controls natively, 
-- these RLS policies keep Row Level Security enabled while permitting 
-- our Express backend API client to read, insert, update, and delete records.
-- ====================================================================

-- 1. ADMIN TABLE
ALTER TABLE admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on admin" ON admin;
CREATE POLICY "Allow backend full access on admin" ON admin FOR ALL USING (true) WITH CHECK (true);

-- 2. STUDENTS TABLE
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on students" ON students;
CREATE POLICY "Allow backend full access on students" ON students FOR ALL USING (true) WITH CHECK (true);

-- 3. FACULTY TABLE
ALTER TABLE faculty ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on faculty" ON faculty;
CREATE POLICY "Allow backend full access on faculty" ON faculty FOR ALL USING (true) WITH CHECK (true);

-- 4. ATTENDANCE TABLE
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on attendance" ON attendance;
CREATE POLICY "Allow backend full access on attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);

-- 5. OTP TABLE
ALTER TABLE otp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on otp" ON otp;
CREATE POLICY "Allow backend full access on otp" ON otp FOR ALL USING (true) WITH CHECK (true);

-- 6. QR_SESSIONS TABLE
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on qr_sessions" ON qr_sessions;
CREATE POLICY "Allow backend full access on qr_sessions" ON qr_sessions FOR ALL USING (true) WITH CHECK (true);

-- 7. SETTINGS TABLE
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on settings" ON settings;
CREATE POLICY "Allow backend full access on settings" ON settings FOR ALL USING (true) WITH CHECK (true);

-- 8. COLLEGE_LOCATION TABLE
ALTER TABLE college_location ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend full access on college_location" ON college_location;
CREATE POLICY "Allow backend full access on college_location" ON college_location FOR ALL USING (true) WITH CHECK (true);

-- 9. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_students_enrollment_no ON students(enrollment_no);
CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);
CREATE INDEX IF NOT EXISTS idx_students_semester ON students(semester);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

