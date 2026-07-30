const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'college_attendance.db');

let db;
let dbQuery = {};

const dbInitialized = new Promise((resolve, reject) => {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      reject(err);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
      initializeSchema(resolve, reject);
    }
  });
});

function initializeSchema(resolve, reject) {
  db.serialize(() => {
    try {
      // 1. Admin Table
      db.run(`
        CREATE TABLE IF NOT EXISTS admin (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL
        )
      `);

      // 2. Students Table
      db.run(`
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          enrollment_no TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          course TEXT NOT NULL,
          semester TEXT NOT NULL,
          mobile TEXT NOT NULL,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          plain_password TEXT,
          locked_until TEXT
        )
      `);

      // 3. OTP Table
      db.run(`
        CREATE TABLE IF NOT EXISTS otp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          otp TEXT NOT NULL,
          generated_time TEXT NOT NULL,
          expire_time TEXT NOT NULL,
          generated_by INTEGER,
          date TEXT NOT NULL,
          FOREIGN KEY (generated_by) REFERENCES admin(id)
        )
      `);

      // 3a. QR Sessions Table
      db.run(`
        CREATE TABLE IF NOT EXISTS qr_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_by INTEGER,
          date TEXT NOT NULL,
          tokens TEXT NOT NULL,
          FOREIGN KEY (created_by) REFERENCES admin(id)
        )
      `);

      // 4. Attendance Table
      db.run(`
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          otp_id INTEGER,
          qr_session_id INTEGER,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          distance REAL,
          status TEXT NOT NULL,
          device_id TEXT,
          FOREIGN KEY (student_id) REFERENCES students(id),
          FOREIGN KEY (otp_id) REFERENCES otp(id),
          FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(id)
        )
      `);

      // 5. College Location Table
      db.run(`
        CREATE TABLE IF NOT EXISTS college_location (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          radius REAL NOT NULL DEFAULT 200.0
        )
      `);

      // 6. Faculty Table
      db.run(`
        CREATE TABLE IF NOT EXISTS faculty (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_no TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          department TEXT NOT NULL,
          mobile TEXT NOT NULL,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          plain_password TEXT
        )
      `);


      // Alter table to add columns dynamically if table already exists
      db.run("ALTER TABLE students ADD COLUMN plain_password TEXT", (err) => {
        // Safe to ignore if it already exists
      });
      db.run("ALTER TABLE students ADD COLUMN locked_until TEXT", (err) => {
        // Safe to ignore if it already exists
      });
      db.run("ALTER TABLE attendance ADD COLUMN qr_session_id INTEGER", (err) => {
        // Safe to ignore if it already exists
      });
      db.run("ALTER TABLE attendance ADD COLUMN device_id TEXT", (err) => {
        // Safe to ignore if it already exists
      });
      db.run("ALTER TABLE qr_sessions ADD COLUMN created_by_faculty_id INTEGER", (err) => {
        // Safe to ignore if it already exists
      });
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `, (err) => {
        if (!err) {
          db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('qr_generation_enabled', 'true')");
        }
      });

      // Migration: Check if attendance table has otp_id as NOT NULL, and recreate if so
      db.all("PRAGMA table_info(attendance)", (err, columns) => {
        if (!err && columns) {
          const otpIdCol = columns.find(c => c.name === 'otp_id');
          if (otpIdCol && otpIdCol.notnull === 1) {
            console.log('Migrating attendance table to make otp_id nullable...');
            db.serialize(() => {
              db.run("CREATE TABLE attendance_backup AS SELECT * FROM attendance");
              db.run("DROP TABLE attendance");
              db.run(`
                CREATE TABLE attendance (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  student_id INTEGER NOT NULL,
                  otp_id INTEGER,
                  qr_session_id INTEGER,
                  date TEXT NOT NULL,
                  time TEXT NOT NULL,
                  latitude REAL,
                  longitude REAL,
                  distance REAL,
                  status TEXT NOT NULL,
                  device_id TEXT,
                  FOREIGN KEY (student_id) REFERENCES students(id),
                  FOREIGN KEY (otp_id) REFERENCES otp(id),
                  FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(id)
                )
              `);
              db.run(`
                INSERT INTO attendance (id, student_id, otp_id, qr_session_id, date, time, latitude, longitude, distance, status, device_id)
                SELECT id, student_id, otp_id, qr_session_id, date, time, latitude, longitude, distance, status, device_id FROM attendance_backup
              `);
              db.run("DROP TABLE attendance_backup");
              console.log('Attendance table migrated successfully.');
            });
          }
        }
      });

      // Delete old default admin if it exists
      db.run("DELETE FROM admin WHERE email = 'admin@college.edu'");

      // Seed default Admin
      db.get('SELECT * FROM admin WHERE email = ?', ['admin@ljcca.edu'], (err, row) => {
        if (err) {
          console.error('Error checking admin user:', err);
          return reject(err);
        }
        if (!row) {
          const adminPasswordHash = bcrypt.hashSync('Jadav@7496', 10);
          db.run(
            'INSERT INTO admin (name, email, password) VALUES (?, ?, ?)',
            ['College Admin', 'admin@ljcca.edu', adminPasswordHash],
            (err2) => {
              if (err2) {
                console.error('Error seeding default admin:', err2);
                return reject(err2);
              }
              console.log('Seeded default admin user: admin@ljcca.edu / Jadav@7496');
              checkAndSeedLocation(resolve, reject);
            }
          );
        } else {
          checkAndSeedLocation(resolve, reject);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function checkAndSeedLocation(resolve, reject) {
  // Seed default College Location
  db.get('SELECT * FROM college_location LIMIT 1', (err, row) => {
    if (err) {
      console.error('Error checking college location:', err);
      return reject(err);
    }
    if (!row) {
      db.run(
        'INSERT INTO college_location (latitude, longitude, radius) VALUES (?, ?, ?)',
        [23.0225, 72.5714, 200.0],
        (err2) => {
          if (err2) {
            console.error('Error seeding college location:', err2);
            return reject(err2);
          }
          console.log('Seeded default college location: Lat 23.0225, Lng 72.5714, Radius 200m');
          checkAndSeedFaculty(resolve, reject);
        }
      );
    } else {
      checkAndSeedFaculty(resolve, reject);
    }
  });
}

function checkAndSeedFaculty(resolve, reject) {
  db.get('SELECT * FROM faculty WHERE employee_no = ?', ['FAC101'], (err, row) => {
    if (err) {
      console.error('Error checking faculty:', err);
      return reject(err);
    }
    if (!row) {
      const facultyPasswordHash = bcrypt.hashSync('Faculty@123', 10);
      db.run(
        'INSERT INTO faculty (employee_no, name, department, mobile, username, password, plain_password) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['FAC101', 'Dr. Sarah Connor', 'Computer Science', '9876543210', 'fac101', facultyPasswordHash, 'Faculty@123'],
        (err2) => {
          if (err2) {
            console.error('Error seeding default faculty:', err2);
            return reject(err2);
          }
          console.log('Seeded default faculty user: fac101 / Faculty@123');
          resolve();
        }
      );
    } else {
      resolve();
    }
  });
}


// Promisified DB execution helpers
dbQuery.get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

dbQuery.all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

dbQuery.run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

module.exports = {
  db,
  dbQuery,
  dbInitialized
};
