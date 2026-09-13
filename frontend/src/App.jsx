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
  const [activeRole, setActiveRole] = useState(() => localStorage.getItem('attendance_active_role') || 'admin');

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

  const handleSwitchRole = (newRole) => {
    setActiveRole(newRole);
    localStorage.setItem('attendance_active_role', newRole);
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
      
      // Unblock UI immediately for 1-second instant loading
      setInitializing(false);

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
        localStorage.removeItem('attendance_active_role');
        setUser(null);
        setToken(null);
      });
    } else {
      setInitializing(false);
    }
  }, []);

  const handleLoginSuccess = (loggedInUser, userToken) => {
    setUser(loggedInUser);
    setToken(userToken);
    if (loggedInUser?.role === 'student') {
      setActiveRole('student');
      localStorage.setItem('attendance_active_role', 'student');
    } else if (loggedInUser?.role === 'admin' || loggedInUser?.hasAdminAccess) {
      setActiveRole('admin');
      localStorage.setItem('attendance_active_role', 'admin');
    } else if (loggedInUser?.role === 'faculty') {
      setActiveRole('faculty');
      localStorage.setItem('attendance_active_role', 'faculty');
    }
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
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    localStorage.removeItem('attendance_active_role');
    setActiveRole('admin');
    setUser(null);
    setToken(null);
  };

  // Real-time synchronization for role changes & session updates
  useEffect(() => {
    if (!token) return;

    const refreshUserRole = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            setUser(prev => {
              const prevStr = JSON.stringify(prev);
              const nextStr = JSON.stringify(data.user);
              if (prevStr !== nextStr) {
                localStorage.setItem('attendance_user', nextStr);
                return data.user;
              }
              return prev;
            });
          }
        }
      } catch (e) {
        console.error('Error refreshing user role in App:', e);
      }
    };

    // 1. Same-browser BroadcastChannel (0ms delay)
    let bc = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('attendance_system_sync');
        bc.onmessage = (msg) => {
          if (msg && msg.data && (msg.data.type === 'DATA_CHANGED' || msg.data.type === 'FACULTY_CHANGED')) {
            refreshUserRole();
          }
        };
      } catch (e) {}
    }

    // 2. Server-Sent Events (SSE) across browsers/devices
    let eventSource = null;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        eventSource = new EventSource('/api/sync/events');
        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && (data.type === 'DATA_CHANGED' || data.type === 'FACULTY_CHANGED')) {
              refreshUserRole();
            }
          } catch (err) {}
        };
      } catch (e) {}
    }

    window.addEventListener('app_data_changed', refreshUserRole);
    window.addEventListener('focus', refreshUserRole);

    return () => {
      window.removeEventListener('app_data_changed', refreshUserRole);
      window.removeEventListener('focus', refreshUserRole);
      if (bc) bc.close();
      if (eventSource) eventSource.close();
    };
  }, [token]);

  const isPrimaryAdmin = user?.isPrimaryAdmin === true || user?.email === 'admin@ljcca.edu' || String(user?.id) === '78' || user?.id === 'admin_primary';
  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  
  // Clean, accurate role computation
  const isStudent = user?.role === 'student' || (!userRoles.includes('admin') && !userRoles.includes('faculty') && !user?.isFacultyUser && !user?.hasAdminAccess && !isPrimaryAdmin);

  const hasAdminRole = !isStudent && (isPrimaryAdmin || userRoles.includes('admin') || user?.hasAdminAccess === true);
  const hasFacultyRole = !isStudent && (isPrimaryAdmin 
    ? (userRoles.includes('faculty') || user?.hasFacultyAccess === true) 
    : (userRoles.includes('faculty') || user?.isFacultyUser === true || user?.role === 'faculty'));
  
  // Can switch role only if user has BOTH Admin and Faculty roles active
  const canSwitchRole = hasAdminRole && hasFacultyRole;

  // If admin access was revoked and user was currently in admin mode, kick back to faculty immediately
  useEffect(() => {
    if (user && !isStudent && !isPrimaryAdmin && !hasAdminRole && activeRole === 'admin') {
      setActiveRole('faculty');
      localStorage.setItem('attendance_active_role', 'faculty');
    }
  }, [hasAdminRole, activeRole, isPrimaryAdmin, isStudent, user]);

  let effectiveRole = 'student';
  if (isStudent) {
    effectiveRole = 'student';
  } else if (canSwitchRole) {
    effectiveRole = (activeRole === 'admin') ? 'admin' : 'faculty';
  } else if (hasAdminRole) {
    effectiveRole = 'admin';
  } else if (hasFacultyRole) {
    effectiveRole = 'faculty';
  }

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
      ) : effectiveRole === 'admin' ? (
        <AdminDashboard
          user={user}
          token={token}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          onUpdateUser={handleUpdateUser}
          onSwitchRole={handleSwitchRole}
          activeRole="admin"
          canSwitchRole={canSwitchRole}
        />
      ) : effectiveRole === 'faculty' ? (
        <FacultyDashboard
          user={{
            ...user,
            role: 'faculty',
            hasAdminAccess: hasAdminRole,
            canSwitchRole: canSwitchRole,
            roles: userRoles,
            originalRole: hasAdminRole ? 'admin' : 'faculty',
            name: user.name || (isPrimaryAdmin ? 'Administrative' : 'Faculty Member'),
            email: user.email || (isPrimaryAdmin ? 'admin@ljcca.edu' : '')
          }}
          token={token}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          onUpdateUser={handleUpdateUser}
          onSwitchRole={handleSwitchRole}
          activeRole="faculty"
          canSwitchRole={canSwitchRole}
        />
      ) : (
        <StudentDashboard
          user={user}
          token={token}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          onUpdateUser={handleUpdateUser}
        />
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
    border: '3px solid rgba(251, 191, 36, 0.2)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin-slow 1s linear infinite'
  }
};
