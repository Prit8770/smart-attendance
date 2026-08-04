import React, { useState } from 'react';
import { User, ShieldAlert, KeyRound, Mail, GraduationCap, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export default function Login({ onLoginSuccess, onBack }) {
  const [loginRole, setLoginRole] = useState('student'); // 'student', 'faculty', 'admin'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const response = await fetch(`${endpoint}`, {
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
            <img src="/logo.png" alt="LJCCA Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
                  style={{ paddingLeft: '44px' }}
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
                  style={{ paddingLeft: '44px' }}
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
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <KeyRound size={18} style={styles.inputIcon} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="glass-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '44px', paddingRight: '44px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px'
                }}
                title={showPassword ? "Hide Password" : "Show Password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
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
    overflow: 'hidden',
    background: 'var(--bg-gradient)'
  },
  blurCircle1: {
    position: 'absolute',
    width: '450px',
    height: '450px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(147, 51, 234, 0.25) 0%, rgba(0,0,0,0) 70%)',
    top: '-10%',
    left: '-10%',
    zIndex: 0
  },
  blurCircle2: {
    position: 'absolute',
    width: '450px',
    height: '450px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, rgba(0,0,0,0) 70%)',
    bottom: '-10%',
    right: '-10%',
    zIndex: 0
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 32px',
    zIndex: 1,
    boxShadow: '0 24px 50px rgba(0, 0, 0, 0.25), 0 0 40px rgba(147, 51, 234, 0.15)',
    position: 'relative',
    borderRadius: '24px',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  },
  backBtn: {
    position: 'absolute',
    top: '20px',
    left: '20px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px'
  },
  logoContainer: {
    width: '90px',
    height: '90px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px auto',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '20px',
    padding: '12px',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.05), 0 8px 16px rgba(0,0,0,0.1)'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: '800',
    fontSize: '2rem',
    color: 'var(--text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.02em'
  },
  subtitle: {
    fontSize: '0.95rem',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  tabContainer: {
    display: 'flex',
    background: 'rgba(0, 0, 0, 0.15)',
    borderRadius: '12px',
    padding: '6px',
    marginBottom: '32px',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
  },
  tab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    padding: '12px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: '600',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  activeTab: {
    background: 'var(--primary)',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  label: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    fontWeight: '600',
    paddingLeft: '6px'
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  inputIcon: {
    position: 'absolute',
    left: '16px',
    color: 'var(--text-muted)'
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    padding: '14px',
    borderRadius: '12px',
    fontSize: '0.9rem',
    textAlign: 'center',
    fontWeight: '500'
  }
};
