import React, { useState, useEffect, useRef } from 'react';
import {
  Users, KeyRound, QrCode, BarChart3, Download, Search, CheckCircle,
  XCircle, Clock, ShieldAlert, LogOut, RefreshCw, Sun, Moon, Menu, X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

export default function FacultyDashboard({ user, token, onLogout, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'otp', 'reports', 'settings'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    qrSessionsGenerated: 0,
    activeQrSession: null,
    trend: []
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // QR & OTP State
  const [activeQrSessionDetails, setActiveQrSessionDetails] = useState(null);
  const [qrSessionTimer, setQrSessionTimer] = useState(0);
  const [tokenIndex, setTokenIndex] = useState(0);
  const [qrCodeTimer, setQrCodeTimer] = useState(20);
  const qrCanvasRef = useRef(null);
  const [otpRemaining, setOtpRemaining] = useState(5);
  const [activeOtpDetails, setActiveOtpDetails] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [qrGenerationEnabled, setQrGenerationEnabled] = useState(true);

  const fetchQrSettings = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/qr/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQrGenerationEnabled(data.enabled);
      }
    } catch (err) {
      console.error('Error fetching QR settings:', err);
    }
  };

  // Change Password
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [settingsMessage, setSettingsMessage] = useState({ text: '', type: '' });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Attendance live monitor & reports
  const [liveLogs, setLiveLogs] = useState([]);
  const [reportType, setReportType] = useState('today'); // 'today', 'yesterday', 'monthly', 'student_wise'
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportData, setReportData] = useState([]);
  const [studentsList, setStudentsList] = useState([]); // for student-wise report dropdown

  // Client-side search filters for report table
  const [filterEnrollment, setFilterEnrollment] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterSem, setFilterSem] = useState('');

  // Dashboard modal state: null | 'present' | 'absent' | 'session'
  const [dashModal, setDashModal] = useState(null);

  // Semester selection before generating QR/OTP
  const [semesterModal, setSemesterModal] = useState(null); // null | 'qr' | 'otp'
  const [selectedSemester, setSelectedSemester] = useState('');

  // Fetch Dashboard Statistics
  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/attendance/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch active QR session & OTP
  const fetchActiveSessions = async () => {
    try {
      // 1. Fetch active QR session
      const resActiveQr = await fetch('http://localhost:5000/api/qr/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resActiveQr.ok) {
        const activeData = await resActiveQr.json();
        if (activeData.active) {
          setActiveQrSessionDetails(activeData.session);
          setQrSessionTimer(activeData.secondsLeft);
        } else {
          setActiveQrSessionDetails(null);
          setQrSessionTimer(0);
        }
      }

      // 2. Fetch active OTP session
      const resActiveOtp = await fetch('http://localhost:5000/api/otp/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resActiveOtp.ok) {
        const otpData = await resActiveOtp.json();
        if (otpData.active) {
          setActiveOtpDetails({
            otp: otpData.otp,
            expireTime: otpData.expireTime
          });
          setOtpCountdown(otpData.secondsLeft);
        } else {
          setActiveOtpDetails(null);
          setOtpCountdown(0);
        }
      }

      // 3. Fetch OTP history/counts for limit check
      const resOtpToday = await fetch('http://localhost:5000/api/otp/today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resOtpToday.ok) {
        const todayOtpData = await resOtpToday.json();
        setOtpRemaining(todayOtpData.remaining);
      }
    } catch (err) {
      console.error('Error fetching active sessions:', err);
    }
  };

  // Fetch Live Logs (Monitor)
  const fetchLiveLogs = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/attendance/monitor', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLiveLogs(data);
      }
    } catch (err) {
      console.error('Error fetching live logs:', err);
    }
  };

  // Fetch students for report filtering
  const fetchStudents = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudentsList(data);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  // Fetch Report Data
  const fetchReportData = async () => {
    let query = '';
    if (reportType === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      query = `?date=${todayStr}`;
    } else if (reportType === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      query = `?date=${yesterdayStr}`;
    } else if (reportType === 'monthly') {
      const d = new Date();
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const todayStr = d.toISOString().split('T')[0];
      query = `?startDate=${startOfMonth}&endDate=${todayStr}`;
    } else if (reportType === 'student_wise') {
      query = `?studentId=${reportStudentId}`;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/attendance/reports${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    }
  };

  // Run on mount
  useEffect(() => {
    fetchStats();
    fetchActiveSessions();
    fetchLiveLogs();
    fetchStudents();
    fetchQrSettings();
  }, []);

  // Poll stats and logs
  useEffect(() => {
    const isSessionActive = activeQrSessionDetails !== null || activeOtpDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 15000;

    const interval = setInterval(() => {
      fetchStats();
      fetchLiveLogs();
      fetchQrSettings();
    }, intervalTime);

    return () => clearInterval(interval);
  }, [activeQrSessionDetails, activeOtpDetails]);

  // Timers for QR and OTP
  useEffect(() => {
    let qrTimerInterval;
    if (activeQrSessionDetails && qrSessionTimer > 0) {
      qrTimerInterval = setInterval(() => {
        setQrSessionTimer(prev => {
          if (prev <= 1) {
            setActiveQrSessionDetails(null);
            fetchStats();
            return 0;
          }
          const elapsed = 120 - (prev - 1);
          const idx = Math.min(5, Math.floor(elapsed / 20));
          setTokenIndex(idx);
          setQrCodeTimer(20 - (elapsed % 20));
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(qrTimerInterval);
  }, [activeQrSessionDetails, qrSessionTimer]);

  useEffect(() => {
    let otpTimerInterval;
    if (activeOtpDetails && otpCountdown > 0) {
      otpTimerInterval = setInterval(() => {
        setOtpCountdown(prev => {
          if (prev <= 1) {
            setActiveOtpDetails(null);
            fetchStats();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(otpTimerInterval);
  }, [activeOtpDetails, otpCountdown]);

  // QR Code Rendering Effect
  useEffect(() => {
    if (qrCanvasRef.current && activeQrSessionDetails) {
      const currentToken = activeQrSessionDetails.tokens[tokenIndex];
      const qrData = `${activeQrSessionDetails.id},${tokenIndex},${currentToken}`;

      QRCode.toCanvas(qrCanvasRef.current, qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }, (err) => {
        if (err) console.error('Error generating QR on canvas:', err);
      });
    }
  }, [activeQrSessionDetails, tokenIndex]);

  // Actions
  const handleStartQrSession = async (sem) => {
    try {
      const res = await fetch('http://localhost:5000/api/qr/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ semester: sem })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveQrSessionDetails(data.session);
        setQrSessionTimer(120);
        setTokenIndex(0);
        setQrCodeTimer(20);
        fetchStats();
        setActiveTab('otp'); // Switch to view code
      } else {
        alert(data.error || 'Failed to start QR session');
      }
    } catch (err) {
      console.error('Error starting QR session:', err);
    }
  };

  const handleGenerateOtp = async (sem) => {
    try {
      const res = await fetch('http://localhost:5000/api/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ semester: sem })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveOtpDetails(data.otp);
        setOtpCountdown(120);
        setOtpRemaining(prev => Math.max(0, prev - 1));
        fetchStats();
        setActiveTab('otp'); // Switch to view code
      } else {
        alert(data.error || 'Failed to generate OTP');
      }
    } catch (err) {
      console.error('Error generating OTP:', err);
    }
  };

  // Opens semester modal then calls handler
  const openSemesterModal = (type) => {
    setSelectedSemester('');
    setSemesterModal(type);
  };

  const confirmSemesterAndGenerate = () => {
    if (!selectedSemester) { alert('Please select a semester first!'); return; }
    const sem = selectedSemester;
    setSemesterModal(null);
    setSelectedSemester('');
    if (sem) {
      if (semesterModal === 'qr') handleStartQrSession(sem);
      else if (semesterModal === 'otp') handleGenerateOtp(sem);
    }
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsMessage({ text: '', type: '' });

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setSettingsMessage({ text: 'New passwords do not match.', type: 'danger' });
      setSettingsLoading(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: changePasswordForm.currentPassword,
          newPassword: changePasswordForm.newPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSettingsMessage({ text: 'Password changed successfully!', type: 'success' });
        setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setSettingsMessage({ text: data.error || 'Failed to change password.', type: 'danger' });
      }
    } catch (err) {
      console.error('Password change error:', err);
      setSettingsMessage({ text: 'Network error. Failed to connect to server.', type: 'danger' });
    } finally {
      setSettingsLoading(false);
    }
  };

  // Export Reports
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(147, 51, 234); // Primary color (purple)

    doc.text('Smart Attendance System - Report', 14, 20);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 26);
    doc.text(`Filter Type: ${reportType.toUpperCase()}`, 14, 31);

    const tableColumn = ["Enrollment No", "Name", "Course", "Sem", "Time", "Faculty", "Distance", "Status"];
    const tableRows = [];

    reportData.forEach(row => {
      const rowData = [
        row.enrollment_no,
        row.name,
        row.course,
        row.semester,
        row.time,
        row.faculty_name || 'Admin',
        `${row.distance ? Math.round(row.distance) + 'm' : '-'}`,
        row.status
      ];
      tableRows.push(rowData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 38,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234], halign: 'center' },
      bodyStyles: { halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const cleanData = reportData.map(row => ({
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Faculty': row.faculty_name || 'Admin',
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance ? Math.round(row.distance) : '-',
      'Status': row.status,
      'Auth Type': row.qr_session_id ? 'QR' : 'OTP'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    const cleanData = reportData.map(row => ({
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Faculty': row.faculty_name || 'Admin',
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance ? Math.round(row.distance) : '-',
      'Status': row.status,
      'Auth Type': row.qr_session_id ? 'QR' : 'OTP'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [reportType, reportStudentId, activeTab]);

  return (
    <div style={styles.dashboardContainer}>

      {/* ===== MODAL OVERLAY ===== */}
      {dashModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
          onClick={() => setDashModal(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%', maxWidth: '520px', borderRadius: '20px',
              padding: '28px', maxHeight: '80vh', overflowY: 'auto', position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setDashModal(null)}
              style={{
                position: 'absolute', top: '16px', right: '16px', background: 'none',
                border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1
              }}
            >✕</button>

            {/* Present Today Modal */}
            {dashModal === 'present' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <CheckCircle size={24} color="#22c55e" />
                  <h2 style={{ ...styles.cardTitle, margin: 0 }}>Present Today</h2>
                  <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {liveLogs.filter(l => l.status === 'Success').length} students
                  </span>
                </div>
                {liveLogs.filter(l => l.status === 'Success').length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>No present students yet today.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {liveLogs.filter(l => l.status === 'Success').map((l, i) => (
                      <div key={l.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)'
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: 'rgba(34,197,94,0.2)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: '700', color: '#4ade80', flexShrink: 0
                        }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{l.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{l.enrollment_no} • {l.course} Sem {l.semester}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: '600' }}>✓ Present</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Absent / Rejected Modal */}
            {dashModal === 'absent' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <XCircle size={24} color="#ef4444" />
                  <h2 style={{ ...styles.cardTitle, margin: 0 }}>Rejected / Absent</h2>
                  <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {liveLogs.filter(l => l.status !== 'Success').length} students
                  </span>
                </div>
                {liveLogs.filter(l => l.status !== 'Success').length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>No rejected attendance logs today.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {liveLogs.filter(l => l.status !== 'Success').map((l, i) => (
                      <div key={l.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)'
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: 'rgba(239,68,68,0.2)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: '700', color: '#f87171', flexShrink: 0
                        }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{l.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{l.enrollment_no} • {l.course} Sem {l.semester}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: '600' }}>✗ Rejected</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Active Session Modal */}
            {dashModal === 'session' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <Clock size={24} color={activeQrSessionDetails || activeOtpDetails ? '#22c55e' : 'var(--text-muted)'} />
                  <h2 style={{ ...styles.cardTitle, margin: 0 }}>Active Session</h2>
                  {(activeQrSessionDetails || activeOtpDetails) && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.75rem', fontWeight: '600',
                      padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80'
                    }}>LIVE</span>
                  )}
                </div>

                {!activeQrSessionDetails && !activeOtpDetails && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <Clock size={40} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
                    <p>No active session running.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>Generate a QR or OTP from Dashboard to start a session.</p>
                  </div>
                )}

                {activeQrSessionDetails && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block', padding: '4px 16px', borderRadius: '20px',
                      background: 'rgba(147,51,234,0.15)', border: '1px solid rgba(147,51,234,0.4)',
                      color: 'var(--primary)', fontSize: '0.8rem', fontWeight: '700', marginBottom: '20px'
                    }}>ROTATING QR SESSION</div>
                    <div style={{
                      background: '#fff', borderRadius: '16px', padding: '16px',
                      display: 'inline-block', boxShadow: '0 10px 40px rgba(147,51,234,0.3)', margin: '0 auto 20px'
                    }}>
                      <canvas ref={qrCanvasRef} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Token <strong>{tokenIndex + 1}</strong> of 6 • Rotates every 20s
                    </div>
                    <div style={{
                      fontSize: '2rem', fontWeight: '700', color: '#a855f7',
                      fontFamily: 'monospace', letterSpacing: '2px', marginBottom: '8px'
                    }}>{qrSessionTimer}s</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Session time remaining</div>
                  </div>
                )}

                {activeOtpDetails && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block', padding: '4px 16px', borderRadius: '20px',
                      background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.4)',
                      color: '#60a5fa', fontSize: '0.8rem', fontWeight: '700', marginBottom: '24px'
                    }}>STATIC OTP CODE</div>
                    <div style={{
                      fontSize: '3rem', fontWeight: '800', letterSpacing: '10px',
                      color: '#60a5fa', fontFamily: 'monospace', margin: '20px 0'
                    }}>{activeOtpDetails.otp}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Expires in
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>
                      {otpCountdown}s
                    </div>
                    <div style={{
                      marginTop: '16px', height: '6px', borderRadius: '10px',
                      background: 'var(--border-light)', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: '10px',
                        background: 'linear-gradient(90deg, #60a5fa, #a855f7)',
                        width: `${Math.min(100, (otpCountdown / 300) * 100)}%`,
                        transition: 'width 1s linear'
                      }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* Top Navbar */}
      <nav style={styles.navBar} className="glass-panel">
        <div style={styles.navLeft}>
          <div style={styles.logoBadge}>F</div>
          <div>
            <h1 style={styles.navTitle}>Faculty Hub</h1>
            <p style={styles.navSubTitle}>{user.name} • {user.department}</p>
          </div>
        </div>
        <div style={styles.navRight}>
          <button
            onClick={toggleTheme}
            style={styles.iconButton}
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={onLogout} style={styles.logoutBtn} className="btn">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div style={styles.mainGrid}>
        {/* Sidebar Nav (Mobile card view at top, Desktop sidebar on left) */}
        <aside style={styles.sidebar} className="glass-panel faculty-sidebar">
          <ul style={styles.sideMenuList}>
            <li>
              <button
                onClick={() => setActiveTab('dashboard')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'dashboard' ? styles.menuItemBtnActive : {})
                }}
              >
                <Users size={18} />
                Dashboard
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('otp')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'otp' ? styles.menuItemBtnActive : {})
                }}
              >
                <QrCode size={18} />
                OTP/QR Generator
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('reports')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'reports' ? styles.menuItemBtnActive : {})
                }}
              >
                <BarChart3 size={18} />
                Reports & Export
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('settings')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'settings' ? styles.menuItemBtnActive : {})
                }}
              >
                <KeyRound size={18} />
                Account Settings
              </button>
            </li>
          </ul>
        </aside>

        {/* Content Pane */}
        <main style={styles.contentPane}>
          {activeTab === 'dashboard' && (
            <div style={styles.tabContent}>
              {/* Statistics Grid */}
              <div className="grid-3-cols" style={{ marginBottom: '20px' }}>

                {/* Present Today - Clickable */}
                <div
                  className="glass-panel"
                  style={{ ...styles.statCard, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => setDashModal('present')}
                  title="Click to see present students"
                >
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>Present Today</span>
                    <CheckCircle size={20} color="#22c55e" />
                  </div>
                  <div style={styles.statVal}>{stats.presentToday}</div>
                  <div style={styles.statSubText}>Students marked present</div>
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '500' }}>
                    Click to view list →
                  </div>
                </div>

                {/* Absent Today - Clickable */}
                <div
                  className="glass-panel"
                  style={{ ...styles.statCard, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => setDashModal('absent')}
                  title="Click to see absent/rejected students"
                >
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>Absent Today</span>
                    <XCircle size={20} color="#ef4444" />
                  </div>
                  <div style={styles.statVal}>{stats.absentToday}</div>
                  <div style={styles.statSubText}>Out of {stats.totalStudents} total</div>
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#ef4444', fontWeight: '500' }}>
                    Click to view list →
                  </div>
                </div>

                {/* Active Session - Clickable */}
                <div
                  className="glass-panel"
                  style={{ ...styles.statCard, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => setDashModal('session')}
                  title="Click to view active session"
                >
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>Active Session</span>
                    <Clock size={20} color={activeQrSessionDetails || activeOtpDetails ? '#22c55e' : 'var(--text-muted)'} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={styles.statVal}>
                      {activeQrSessionDetails ? 'QR' : activeOtpDetails ? 'OTP' : 'None'}
                    </div>
                    {(activeQrSessionDetails || activeOtpDetails) && (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: '600', padding: '3px 10px',
                        borderRadius: '20px', background: 'rgba(34,197,94,0.15)',
                        border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80'
                      }}>
                        LIVE
                      </span>
                    )}
                  </div>
                  <div style={styles.statSubText}>
                    {activeQrSessionDetails
                      ? `QR active • ${qrSessionTimer}s remaining`
                      : activeOtpDetails
                        ? `OTP active • ${otpCountdown}s remaining`
                        : 'No session running'}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#22c55e', fontWeight: '500' }}>
                    Click to view session →
                  </div>
                </div>
              </div>

              {/* Start Session Buttons & QR Stats */}
              <div className="responsive-grid-2col" style={{ marginBottom: '20px' }}>
                
                {/* Left Column: QR Sessions Run */}
                <div className="glass-panel" style={styles.statCard}>
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>QR Sessions Run</span>
                    <QrCode size={20} color="#a855f7" />
                  </div>
                  <div style={styles.statVal}>{stats.qrSessionsGenerated} / 5</div>
                  <div style={styles.statSubText}>Daily maximum limit of 5 sessions</div>
                </div>

                {/* Right Column: Create Session */}
                <div className="glass-panel" style={styles.cardPadding}>
                  <h3 style={styles.cardTitle}>Session Controllers</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>
                    Generate dynamic, high-security codes to mark class attendance.
                  </p>

                  <div className="button-stack-row" style={styles.buttonStackRow}>
                    <button
                      onClick={() => openSemesterModal('qr')}
                      className="btn btn-primary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || !qrGenerationEnabled || stats.qrSessionsGenerated >= 5}
                      style={{ flex: 1, gap: '8px' }}
                    >
                      <QrCode size={18} />
                      Generate Live QR Code
                    </button>
                    <button
                      onClick={() => openSemesterModal('otp')}
                      className="btn btn-secondary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || otpRemaining === 0}
                      style={{ flex: 1, gap: '8px' }}
                    >
                      <KeyRound size={18} />
                      Generate OTP ({otpRemaining} Left)
                    </button>
                  </div>
                  {otpRemaining === 0 && (
                    <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '10px', textAlign: 'center' }}>
                      Daily maximum limit of 5 OTP sessions reached.
                    </p>
                  )}
                  {stats.qrSessionsGenerated >= 5 && (
                    <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '10px', textAlign: 'center', fontWeight: '500' }}>
                      Daily maximum limit of 5 QR sessions reached.
                    </p>
                  )}
                  {!qrGenerationEnabled && (
                    <p style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: '10px', textAlign: 'center', fontWeight: '500' }}>
                      ⚠️ QR attendance session generation is currently disabled by Admin.
                    </p>
                  )}
                </div>
              </div>

              {/* Live Monitor */}
              <div className="glass-panel" style={styles.cardPadding}>
                <div style={styles.flexSpaceBetween}>
                  <h3 style={styles.cardTitle}>Live Attendance Feed</h3>
                  <div style={styles.badgeSuccess}>Live Polling</div>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                  Student check-ins will pop up here in real time.
                </p>

                <div style={styles.tableScrollable} className="custom-table-container">
                  <table className="custom-table" style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.tableTh}>Student</th>
                        <th style={styles.tableTh}>Enrollment No</th>
                        <th style={styles.tableTh}>Course/Sem</th>
                        <th style={styles.tableTh}>Time</th>
                        <th style={styles.tableTh}>Distance</th>
                        <th style={styles.tableTh}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ ...styles.noDataRow, textAlign: 'center' }}>
                            No student registrations today yet.
                          </td>
                        </tr>
                      ) : (
                        liveLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={styles.tableTd}>{log.name}</td>
                            <td style={styles.tableTd}>{log.enrollment_no}</td>
                            <td style={styles.tableTd}>{log.course} (Sem {log.semester})</td>
                            <td style={styles.tableTd}>{log.time}</td>
                            <td style={styles.tableTd}>{log.distance ? `${Math.round(log.distance)}m` : '-'}</td>
                            <td style={styles.tableTd}>
                              <span style={{
                                ...styles.statusTag,
                                ...(log.status === 'Success' ? styles.statusSuccess : styles.statusFail)
                              }}>
                                {log.status === 'Success' ? 'Present' : 'Rejected'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>
            </div>
          )}

          {activeTab === 'otp' && (
            <div style={styles.tabContent}>

              {/* Generator Controls at top */}
              <div className="glass-panel" style={{ ...styles.cardPadding, marginBottom: '20px' }}>
                <div style={styles.flexSpaceBetween}>
                  <div>
                    <h3 style={styles.cardTitle}>Session Controllers</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      Generate a live QR or OTP session for your class.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => openSemesterModal('qr')}
                      className="btn btn-primary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || !qrGenerationEnabled || stats.qrSessionsGenerated >= 5}
                      style={{ gap: '8px' }}
                    >
                      <QrCode size={18} />
                      Generate Live QR Code
                    </button>
                    <button
                      onClick={() => openSemesterModal('otp')}
                      className="btn btn-secondary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || otpRemaining === 0}
                      style={{ gap: '8px' }}
                    >
                      <KeyRound size={18} />
                      Generate OTP ({otpRemaining} Left)
                    </button>
                  </div>
                </div>

                {/* Limit warnings */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    QR Sessions: <strong style={{ color: stats.qrSessionsGenerated >= 5 ? '#ef4444' : '#4ade80' }}>{stats.qrSessionsGenerated} / 5</strong>
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    OTP Remaining: <strong style={{ color: otpRemaining === 0 ? '#ef4444' : '#60a5fa' }}>{otpRemaining}</strong>
                  </span>
                  {!qrGenerationEnabled && (
                    <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                      ⚠️ QR generation disabled by Admin
                    </span>
                  )}
                </div>
              </div>

              {/* Active Code Display */}
              <div className="glass-panel" style={styles.codeGeneratorCard}>
                <h2 style={styles.cardTitle}>Active Attendance Code</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '30px' }}>
                  Students must input this code or scan the rotating token from their dashboard.
                </p>

                {activeQrSessionDetails ? (
                  <div style={styles.qrDisplayBox}>
                    <div style={styles.qrBadge}>ROTATING QR SESSION</div>

                    {/* Live Canvas for QR Code */}
                    <div style={{ padding: '16px', background: '#fff', borderRadius: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 10px 40px rgba(147, 51, 234, 0.3)', margin: '20px auto', width: 'fit-content' }}>
                      <canvas ref={qrCanvasRef} />
                    </div>

                    <div style={styles.timerDisplay}>
                      <div style={styles.timerSegment}>
                        <span style={styles.timerLabel}>Session Expires</span>
                        <span style={styles.timerVal}>{qrSessionTimer}s</span>
                      </div>
                      <div style={styles.timerSegment}>
                        <span style={styles.timerLabel}>Token Rotates</span>
                        <span style={styles.timerVal}>{qrCodeTimer}s</span>
                      </div>
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '20px' }}>
                      Token index {tokenIndex + 1} of 6 is active. Keep this screen visible to the class.
                    </p>
                  </div>
                ) : activeOtpDetails ? (
                  <div style={styles.qrDisplayBox}>
                    <div style={styles.qrBadge} style={{ background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', color: '#60a5fa' }}>
                      STATIC OTP CODE
                    </div>

                    <div style={styles.otpNumBox}>
                      {activeOtpDetails.otp}
                    </div>

                    <div style={styles.timerDisplay}>
                      <div style={styles.timerSegment}>
                        <span style={styles.timerLabel}>OTP Expires In</span>
                        <span style={styles.timerVal}>{otpCountdown} seconds</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={styles.noActiveSessionBox}>
                    <ShieldAlert size={48} color="var(--text-muted)" />
                    <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>
                      No active QR or OTP session running.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                      Use the buttons above to generate a session.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}


          {activeTab === 'reports' && (
            <div className="glass-panel" style={styles.cardPadding}>
              <div style={styles.flexSpaceBetween}>
                <h2 style={styles.cardTitle}>Attendance Database Reports</h2>
                <div style={styles.buttonStackRow}>
                  <button onClick={handleExportPDF} className="btn btn-secondary" style={{ gap: '8px' }}>
                    <Download size={14} />
                    PDF
                  </button>
                  <button onClick={handleExportExcel} className="btn btn-secondary" style={{ gap: '8px' }}>
                    <Download size={14} />
                    Excel
                  </button>
                  <button onClick={handleExportCSV} className="btn btn-secondary" style={{ gap: '8px' }}>
                    <Download size={14} />
                    CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div style={styles.filterBar}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Report Scope</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    style={styles.selectInput}
                  >
                    <option value="today" style={{ color: '#000' }}>Today's Logs</option>
                    <option value="yesterday" style={{ color: '#000' }}>Yesterday's Logs</option>
                    <option value="monthly" style={{ color: '#000' }}>Current Month</option>
                    <option value="student_wise" style={{ color: '#000' }}>Student-Wise</option>
                  </select>
                </div>

                {reportType === 'student_wise' && (
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Select Student</label>
                    <select
                      value={reportStudentId}
                      onChange={(e) => setReportStudentId(e.target.value)}
                      style={styles.selectInput}
                    >
                      <option value="" style={{ color: '#000' }}>-- Choose Student --</option>
                      {studentsList.map(s => (
                        <option key={s.id} value={s.id} style={{ color: '#000' }}>{s.name} ({s.enrollment_no})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Search Filters Row */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Enrollment No</label>
                  <input
                    type="text"
                    placeholder="Search enrollment..."
                    value={filterEnrollment}
                    onChange={(e) => setFilterEnrollment(e.target.value)}
                    style={{ ...styles.selectInput, width: '180px' }}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Student Name</label>
                  <input
                    type="text"
                    placeholder="Search name..."
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    style={{ ...styles.selectInput, width: '180px' }}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Semester</label>
                  <select
                    value={filterSem}
                    onChange={(e) => setFilterSem(e.target.value)}
                    style={styles.selectInput}
                  >
                    <option value="" style={{ color: '#000' }}>All Semesters</option>
                    {[1,2,3,4,5,6,7,8].map(s => (
                      <option key={s} value={String(s)} style={{ color: '#000' }}>Sem {s}</option>
                    ))}
                  </select>
                </div>
                {(filterEnrollment || filterName || filterSem) && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => { setFilterEnrollment(''); setFilterName(''); setFilterSem(''); }}
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Table Data Preview */}
              <div style={{ ...styles.tableScrollable, marginTop: '16px', maxHeight: '450px', overflowY: 'auto' }}>
                <table className="custom-table" style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Time</th>
                      <th style={{ textAlign: 'left' }}>Student</th>
                      <th style={{ textAlign: 'left' }}>Enrollment No</th>
                      <th style={{ textAlign: 'left' }}>Course/Sem</th>
                      <th style={{ textAlign: 'left' }}>Faculty</th>
                      <th style={{ textAlign: 'left' }}>Distance</th>
                      <th style={{ textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = reportData.filter(row => {
                        const matchEnroll = filterEnrollment === '' || (row.enrollment_no && row.enrollment_no.toLowerCase().includes(filterEnrollment.toLowerCase()));
                        const matchName = filterName === '' || (row.name && row.name.toLowerCase().includes(filterName.toLowerCase()));
                        const matchSem = filterSem === '' || String(row.semester) === filterSem;
                        return matchEnroll && matchName && matchSem;
                      });
                      return filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ ...styles.noDataRow, textAlign: 'center' }}>
                            No records found matching filters.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((row) => (
                          <tr key={row.id}>
                            <td style={{ textAlign: 'left' }}>{row.date}</td>
                            <td style={{ textAlign: 'left' }}>{row.time}</td>
                            <td style={{ textAlign: 'left' }}>{row.name}</td>
                            <td style={{ textAlign: 'left' }}>{row.enrollment_no}</td>
                            <td style={{ textAlign: 'left' }}>{row.course} (Sem {row.semester})</td>
                            <td style={{ textAlign: 'left' }}>
                              <span style={{ fontWeight: '500', color: 'var(--primary)' }}>
                                {row.faculty_name || 'Admin'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'left' }}>{row.distance ? `${Math.round(row.distance)}m` : '-'}</td>
                            <td style={{ textAlign: 'left' }}>
                              <span style={{
                                ...styles.statusTag,
                                ...(row.status === 'Success' ? styles.statusSuccess : styles.statusFail)
                              }}>
                                {row.status === 'Success' ? 'Present' : 'Rejected'}
                              </span>
                            </td>
                          </tr>
                        ))
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="glass-panel" style={styles.cardPadding}>
              <h2 style={styles.cardTitle}>Account Profile Settings</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '24px' }}>
                Update your portal login details.
              </p>

              <form onSubmit={handlePasswordChangeSubmit} style={styles.settingsForm}>
                {settingsMessage.text && (
                  <div style={{
                    ...styles.alertBox,
                    color: settingsMessage.type === 'success' ? '#22c55e' : '#ef4444',
                    background: settingsMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: settingsMessage.type === 'success' ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                  }}>
                    {settingsMessage.text}
                  </div>
                )}

                <div style={styles.inputStack}>
                  <div style={styles.formInputGroup}>
                    <label style={styles.formLabel}>Current Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      value={changePasswordForm.currentPassword}
                      onChange={e => setChangePasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      required
                    />
                  </div>

                  <div style={styles.formInputGroup}>
                    <label style={styles.formLabel}>New Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      value={changePasswordForm.newPassword}
                      onChange={e => setChangePasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      required
                    />
                  </div>

                  <div style={styles.formInputGroup}>
                    <label style={styles.formLabel}>Confirm New Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      value={changePasswordForm.confirmPassword}
                      onChange={e => setChangePasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={settingsLoading}
                  style={{ marginTop: '10px' }}
                >
                  {settingsLoading ? 'Saving changes...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* ===== SEMESTER SELECT MODAL FOR GENERATION ===== */}
      {semesterModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
          onClick={() => setSemesterModal(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%', maxWidth: '420px', borderRadius: '20px',
              padding: '28px', position: 'relative', textAlign: 'center'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSemesterModal(null)}
              style={{
                position: 'absolute', top: '16px', right: '16px', background: 'none',
                border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem'
              }}
            >✕</button>

            <h3 style={{ ...styles.cardTitle, marginBottom: '8px' }}>
              Select Semester
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '24px' }}>
              Please choose which semester this {semesterModal === 'qr' ? 'QR Code' : 'OTP'} session is for:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedSemester(String(s))}
                  style={{
                    padding: '12px 8px', borderRadius: '10px', fontWeight: '600',
                    fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s ease',
                    border: selectedSemester === String(s) ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                    background: selectedSemester === String(s) ? 'rgba(147,51,234,0.2)' : 'rgba(255,255,255,0.05)',
                    color: selectedSemester === String(s) ? '#a855f7' : 'var(--text-primary)'
                  }}
                >
                  Sem {s}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setSemesterModal(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSemesterAndGenerate}
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!selectedSemester}
              >
                Generate Code →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  dashboardContainer: {
    padding: '30px',
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
    minHeight: '100vh',
    width: '100%'
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderRadius: '16px',
    position: 'relative',
    top: 'auto'
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  logoBadge: {
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '1.2rem',
    boxShadow: 'var(--logo-glow)'
  },
  navTitle: {
    fontSize: '1.2rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0
  },
  navSubTitle: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    margin: 0
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  iconButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  logoutBtn: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    padding: '8px 16px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.88rem',
    fontWeight: '500'
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: '30px',
    alignItems: 'start'
  },
  sidebar: {
    padding: '24px 16px',
    borderRadius: '16px',
    position: 'relative',
    top: 'auto'
  },
  sideMenuList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  menuItemBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--text-secondary)',
    fontSize: '0.92rem',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease'
  },
  menuItemBtnActive: {
    background: 'rgba(147, 51, 234, 0.15)',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    color: 'var(--text-primary)',
    textShadow: '0 0 10px rgba(147, 51, 234, 0.4)'
  },
  contentPane: {
    minWidth: 0
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '30px'
  },
  statsGrid: {
  },
  statCard: {
    padding: '24px',
    borderRadius: '16px'
  },
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  statLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  statVal: {
    fontSize: '2rem',
    fontWeight: '700',
    color: 'var(--text-primary)',
    lineHeight: '1.2'
  },
  statSubText: {
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
    marginTop: '6px'
  },
  sessionControlGrid: {
  },
  cardPadding: {
    padding: '28px',
    borderRadius: '16px'
  },
  cardTitle: {
    fontSize: '1.15rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0'
  },
  buttonStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '10px'
  },
  buttonStackRow: {
    display: 'flex',
    gap: '12px'
  },
  flexSpaceBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  badgeSuccess: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#22c55e',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.3)',
    padding: '4px 10px',
    borderRadius: '20px'
  },
  tableScrollable: {
    width: '100%',
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)'
  },
  table: {
    width: '100%',
    minWidth: '680px',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)'
  },
  tableTh: {
    textAlign: 'center',
    padding: '18px 20px 16px 20px',
    borderBottom: '2px solid var(--border-light)',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    whiteSpace: 'nowrap'
  },
  tableTd: {
    textAlign: 'center',
    padding: '22px 20px 20px 20px',
    borderBottom: '1px solid var(--border-extra-light)',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    lineHeight: '1.6',
    whiteSpace: 'nowrap'
  },
  noDataRow: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--text-muted)',
    fontStyle: 'italic'
  },
  statusTag: {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '600',
    lineHeight: '1.4',
    whiteSpace: 'nowrap'
  },
  statusSuccess: {
    background: 'rgba(34, 197, 94, 0.15)',
    border: 'none',
    color: '#4ade80'
  },
  statusFail: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: 'none',
    color: '#f87171'
  },
  codeGeneratorCard: {
    padding: '40px 30px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '540px',
    margin: '0 auto'
  },
  qrDisplayBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '30px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: '16px',
    marginTop: '10px'
  },
  qrBadge: {
    fontSize: '0.8rem',
    fontWeight: '700',
    letterSpacing: '1px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(147, 51, 234, 0.2)',
    border: '1px solid rgba(147, 51, 234, 0.4)',
    color: '#c084fc',
    marginBottom: '24px'
  },
  otpNumBox: {
    fontSize: '3.6rem',
    fontWeight: '800',
    letterSpacing: '8px',
    color: 'var(--text-primary)',
    textShadow: '0 0 30px rgba(147, 51, 234, 0.6)',
    fontFamily: 'monospace',
    marginBottom: '24px'
  },
  timerDisplay: {
    display: 'flex',
    gap: '30px',
    justifyContent: 'center',
    width: '100%',
    marginTop: '10px'
  },
  timerSegment: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  timerLabel: {
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
    fontWeight: '500'
  },
  timerVal: {
    fontSize: '1.2rem',
    fontWeight: '700',
    color: 'var(--text-primary)'
  },
  noActiveSessionBox: {
    padding: '60px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterBar: {
    display: 'flex',
    gap: '16px',
    marginTop: '16px',
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '200px'
  },
  filterLabel: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
    paddingLeft: '4px'
  },
  selectInput: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--border-light)',
    borderRadius: '10px',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s ease'
  },
  settingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '480px'
  },
  alertBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    fontWeight: '500'
  },
  inputStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  formLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    paddingLeft: '4px'
  }
};
