import React, { useState } from 'react';
import { User, ShieldAlert, KeyRound, Mail, GraduationCap, ArrowLeft } from 'lucide-react';

export default function Login({ onLoginSuccess, onBack }) {
  const [loginRole, setLoginRole] = useState('student'); // 'student', 'faculty', 'admin'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = loginRole === 'admin'
      ? { email: email.trim(), password }
      : { username: username.trim(), password };

    let endpoint = '/api/auth/student/login';
    if (loginRole === 'admin') {
      endpoint = '/api/auth/admin/login';
    } else if (loginRole === 'faculty') {
      endpoint = '/api/auth/faculty/login';
    }

    try {
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please try again.');
      }

      // Store token and user
      localStorage.setItem('attendance_token', data.token);
      localStorage.setItem('attendance_user', JSON.stringify(data.user));

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Decorative Blurs */}
      <div style={styles.blurCircle1}></div>
      <div style={styles.blurCircle2}></div>

      <div className="glass-panel" style={styles.loginCard}>
        {onBack && (
          <button style={styles.backBtn} onClick={onBack} type="button">
            <ArrowLeft size={20} />
          </button>
        )}
        <div style={styles.header}>
          <div style={styles.logoContainer}>
            <GraduationCap size={36} color="#9333ea" />
          </div>
          <h2 style={styles.title}>Smart Attendance</h2>
          <p style={styles.subtitle}>GPS + OTP Verification Portal</p>
        </div>

        {/* Tab Selector */}
        <div style={styles.tabContainer}>
          <button
            style={{
              ...styles.tab,
              ...(loginRole === 'student' ? styles.activeTab : {})
            }}
            onClick={() => {
              setLoginRole('student');
              setError('');
            }}
            type="button"
          >
            <User size={16} />
            Student
          </button>
          <button
            style={{
              ...styles.tab,
              ...(loginRole === 'faculty' ? styles.activeTab : {})
            }}
            onClick={() => {
              setLoginRole('faculty');
              setError('');
            }}
            type="button"
          >
            <GraduationCap size={16} />
            Faculty
          </button>
          <button
            style={{
              ...styles.tab,
              ...(loginRole === 'admin' ? styles.activeTab : {})
            }}
            onClick={() => {
              setLoginRole('admin');
              setError('');
            }}
            type="button"
          >
            <ShieldAlert size={16} />
            Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.errorAlert}>{error}</div>}

          {loginRole === 'admin' ? (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Admin Email</label>
              <div style={styles.inputWrapper}>
                <Mail size={18} style={styles.inputIcon} />
                <input
                  type="email"
                  className="glass-input"
                  placeholder="admin@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ paddingLeft: '40px' }}
                />
              </div>
            </div>
          ) : loginRole === 'faculty' ? (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Faculty Username / Employee No</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="e.g. fac101"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{ paddingLeft: '40px' }}
                />
              </div>
            </div>
          ) : (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Enrollment No (Username)</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="e.g. 210020119001"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{ paddingLeft: '40px' }}
                />
              </div>
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <KeyRound size={18} style={styles.inputIcon} />
              <input
                type="password"
                className="glass-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '40px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    position: 'relative',
    padding: '20px',
    overflow: 'hidden'
  },
  blurCircle1: {
    position: 'absolute',
    width: '350px',
    height: '350px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(147, 51, 234, 0.4) 0%, rgba(0,0,0,0) 70%)',
    top: '15%',
    left: '20%',
    zIndex: 0
  },
  blurCircle2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(37, 99, 235, 0.3) 0%, rgba(0,0,0,0) 70%)',
    bottom: '15%',
    right: '20%',
    zIndex: 0
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 30px',
    zIndex: 1,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
    position: 'relative'
  },
  backBtn: {
    position: 'absolute',
    top: '20px',
    left: '20px',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    borderRadius: '50%',
    transition: 'background 0.2s',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  logoContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'rgba(147, 51, 234, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px auto',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    boxShadow: '0 0 20px rgba(147, 51, 234, 0.2)'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '1.8rem',
    color: '#fff',
    marginBottom: '6px'
  },
  subtitle: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)'
  },
  tabContainer: {
    display: 'flex',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
    padding: '4px',
    marginBottom: '28px'
  },
  tab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: 'none',
    background: 'none',
    color: 'var(--text-secondary)',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: '500',
    transition: 'all 0.2s ease'
  },
  activeTab: {
    background: 'rgba(147, 51, 234, 0.2)',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    color: '#fff',
    textShadow: '0 0 10px rgba(147, 51, 234, 0.5)'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    paddingLeft: '4px'
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-muted)'
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    textAlign: 'center'
  }
};
