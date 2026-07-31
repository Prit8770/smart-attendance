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
    // Check if user session exists in localStorage
    const savedToken = localStorage.getItem('attendance_token');
    const savedUser = localStorage.getItem('attendance_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setInitializing(false);
  }, []);

  const handleLoginSuccess = (loggedInUser, userToken) => {
    setUser(loggedInUser);
    setToken(userToken);
  };

  const handleLogout = async () => {
    if (user && user.role === 'student' && token) {
      try {
        await fetch('http://localhost:5000/api/auth/student/lock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      } catch (err) {
        console.error('Failed to lock student on logout:', err);
      }
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
          <LandingPage onGetStarted={() => setShowLogin(true)} />
        ) : (
          <Login onLoginSuccess={handleLoginSuccess} onBack={() => setShowLogin(false)} />
        )
      ) : user.role === 'admin' ? (
        <AdminDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      ) : user.role === 'faculty' ? (
        <FacultyDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      ) : (
        <StudentDashboard user={user} token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      )}
      <PwaInstallPrompt />
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
