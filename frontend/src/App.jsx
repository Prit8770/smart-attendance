import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import StudentDashboard from './components/StudentDashboard';
import FacultyDashboard from './components/FacultyDashboard';
import LandingPage from './components/LandingPage';
import PwaInstallPrompt from './components/PwaInstallPrompt';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    // Check if user session exists in localStorage and is valid
    const savedToken = localStorage.getItem('attendance_token');
    const savedUserStr = localStorage.getItem('attendance_user');

    if (savedToken && savedUserStr) {
      try {
        const parsed = JSON.parse(savedUserStr);
        setUser(parsed);
        setToken(savedToken);
      } catch (e) {}

      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Token expired or invalid');
      })
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setToken(savedToken);
          localStorage.setItem('attendance_user', JSON.stringify(data.user));
        } else {
          handleLogout();
        }
      })
      .catch(() => {
        localStorage.removeItem('attendance_token');
        localStorage.removeItem('attendance_user');
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        setInitializing(false);
      });
    } else {
      setInitializing(false);
    }
  }, []);

  const handleLoginSuccess = (loggedInUser, userToken) => {
    setUser(loggedInUser);
    setToken(userToken);
  };

  const handleUpdateUser = (updatedUser, updatedToken) => {
    setUser(updatedUser);
    localStorage.setItem('attendance_user', JSON.stringify(updatedUser));
    if (updatedToken) {
      setToken(updatedToken);
      localStorage.setItem('attendance_token', updatedToken);
    }
  };

  const handleLogout = async () => {
    if (user && user.role === 'student' && token) {
      try {
        await fetch('/api/auth/student/lock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      } catch (err) {
        console.error('Failed to lock student on logout:', err);
      }
      // Set 3-minute (180 seconds) device login cooldown for student role
      const lockUntil = Date.now() + 3 * 60 * 1000;
      localStorage.setItem('student_device_lock_until', lockUntil.toString());
    }
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    setUser(null);
    setToken(null);
  };

  if (initializing) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading Portal...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {!user ? (
        !showLogin ? (
          <>
            <LandingPage onGetStarted={() => setShowLogin(true)} />
            <PwaInstallPrompt />
          </>
        ) : (
          <Login onLoginSuccess={handleLoginSuccess} onBack={() => setShowLogin(false)} />
        )
      ) : user.role === 'admin' ? (
        <AdminDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} onUpdateUser={handleUpdateUser} />
      ) : user.role === 'faculty' ? (
        <FacultyDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} onUpdateUser={handleUpdateUser} />
      ) : (
        <StudentDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} onUpdateUser={handleUpdateUser} />
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    width: '100vw',
    overflowX: 'hidden'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(147, 51, 234, 0.2)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin-slow 1s linear infinite'
  }
};
