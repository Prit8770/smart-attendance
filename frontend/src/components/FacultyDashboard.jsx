import React, { useState, useEffect, useRef } from 'react';
import {
  Users, KeyRound, QrCode, BarChart3, Download, Search, CheckCircle,
  XCircle, Clock, ShieldAlert, LogOut, RefreshCw, Sun, Moon, Menu, X, Folder, Calendar,
  ClipboardList, UserCheck, UserX, Smartphone, HandIcon, GraduationCap, User, Settings, MapPin, Plus, Trash2, Edit
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

// Global Division Normalizer and Matcher Helpers
const normalizeDiv = (d) => String(d || '').replace(/div/gi, '').trim().toUpperCase();

const isDivMatch = (studentDiv, sessionDiv) => {
  const normTarget = normalizeDiv(sessionDiv);
  if (!normTarget || normTarget === 'ALL' || normTarget.includes('ALL')) return true;
  const normStudent = normalizeDiv(studentDiv);
  if (!normStudent) return false;
  return normStudent === normTarget;
};

export default function FacultyDashboard({ user, token, onLogout, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'otp', 'reports', 'settings', 'manual'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Stats with Instant Local Hydration on Refresh
  const [stats, setStats] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_faculty_stats') || localStorage.getItem('cached_faculty_stats');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return {
      totalStudents: 0,
      presentToday: 0,
      absentToday: 0,
      qrSessionsGenerated: 0,
      activeQrSession: null,
      trend: []
    };
  });
  const [statsLoading, setStatsLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_faculty_stats') || localStorage.getItem('cached_faculty_stats');
      return !cached;
    } catch(e) {
      return true;
    }
  });

  // QR & OTP State
  const [activeQrSessionDetails, setActiveQrSessionDetails] = useState(null);
  const [qrSessionTimer, setQrSessionTimer] = useState(0);
  const [tokenIndex, setTokenIndex] = useState(0);
  const [qrCodeTimer, setQrCodeTimer] = useState(15);
  const qrCanvasRef = useRef(null);
  const [otpRemaining, setOtpRemaining] = useState(5);
  const [activeOtpDetails, setActiveOtpDetails] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [qrGenerationEnabled, setQrGenerationEnabled] = useState(true);
  const [dashModalSem, setDashModalSem] = useState('');
  const [liveFeedSemFilter, setLiveFeedSemFilter] = useState('');
  const [selectedSemFolder, setSelectedSemFolder] = useState(null);
  const [folderDivFilter, setFolderDivFilter] = useState('ALL');
  const [folderSearchName, setFolderSearchName] = useState('');
  const [folderSearchEnroll, setFolderSearchEnroll] = useState('');
  const [folderSearchDate, setFolderSearchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSessionFolder, setSelectedSessionFolder] = useState(null);

  // Manual Attendance state
  const [manualSessionFolder, setManualSessionFolder] = useState(null); // null | 1 | 2 | 3 | 4 | 5
  const [manualFolderSem, setManualFolderSem] = useState('');
  const [manualFolderDiv, setManualFolderDiv] = useState('ALL');
  const [manualDivFilter, setManualDivFilter] = useState('ALL');
  const [manualSearchName, setManualSearchName] = useState('');
  const [manualTodayLogs, setManualTodayLogs] = useState([]); // today's attendance (all)
  const [manualActionMsg, setManualActionMsg] = useState({ id: null, text: '', type: '' });
  const [manualLoading, setManualLoading] = useState(false);

  const fetchQrSettings = async () => {
    try {
      const res = await fetch('/api/qr/settings', {
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

  // Attendance live monitor & reports with instant hydration
  const [liveLogs, setLiveLogs] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_faculty_livelogs');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return [];
  });
  const [reportType, setReportType] = useState('today'); // 'today', 'yesterday', 'monthly', 'student_wise'
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportData, setReportData] = useState([]);
  const [studentsList, setStudentsList] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_faculty_students');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return [];
  });

  // Client-side search filters for report table
  const [filterEnrollment, setFilterEnrollment] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterSem, setFilterSem] = useState('');

  // Dashboard modal state: null | 'present' | 'absent' | 'session'
  const [dashModal, setDashModal] = useState(null);
  const [facultySessionsToday, setFacultySessionsToday] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_faculty_sessions');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return [];
  });
  const [dashModalSession, setDashModalSession] = useState('ALL');

  // Semester & Division selection before generating QR/OTP
  const [semesterModal, setSemesterModal] = useState(null); // null | 'qr' | 'otp'
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [availableDivisions, setAvailableDivisions] = useState([]);

  // Date logs and Session directory tab
  const [dateLogs, setDateLogs] = useState([]);
  const [sessionFolderTab, setSessionFolderTab] = useState('present'); // 'present' | 'absent'
  const [fetchedFacultyUser, setFetchedFacultyUser] = useState(null);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.user) {
            setFetchedFacultyUser(data.user);
            try {
              localStorage.setItem('attendance_user', JSON.stringify(data.user));
              if (data.user.id || data.user.username) {
                localStorage.setItem(`cached_faculty_${data.user.id || data.user.username}`, JSON.stringify(data.user));
              }
            } catch (e) {}
          }
        })
        .catch(err => console.error('Error fetching faculty profile:', err));
    }
  }, [token]);

  // Compute active user with multi-layer fallback to ensure subjects NEVER vanish on refresh
  const activeUser = (() => {
    if (fetchedFacultyUser && (fetchedFacultyUser.department || (Array.isArray(fetchedFacultyUser.subjects) && fetchedFacultyUser.subjects.length > 0))) {
      return fetchedFacultyUser;
    }

    const rawDept = user?.department || '';
    let userSubs = Array.isArray(user?.subjects) ? user.subjects : [];
    if (userSubs.length === 0 && rawDept.includes('||SUB:')) {
      try {
        const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) userSubs = parsed;
      } catch(e) {}
    }
    if (userSubs.length > 0) {
      if (user?.id || user?.username) {
        try {
          localStorage.setItem(`cached_faculty_${user.id || user.username}`, JSON.stringify(user));
        } catch (e) {}
      }
      return user;
    }

    if (user?.id || user?.username) {
      try {
        const cachedStr = localStorage.getItem(`cached_faculty_${user.id || user.username}`);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached && (cached.department || (Array.isArray(cached.subjects) && cached.subjects.length > 0))) {
            return { ...user, ...cached };
          }
        }
      } catch(e) {}
    }

    try {
      const globalStr = localStorage.getItem('attendance_user');
      if (globalStr) {
        const gUser = JSON.parse(globalStr);
        if (gUser && (gUser.department || (Array.isArray(gUser.subjects) && gUser.subjects.length > 0))) {
          return { ...user, ...gUser };
        }
      }
    } catch(e) {}

    return user;
  })();

  useEffect(() => {
    if (folderSearchDate && token) {
      fetch(`/api/attendance/report?type=custom_date&date=${folderSearchDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDateLogs(data);
        })
        .catch(err => console.error(err));
    }
  }, [folderSearchDate, token]);

  // Fetch Dashboard Statistics
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/attendance/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        try {
          sessionStorage.setItem('cached_faculty_stats', JSON.stringify(data));
          localStorage.setItem('cached_faculty_stats', JSON.stringify(data));
        } catch(e) {}
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
      const resActiveQr = await fetch('/api/qr/active', {
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
      const resActiveOtp = await fetch('/api/otp/active', {
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
      const resOtpToday = await fetch('/api/otp/today', {
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
      const res = await fetch('/api/attendance/monitor', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLiveLogs(data);
        try { sessionStorage.setItem('cached_faculty_livelogs', JSON.stringify(data)); } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching live logs:', err);
    }
  };

  // Fetch students for report filtering
  const fetchStudents = async () => {
    try {
      const res = await fetch('/api/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudentsList(data);
        try { sessionStorage.setItem('cached_faculty_students', JSON.stringify(data)); } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  // Fetch Report Data
  const fetchReportData = async () => {
    let query = '';
    if (reportType === 'today') {
      query = '?range=today';
    } else if (reportType === 'yesterday') {
      query = '?range=yesterday';
    } else if (reportType === 'last_week') {
      query = '?range=last_week';
    } else if (reportType === 'last_month') {
      query = '?range=last_month';
    } else if (reportType === 'monthly') {
      const d = new Date();
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const todayStr = d.toISOString().split('T')[0];
      query = `?startDate=${startOfMonth}&endDate=${todayStr}`;
    } else if (reportType === 'student_wise') {
      query = `?studentId=${reportStudentId}`;
    }

    try {
      const res = await fetch(`/api/attendance/reports${query}`, {
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

  // Fetch today's sessions started by this faculty
  // Fetch today's attendance for ALL students (for manual attendance tab)
  const fetchTodayAllAttendance = async () => {
    try {
      const res = await fetch('/api/attendance/reports?range=today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setManualTodayLogs(Array.isArray(data) ? data : (data.logs || data.reports || []));
      }
    } catch (err) {
      console.error('Error fetching today attendance for manual tab:', err);
    }
  };

  const fetchTodaySessions = async () => {
    try {
      const [qrRes, otpRes] = await Promise.all([
        fetch('/api/qr/today', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/otp/today', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let qrSessions = [];
      let otpSessions = [];

      if (qrRes.ok) {
        qrSessions = await qrRes.json();
      }
      if (otpRes.ok) {
        const otpData = await otpRes.json();
        otpSessions = otpData.otps || [];
      }

      const formattedQr = (qrSessions || []).map((s) => {
        let sem = s.semester;
        let div = s.division;
        let subj = s.subject;
        try {
          const cached = localStorage.getItem(`qr_target_${s.id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (!sem) sem = parsed.semester;
            if (!div) div = parsed.division;
            if (!subj) subj = parsed.subject;
          }
        } catch (e) {}
        return {
          id: `qr_${s.id}`,
          qr_session_id: s.id,
          otp_id: null,
          type: 'QR',
          created_at: s.created_at,
          semester: sem || null,
          division: div || null,
          subject: subj || null
        };
      });

      const formattedOtp = (otpSessions || []).map((s) => {
        let sem = s.semester;
        let div = s.division;
        let subj = s.subject;
        try {
          const cached = localStorage.getItem(`otp_target_${s.id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (!sem) sem = parsed.semester;
            if (!div) div = parsed.division;
            if (!subj) subj = parsed.subject;
          }
        } catch (e) {}
        return {
          id: `otp_${s.id}`,
          qr_session_id: null,
          otp_id: s.id,
          type: 'OTP',
          created_at: s.generated_time || s.date,
          semester: sem || null,
          division: div || null,
          subject: subj || null
        };
      });

      const combined = [...formattedQr, ...formattedOtp].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const finalSessions = combined.map((sess, idx) => {
        const divText = sess.division && String(sess.division).trim().toUpperCase() !== 'ALL'
          ? `Div ${sess.division}`
          : 'All Div';
        const semText = sess.semester ? `Sem ${sess.semester} ${divText}` : 'Sem ?';
        return {
          ...sess,
          sessionNumber: idx + 1,
          displayText: `Session ${idx + 1}`
        };
      });

      setFacultySessionsToday(finalSessions);
      try { sessionStorage.setItem('cached_faculty_sessions', JSON.stringify(finalSessions)); } catch(e) {}
    } catch (err) {
      console.error('Error fetching today sessions:', err);
    }
  };

  // Run on mount
  useEffect(() => {
    fetchStats();
    fetchActiveSessions();
    fetchLiveLogs();
    fetchStudents();
    fetchQrSettings();
    fetchTodayAllAttendance();
    fetchTodaySessions();
  }, []);

  useEffect(() => {
    if (dashModal) {
      fetchStudents();
      fetchTodaySessions();
      fetchLiveLogs();
    }
  }, [dashModal]);


  // Mark student Present manually for a specific session (Instant 0ms Optimistic Update)
  const handleManualMark = async (student, session) => {
    setManualActionMsg({ id: null, text: '', type: '' });
    
    const tempId = `temp_${Date.now()}_${student.id}`;
    const optimisticRecord = {
      id: tempId,
      student_id: student.id,
      enrollment_no: student.enrollment_no,
      roll_no: student.roll_no,
      name: student.name,
      status: 'Success',
      device_id: 'Manual',
      qr_session_id: session?.qr_session_id || null,
      otp_id: session?.otp_id || null,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour12: false })
    };

    // Instant local state update (0ms UI latency)
    setManualTodayLogs(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return [...safePrev, optimisticRecord];
    });

    try {
      const payload = { student_id: student.id };
      if (session?.qr_session_id) payload.qr_session_id = session.qr_session_id;
      if (session?.otp_id) payload.otp_id = session.otp_id;

      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        fetchTodayAllAttendance();
        fetchLiveLogs();
        fetchStats();
      } else {
        setManualTodayLogs(prev => (Array.isArray(prev) ? prev : []).filter(l => l.id !== tempId));
        setManualActionMsg({ id: student.id, text: data.error || 'Failed', type: 'error' });
      }
    } catch (err) {
      setManualTodayLogs(prev => (Array.isArray(prev) ? prev : []).filter(l => l.id !== tempId));
      setManualActionMsg({ id: student.id, text: 'Network error', type: 'error' });
    }
  };

  // Undo manual attendance (Mark Absent) for a specific session (Instant 0ms Optimistic Update)
  const handleManualUnmark = async (student, session) => {
    setManualActionMsg({ id: null, text: '', type: '' });

    let removedLogs = [];
    setManualTodayLogs(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      removedLogs = safePrev.filter(l => {
        const matchStudent = (l.student_id && String(l.student_id) === String(student.id)) ||
          (l.enrollment_no && l.enrollment_no === student.enrollment_no) ||
          (l.roll_no && l.roll_no === student.roll_no);
        if (!matchStudent) return false;
        if (session?.qr_session_id && String(l.qr_session_id) === String(session?.qr_session_id)) return true;
        if (session?.otp_id && String(l.otp_id) === String(session?.otp_id)) return true;
        if (!session?.qr_session_id && !session?.otp_id && l.device_id === 'Manual') return true;
        return false;
      });

      return safePrev.filter(l => !removedLogs.includes(l));
    });

    try {
      const payload = { student_id: student.id };
      if (session?.qr_session_id) payload.qr_session_id = session.qr_session_id;
      if (session?.otp_id) payload.otp_id = session.otp_id;

      const res = await fetch('/api/attendance/manual/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        fetchTodayAllAttendance();
        fetchLiveLogs();
        fetchStats();
      } else {
        setManualTodayLogs(prev => [...(Array.isArray(prev) ? prev : []), ...removedLogs]);
        setManualActionMsg({ id: student.id, text: data.error || 'Failed to undo', type: 'error' });
      }
    } catch (err) {
      setManualTodayLogs(prev => [...(Array.isArray(prev) ? prev : []), ...removedLogs]);
      setManualActionMsg({ id: student.id, text: 'Network error', type: 'error' });
    }
  };

  // Poll stats and logs
  useEffect(() => {
    const isSessionActive = activeQrSessionDetails !== null || activeOtpDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 15000;

    const interval = setInterval(() => {
      fetchStats();
      fetchLiveLogs();
      fetchQrSettings();
      if (activeTab === 'manual') { fetchTodaySessions(); fetchTodayAllAttendance(); }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [activeQrSessionDetails, activeOtpDetails, activeTab]);

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
          const totalTokens = activeQrSessionDetails?.tokens?.length || 8;
          const intervalSec = Math.round(120 / totalTokens);
          const elapsed = 120 - (prev - 1);
          const idx = Math.min(totalTokens - 1, Math.floor(elapsed / intervalSec));
          setTokenIndex(idx);
          setQrCodeTimer(intervalSec - (elapsed % intervalSec));
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

  const [selectedSubject, setSelectedSubject] = useState('');

  // Extract unique semester numbers assigned to this faculty member
  const assignedSemesters = (() => {
    const semSet = new Set();
    const rawDept = activeUser?.department || '';
    let subs = Array.isArray(activeUser?.subjects) ? activeUser.subjects : [];
    
    if (subs.length === 0 && rawDept.includes('||SUB:')) {
      try {
        const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) subs = parsed;
      } catch(e) {}
    }

    subs.forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '');
        if (semNum) semSet.add(semNum);
      }
    });

    const list = Array.from(semSet).sort((a, b) => Number(a) - Number(b));
    if (list.length > 0) return list;

    // Fallback: extract semesters from today's/past sessions or logs conducted by this faculty
    const sessionSemSet = new Set();
    (facultySessionsToday || []).forEach(sess => {
      if (sess.semester) {
        const num = String(sess.semester).replace(/\D/g, '');
        if (num) sessionSemSet.add(num);
      }
    });
    (liveLogs || []).forEach(log => {
      if (log.semester) {
        const num = String(log.semester).replace(/\D/g, '');
        if (num) sessionSemSet.add(num);
      }
    });

    return Array.from(sessionSemSet).sort((a, b) => Number(a) - Number(b));
  })();

  // Filter teaching subjects for the currently selected semester
  const availableSubjectsForSem = (() => {
    if (!selectedSemester) return [];
    const rawDept = activeUser?.department || '';
    let subs = Array.isArray(activeUser?.subjects) ? activeUser.subjects : [];
    
    if (subs.length === 0 && rawDept.includes('||SUB:')) {
      try {
        const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) subs = parsed;
      } catch(e) {}
    }

    return subs.filter(s => s && s.subjectName && String(s.semester).replace(/\D/g, '') === String(selectedSemester).replace(/\D/g, ''));
  })();

  // Actions
  const handleStartQrSession = async (sem, div = null, subj = null) => {
    try {
      const res = await fetch('/api/qr/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ semester: sem, division: div, subject: subj })
      });
      const data = await res.json();
      if (res.ok) {
        try { localStorage.setItem(`qr_target_${data.session.id}`, JSON.stringify({ semester: sem, division: div, subject: subj })); } catch(e){}
        setActiveQrSessionDetails({ ...data.session, semester: sem, division: div, subject: subj });
        setQrSessionTimer(120);
        setTokenIndex(0);
        setQrCodeTimer(15);
        fetchStats();
        fetchTodaySessions();
        setActiveTab('otp'); // Switch to view code
      } else {
        alert(data.error || 'Failed to start QR session');
      }
    } catch (err) {
      console.error('Error starting QR session:', err);
    }
  };

  const handleGenerateOtp = async (sem, div = null, subj = null) => {
    try {
      const res = await fetch('/api/otp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ semester: sem, division: div, subject: subj })
      });
      const data = await res.json();
      if (res.ok) {
        try { localStorage.setItem(`otp_target_${data.otp.id}`, JSON.stringify({ semester: sem, division: div, subject: subj })); } catch(e){}
        setActiveOtpDetails({ ...data.otp, semester: sem, division: div, subject: subj });
        setOtpCountdown(120);
        setOtpRemaining(prev => Math.max(0, prev - 1));
        fetchStats();
        fetchTodaySessions();
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
    fetchStudents();
    setSelectedSemester('');
    setSelectedDivision('');
    setSelectedSubject('');
    setAvailableDivisions([]);
    setSemesterModal(type);
  };

  const handleSelectSemesterForModal = (semStr) => {
    const divs = new Set();
    if (studentsList && Array.isArray(studentsList)) {
      studentsList.forEach(st => {
        if (String(st.semester) === String(semStr) && st.division && String(st.division).trim() !== '') {
          divs.add(String(st.division).trim().toUpperCase());
        }
      });
    }
    const sortedDivs = Array.from(divs).sort();

    setSelectedSemester(semStr);
    setAvailableDivisions(sortedDivs);
    setSelectedDivision(sortedDivs.length > 0 ? '' : 'ALL');
    setSelectedSubject('');
  };

  const confirmSemesterAndGenerate = () => {
    if (!selectedSemester) { alert('Please select a semester first!'); return; }
    if (availableDivisions.length > 0 && !selectedDivision) {
      alert('Please select a division (or All Divisions) for this semester!');
      return;
    }
    const availSubjs = availableSubjectsForSem;
    if (availSubjs.length > 0 && !selectedSubject) {
      alert('Please select a teaching subject for this semester!');
      return;
    }
    const sem = selectedSemester;
    const div = (selectedDivision && selectedDivision !== 'ALL') ? selectedDivision : null;
    const subj = selectedSubject || (availSubjs[0] ? (availSubjs[0].shortName || availSubjs[0].subjectName) : null);
    
    setSemesterModal(null);
    setSelectedSemester('');
    setSelectedDivision('');
    setSelectedSubject('');
    setAvailableDivisions([]);

    if (sem) {
      if (semesterModal === 'qr') handleStartQrSession(sem, div, subj);
      else if (semesterModal === 'otp') handleGenerateOtp(sem, div, subj);
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
      const res = await fetch('/api/auth/change-password', {
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
    <div style={{ ...styles.dashboardContainer, padding: isMobile ? '12px 8px' : '30px', gap: isMobile ? '14px' : '30px' }} className="faculty-dashboard-root">

      {/* ===== MODAL OVERLAY ===== */}
      {dashModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
            padding: isMobile ? '0' : '20px'
          }}
          onClick={() => setDashModal(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%', maxWidth: '520px',
              borderRadius: isMobile ? '20px 20px 0 0' : '20px',
              padding: isMobile ? '18px 14px 24px' : '28px',
              maxHeight: isMobile ? '92vh' : '82vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden', position: 'relative'
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
            {dashModal === 'present' && (() => {
              const hasStartedSessions = facultySessionsToday.length > 0;
              const activeSessionId = (dashModalSession && dashModalSession !== 'ALL' && facultySessionsToday.some(s => s.id === dashModalSession))
                ? dashModalSession
                : (facultySessionsToday[facultySessionsToday.length - 1]?.id || facultySessionsToday[0]?.id || null);

              const selectedSess = facultySessionsToday.find(s => s.id === activeSessionId);
              const displaySem = selectedSess?.semester;

              let filteredPresent = [];
              if (hasStartedSessions && selectedSess) {
                if (selectedSess.qr_session_id) {
                  filteredPresent = liveLogs.filter(l => l.status === 'Success' && String(l.qr_session_id) === String(selectedSess.qr_session_id));
                } else if (selectedSess.otp_id) {
                  filteredPresent = liveLogs.filter(l => l.status === 'Success' && String(l.otp_id) === String(selectedSess.otp_id));
                }

                if (selectedSess.semester) {
                  filteredPresent = filteredPresent.filter(l => String(l.semester) === String(selectedSess.semester));
                }
                if (selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL') {
                  filteredPresent = filteredPresent.filter(l => String(l.division || '').trim().toUpperCase() === String(selectedSess.division).trim().toUpperCase());
                }
              }

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <CheckCircle size={24} color="#3b82f6" />
                    <h2 style={{ ...styles.cardTitle, margin: 0 }}>Present Today</h2>
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {hasStartedSessions ? `${filteredPresent.length} students` : '0 students'}
                    </span>
                  </div>

                  {/* Session-wise Filter Buttons */}
                  {hasStartedSessions ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {facultySessionsToday.map(sess => (
                        <button
                          key={sess.id}
                          onClick={() => setDashModalSession(sess.id)}
                          style={{
                            padding: '6px 12px', fontSize: '0.78rem', borderRadius: '6px',
                            border: activeSessionId === sess.id ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                            background: activeSessionId === sess.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                            color: '#ffffff', fontWeight: 'bold', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Folder size={12} /> {sess.displayText}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic', textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      ℹ️ No sessions started today yet.
                    </div>
                  )}

                  {/* Target Session Banner Info */}
                  {selectedSess && (
                    <div style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '14px',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div>
                        <strong>Targeted Class:</strong> Sem {displaySem || 'N/A'}{' '}
                        {selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL'
                          ? `(Division ${selectedSess.division})`
                          : '(All Divisions)'}
                      </div>
                      {selectedSess.subject && (
                        <div style={{ fontWeight: '700', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                          📚 {selectedSess.subject}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasStartedSessions ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                      <p style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary)' }}>No session started today yet.</p>
                      <p style={{ fontSize: '0.85rem' }}>Start a QR Code or OTP session from the dashboard to view present students.</p>
                    </div>
                  ) : filteredPresent.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
                      No present students found for this session.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
                      {filteredPresent.map((l, i) => (
                        <div key={l.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px', borderRadius: '10px',
                          background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)'
                        }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: 'rgba(59, 130, 246, 0.25)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: '700', color: '#3b82f6', flexShrink: 0
                          }}>{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{l.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {l.roll_no ? `Roll: ${l.roll_no} • ` : ''}{l.course} Sem {l.semester}{l.division ? ` (Div ${l.division})` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: '600' }}>✓ Present</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Absent Today Modal */}
            {dashModal === 'absent' && (() => {
              const hasStartedSessions = facultySessionsToday.length > 0;
              const activeSessionId = (dashModalSession && dashModalSession !== 'ALL' && facultySessionsToday.some(s => s.id === dashModalSession))
                ? dashModalSession
                : (facultySessionsToday[facultySessionsToday.length - 1]?.id || facultySessionsToday[0]?.id || null);

              const selectedSess = facultySessionsToday.find(s => s.id === activeSessionId);

              let absentList = [];
              let targetSem = null;
              let targetDiv = null;
              let displaySem = 'N/A';
              const rejectedLogsMap = new Map();

              if (hasStartedSessions && selectedSess) {
                targetSem = selectedSess?.semester;
                targetDiv = selectedSess?.division;

                if (!targetSem && activeQrSessionDetails && String(activeQrSessionDetails.id) === String(selectedSess.qr_session_id)) {
                  targetSem = activeQrSessionDetails.semester;
                  targetDiv = activeQrSessionDetails.division;
                } else if (!targetSem && activeOtpDetails && String(activeOtpDetails.id) === String(selectedSess.otp_id)) {
                  targetSem = activeOtpDetails.semester;
                  targetDiv = activeOtpDetails.division;
                }

                if (!targetSem) {
                  const sampleLog = (liveLogs || []).find(l => 
                    (selectedSess.qr_session_id && String(l.qr_session_id) === String(selectedSess.qr_session_id)) ||
                    (selectedSess.otp_id && String(l.otp_id) === String(selectedSess.otp_id))
                  );
                  if (sampleLog?.semester) {
                    targetSem = sampleLog.semester;
                    if (!targetDiv) targetDiv = sampleLog.division;
                  }
                }

                let targetStudents = [];
                if (targetSem) {
                  const targetSemNum = String(targetSem).replace(/\D/g, '');
                  targetStudents = (studentsList || []).filter(s => {
                    const sSemNum = String(s.semester || '').replace(/\D/g, '');
                    if (sSemNum !== targetSemNum) return false;
                    return isDivMatch(s.division, targetDiv);
                  });
                } else {
                  targetStudents = (studentsList || []).filter(s => isDivMatch(s.division, targetDiv));
                }

                displaySem = targetSem || (targetStudents.length > 0 ? targetStudents[0].semester : 'N/A');

                const presentEnrollments = new Set();

                (liveLogs || []).forEach(l => {
                  if (
                    (selectedSess.qr_session_id && String(l.qr_session_id) === String(selectedSess.qr_session_id)) ||
                    (selectedSess.otp_id && String(l.otp_id) === String(selectedSess.otp_id))
                  ) {
                    const key = String(l.enrollment_no || '').trim().toLowerCase();
                    if (l.status === 'Success') {
                      presentEnrollments.add(key);
                    } else if (l.status === 'Rejected' || l.status === 'Location Mismatch') {
                      if (!rejectedLogsMap.has(key)) rejectedLogsMap.set(key, l);
                    }
                  }
                });

                const absentMap = new Map();
                targetStudents.forEach(st => {
                  const enrollKey = String(st.enrollment_no || '').trim().toLowerCase();
                  if (!presentEnrollments.has(enrollKey)) {
                    absentMap.set(enrollKey, st);
                  }
                });

                rejectedLogsMap.forEach((rejLog, enrollKey) => {
                  if (!presentEnrollments.has(enrollKey) && !absentMap.has(enrollKey)) {
                    const rejSem = String(rejLog.semester || '').replace(/\D/g, '');
                    const targetSemNum = String(displaySem || '').replace(/\D/g, '');
                    const semMatches = !targetSemNum || !rejSem || rejSem === targetSemNum;
                    const divMatches = isDivMatch(rejLog.division, targetDiv);
                    if (semMatches && divMatches) {
                      absentMap.set(enrollKey, {
                        id: rejLog.id || enrollKey,
                        name: rejLog.name || 'Student',
                        enrollment_no: rejLog.enrollment_no || enrollKey,
                        roll_no: rejLog.roll_no || '',
                        course: rejLog.course || '',
                        semester: rejLog.semester || displaySem || '',
                        division: rejLog.division || targetDiv || '',
                        mobile: '',
                        rejLog: rejLog
                      });
                    }
                  }
                });

                absentList = Array.from(absentMap.values());
              }

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <XCircle size={24} color="#ef4444" />
                    <h2 style={{ ...styles.cardTitle, margin: 0 }}>Absent Students Today</h2>
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {hasStartedSessions ? `${absentList.length} students` : '0 students'}
                    </span>
                  </div>

                  {/* Session-wise Filter Buttons */}
                  {hasStartedSessions ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {facultySessionsToday.map(sess => (
                        <button
                          key={sess.id}
                          onClick={() => setDashModalSession(sess.id)}
                          style={{
                            padding: '6px 12px', fontSize: '0.78rem', borderRadius: '6px',
                            border: activeSessionId === sess.id ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                            background: activeSessionId === sess.id ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                            color: '#ffffff', fontWeight: 'bold', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Folder size={12} /> {sess.displayText}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic', textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      ℹ️ No sessions started today yet.
                    </div>
                  )}

                  {/* Target Session Banner Info */}
                  {selectedSess && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '14px',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div>
                        <strong>Targeted Class:</strong> Sem {displaySem || 'N/A'}{' '}
                        {selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL'
                          ? `(Division ${selectedSess.division})`
                          : '(All Divisions)'}
                      </div>
                      {selectedSess.subject && (
                        <div style={{ fontWeight: '700', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          📚 {selectedSess.subject}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasStartedSessions ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                      <p style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary)' }}>No session started today yet.</p>
                      <p style={{ fontSize: '0.85rem' }}>Start a QR Code or OTP session from the dashboard to view absent students.</p>
                    </div>
                  ) : absentList.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
                      {studentsList.length === 0 ? 'Loading students list...' : 'All students in targeted class are present for this session!'}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
                      {absentList.map((s, i) => {
                        const enrollKey = String(s.enrollment_no || '').trim().toLowerCase();
                        const rejLog = rejectedLogsMap.get(enrollKey);
                        return (
                          <div key={s.id || enrollKey || i} style={{
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
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {s.roll_no ? `Roll: ${s.roll_no} • ` : ''}{s.course} Sem {s.semester}{s.division ? ` (Div ${s.division})` : ''}
                                {s.mobile ? ` • Ph: ${s.mobile}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: '600' }}>
                                {rejLog ? `✗ Rejected (${rejLog.status || 'Failed'})` : '✗ Absent'}
                              </div>
                              {rejLog?.time && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Attempt: {rejLog.time}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

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
                      color: 'var(--primary)', fontSize: '0.8rem', fontWeight: '700', marginBottom: '12px'
                    }}>ROTATING QR SESSION</div>
                    {activeQrSessionDetails.semester && (
                      <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Target: Sem {activeQrSessionDetails.semester} {activeQrSessionDetails.division ? `• Div ${activeQrSessionDetails.division}` : '• All Divisions'}
                      </div>
                    )}
                    <div style={{
                      background: '#fff', borderRadius: '16px', padding: '16px',
                      display: 'inline-block', boxShadow: '0 10px 40px rgba(147,51,234,0.3)', margin: '0 auto 20px'
                    }}>
                      <canvas ref={qrCanvasRef} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Token <strong>{tokenIndex + 1}</strong> of {activeQrSessionDetails?.tokens?.length || 8} • Rotates every 15s
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
                      color: '#60a5fa', fontSize: '0.8rem', fontWeight: '700', marginBottom: '12px'
                    }}>STATIC OTP CODE</div>
                    {activeOtpDetails.semester && (
                      <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Target: Sem {activeOtpDetails.semester} {activeOtpDetails.division ? `• Div ${activeOtpDetails.division}` : '• All Divisions'}
                      </div>
                    )}
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
      <nav
        style={{
          ...styles.navBar,
          padding: isMobile ? '10px 14px' : '14px 24px',
          borderRadius: isMobile ? '12px' : '16px',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: isMobile ? '8px' : '0'
        }}
        className="glass-panel faculty-header"
      >
        <div style={{ ...styles.navLeft, gap: isMobile ? '10px' : '16px', alignItems: 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '10px',
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
          }}>
            <GraduationCap size={22} color="#001b3d" />
          </div>
          <div>
            {(() => {
              const rawDept = activeUser?.department || '';
              const cleanDept = rawDept.includes('||SUB:') ? rawDept.split('||SUB:')[0].trim() : (rawDept || 'BCA');
              
              let userSubs = Array.isArray(activeUser?.subjects) ? activeUser.subjects : [];
              if (userSubs.length === 0 && rawDept.includes('||SUB:')) {
                try {
                  const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
                  const parsed = JSON.parse(jsonStr);
                  if (Array.isArray(parsed)) userSubs = parsed;
                } catch(e) {}
              }

              const validSubs = userSubs.filter(s => s && s.subjectName && String(s.subjectName).trim() !== '');

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h1 style={{ ...styles.navTitle, fontSize: isMobile ? '1rem' : '1.25rem', margin: 0, fontWeight: '700' }}>Faculty Hub</h1>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        fontWeight: '700',
                        letterSpacing: '0.5px'
                      }}
                    >
                      {cleanDept}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      👨‍🏫 {activeUser?.name || 'Faculty Member'}
                    </span>

                    {validSubs.length > 0 ? (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>•</span>
                        {validSubs.map((sItem, sIdx) => {
                          const displayName = (sItem.shortName && String(sItem.shortName).trim() !== '') 
                            ? String(sItem.shortName).trim() 
                            : sItem.subjectName;
                          return (
                            <span
                              key={sIdx}
                              title={sItem.shortName ? `${sItem.subjectName} (${sItem.shortName})` : sItem.subjectName}
                              style={{
                                fontSize: '0.73rem',
                                padding: '2px 9px',
                                borderRadius: '12px',
                                background: 'rgba(168, 85, 247, 0.12)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.28)',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              📚 {displayName} <span style={{ opacity: 0.85, fontWeight: '700', color: '#a855f7' }}>(Sem {sItem.semester || '1'})</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        • No teaching subjects assigned
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
        <div style={{ ...styles.navRight, gap: isMobile ? '8px' : '14px' }}>
          <button
            onClick={toggleTheme}
            className="btn btn-secondary icon-btn-circle theme-toggle-btn"
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={onLogout} style={{ ...styles.logoutBtn, padding: isMobile ? '6px 12px' : '8px 16px', fontSize: isMobile ? '0.82rem' : '0.88rem' }} className="btn">
            <LogOut size={16} />
            {isMobile ? '' : 'Logout'}
          </button>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div style={{
        ...styles.mainGrid,
        gridTemplateColumns: isMobile ? '100%' : '260px 1fr',
        gap: isMobile ? '12px' : '24px',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {/* Sidebar Nav */}
        <aside
          style={{
            ...styles.sidebar,
            flexShrink: 0,
            padding: isMobile ? '10px' : '24px 16px',
            borderRadius: isMobile ? '16px' : '16px',
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
          }}
          className="glass-panel faculty-sidebar"
        >
          <ul style={{
            ...styles.sideMenuList,
            display: isMobile ? 'grid' : 'flex',
            gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : undefined,
            flexDirection: isMobile ? undefined : 'column',
            gap: isMobile ? '6px' : '8px',
            width: '100%',
            padding: 0,
            margin: 0
          }}>
            <li style={{ width: '100%', minWidth: 0 }}>
              <button
                onClick={() => setActiveTab('dashboard')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'dashboard' ? styles.menuItemBtnActive : {}),
                  ...(isMobile ? { padding: '8px 4px', fontSize: '0.78rem', width: '100%', justifyContent: 'center', gap: '4px' } : {})
                }}
              >
                <Users size={isMobile ? 15 : 18} />
                Dashboard
              </button>
            </li>
            <li style={{ width: '100%', minWidth: 0 }}>
              <button
                onClick={() => setActiveTab('otp')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'otp' ? styles.menuItemBtnActive : {}),
                  ...(isMobile ? { padding: '8px 4px', fontSize: '0.78rem', width: '100%', justifyContent: 'center', gap: '4px' } : {})
                }}
              >
                <QrCode size={isMobile ? 15 : 18} />
                OTP/QR
              </button>
            </li>
            <li style={{ width: '100%', minWidth: 0 }}>
              <button
                onClick={() => {
                  setActiveTab('manual');
                  fetchTodaySessions();
                  fetchLiveLogs();
                  fetchTodayAllAttendance();
                }}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'manual' ? styles.menuItemBtnActive : {}),
                  ...(activeTab === 'manual' ? {} : { color: '#f59e0b' }),
                  ...(isMobile ? { padding: '8px 4px', fontSize: '0.78rem', width: '100%', justifyContent: 'center', gap: '4px' } : {})
                }}
              >
                <ClipboardList size={isMobile ? 15 : 18} />
                Manual
              </button>
            </li>
            <li style={{ width: '100%', minWidth: 0 }}>
              <button
                onClick={() => setActiveTab('reports')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'reports' ? styles.menuItemBtnActive : {}),
                  ...(isMobile ? { padding: '8px 4px', fontSize: '0.78rem', width: '100%', justifyContent: 'center', gap: '4px' } : {})
                }}
              >
                <BarChart3 size={isMobile ? 15 : 18} />
                Reports
              </button>
            </li>
            <li style={{ width: '100%', minWidth: 0 }}>
              <button
                onClick={() => setActiveTab('settings')}
                style={{
                  ...styles.menuItemBtn,
                  ...(activeTab === 'settings' ? styles.menuItemBtnActive : {}),
                  ...(isMobile ? { padding: '8px 4px', fontSize: '0.78rem', width: '100%', justifyContent: 'center', gap: '4px' } : {})
                }}
              >
                <KeyRound size={isMobile ? 15 : 18} />
                Settings
              </button>
            </li>
          </ul>
        </aside>

        {/* Content Pane */}
        <main style={{ ...styles.contentPane, minWidth: 0, width: '100%', flex: 1, height: '100%', maxHeight: '100%', overflowY: 'auto', paddingRight: '6px' }}>
          {activeTab === 'dashboard' && (
            <div style={{ ...styles.tabContent, gap: isMobile ? '16px' : '30px' }}>
              {/* Statistics Grid */}
              <div className="grid-3-cols" style={{ marginBottom: isMobile ? '10px' : '20px' }}>

                {/* Present Today - Clickable */}
                <div
                  className="glass-panel"
                  style={{ ...styles.statCard, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onClick={() => setDashModal('present')}
                  title="Click to see present students"
                >
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>Present Today</span>
                    <CheckCircle size={20} color="#3b82f6" />
                  </div>
                  <div style={styles.statVal}>{facultySessionsToday.length > 0 ? stats.presentToday : 0}</div>
                  <div style={styles.statSubText}>{facultySessionsToday.length > 0 ? 'Students marked present' : 'No session started today'}</div>
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
                  <div style={styles.statVal}>{facultySessionsToday.length > 0 ? stats.absentToday : 0}</div>
                  <div style={styles.statSubText}>{facultySessionsToday.length > 0 ? `Out of ${stats.totalStudents} total` : 'No session started today'}</div>
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

              {/* All Attendance Records Directory */}
              <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px' }}>
                <div className="mobile-stack-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={styles.cardTitle}>
                      {selectedSemFolder
                        ? (selectedSessionFolder ? `📁 ${selectedSessionFolder.title} Directory` : `📁 Semester ${selectedSemFolder} Attendance Directory`)
                        : '📁 All Attendance Records Directory'}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: '6px' }}>
                      {selectedSemFolder
                        ? 'Select a date or session folder to view present and absent student records.'
                        : 'Click on your assigned semester folder to view date-wise session attendance archives.'}
                    </p>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📅 Date Archive
                  </div>
                </div>

                {selectedSemFolder === null ? (
                  <>
                    {/* Assigned Semester Folder Cards Grid */}
                    <div className="semester-folder-grid" style={{ display: 'grid', width: '100%', boxSizing: 'border-box', marginTop: '16px' }}>
                      {assignedSemesters.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No teaching semesters mapped to your profile yet.
                        </div>
                      ) : (
                        assignedSemesters.map(sem => {
                          return (
                            <div
                              key={sem}
                              onClick={() => { setSelectedSemFolder(sem); setFolderDivFilter('ALL'); setSelectedSessionFolder(null); }}
                              style={{
                                background: 'rgba(245, 158, 11, 0.06)',
                                border: '1.5px solid rgba(245, 158, 11, 0.25)',
                                borderRadius: '16px',
                                padding: isMobile ? '14px 12px' : '22px 18px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(245, 158, 11, 0.25)'; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Folder size={32} color="#f59e0b" />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '3px 9px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                                  Teaching Sem
                                </span>
                              </div>

                              <div>
                                <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                                  Sem {sem} Folder
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Click to view date-wise session folders
                                </div>
                              </div>

                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ width: '100%', padding: '7px 0', fontSize: '0.8rem', marginTop: '4px' }}
                              >
                                📂 Open Sem {sem} Directory
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  /* Single Semester Folder View */
                  <>
                    {/* Top Header Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                      <button
                        onClick={() => { setSelectedSemFolder(null); setSelectedSessionFolder(null); setFolderSearchName(''); setFolderSearchEnroll(''); setFolderSearchDate(new Date().toISOString().split('T')[0]); setFolderDivFilter('ALL'); }}
                        className="btn btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                      >
                        ← Back
                      </button>
                    </div>

                    {/* Date Filter Bar */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', padding: '14px 18px', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-light)', alignItems: 'center' }}>
                      {/* Date Filter */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar size={18} color="#a855f7" />
                        <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>Select Date:</label>
                        <input
                          type="date"
                          value={folderSearchDate}
                          onChange={(e) => {
                            setFolderSearchDate(e.target.value);
                            setSelectedSessionFolder(null);
                          }}
                          style={{
                            padding: '6px 12px', borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    </div>

                    {/* View 1: Session Folders Grid for Selected Date */}
                    {!selectedSessionFolder ? (
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Folder size={18} color="#a855f7" />
                          Session Folders on {folderSearchDate || 'Selected Date'}
                        </h4>

                        {(() => {
                          const targetDate = folderSearchDate;
                          
                          const normDate = (raw) => {
                            if (!raw) return '';
                            const s = String(raw).trim();
                            if (s.includes('T')) return s.split('T')[0];
                            if (s.includes('/')) {
                              const p = s.split('/');
                              if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
                            }
                            return s;
                          };

                          const combinedLogsList = [...(liveLogs || []), ...(dateLogs || [])];
                          const logsForDate = combinedLogsList.filter(log => {
                            if (String(log.semester || '') !== String(selectedSemFolder)) return false;
                            if (folderDivFilter !== 'ALL' && !isDivMatch(log.division, folderDivFilter)) return false;
                            if (targetDate) {
                              const d = normDate(log.date || log.created_at);
                              if (d && d !== targetDate) return false;
                            }
                            return true;
                          });

                          const sessionsMap = new Map();

                          logsForDate.forEach(log => {
                            let sessKey = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : `manual_${log.time || log.id}`;
                            if (!sessionsMap.has(sessKey)) {
                              let sessType = log.qr_session_id ? 'Live QR Session' : log.otp_id ? 'OTP Session' : 'Manual Session';
                              sessionsMap.set(sessKey, {
                                id: sessKey,
                                qr_session_id: log.qr_session_id || null,
                                otp_id: log.otp_id || null,
                                type: sessType,
                                division: log.division || folderDivFilter,
                                subject: log.subject || null,
                                time: log.time || 'Session',
                                logs: []
                              });
                            }
                            sessionsMap.get(sessKey).logs.push(log);
                          });

                          const todayStr = new Date().toISOString().split('T')[0];
                          if (!targetDate || targetDate === todayStr) {
                            (facultySessionsToday || []).forEach((fSess) => {
                              if (String(fSess.semester || '') === String(selectedSemFolder)) {
                                if (folderDivFilter === 'ALL' || isDivMatch(fSess.division, folderDivFilter)) {
                                  let sessKey = fSess.qr_session_id ? `qr_${fSess.qr_session_id}` : fSess.otp_id ? `otp_${fSess.otp_id}` : `sess_${fSess.id}`;
                                  if (!sessionsMap.has(sessKey)) {
                                    sessionsMap.set(sessKey, {
                                      id: sessKey,
                                      qr_session_id: fSess.qr_session_id || null,
                                      otp_id: fSess.otp_id || null,
                                      type: fSess.type ? `${fSess.type} Session` : 'Live Session',
                                      division: fSess.division || folderDivFilter,
                                      subject: fSess.subject || null,
                                      time: fSess.created_at ? new Date(fSess.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today',
                                      logs: logsForDate.filter(l => 
                                        (fSess.qr_session_id && String(l.qr_session_id) === String(fSess.qr_session_id)) ||
                                        (fSess.otp_id && String(l.otp_id) === String(fSess.otp_id))
                                      )
                                    });
                                  }
                                }
                              }
                            });
                          }

                          const sessionList = Array.from(sessionsMap.values()).map((s, idx) => {
                            const presentCount = s.logs.filter(l => l.status === 'Success').length;
                            const targetSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                            const targetClassCount = (studentsList || []).filter(st => {
                              const sSemNum = String(st.semester || '').replace(/\D/g, '');
                              if (targetSemNum && sSemNum !== targetSemNum) return false;
                              return isDivMatch(st.division, s.division);
                            }).length;
                            const absentCount = Math.max(0, targetClassCount - presentCount);

                            return {
                              ...s,
                              sessionNumber: idx + 1,
                              title: `Session ${idx + 1}`,
                              presentCount,
                              absentCount
                            };
                          });

                          if (sessionList.length === 0) {
                            return (
                              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                                <Folder size={40} color="var(--text-muted)" style={{ marginBottom: '10px', opacity: 0.5 }} />
                                <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                  No sessions conducted on {folderSearchDate || 'this date'} for Semester {selectedSemFolder}.
                                </p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                                  Select a different date from the date picker above to view session folders.
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="semester-folder-grid" style={{ display: 'grid', width: '100%', boxSizing: 'border-box' }}>
                              {sessionList.map(sess => (
                                <div
                                  key={sess.id}
                                  onClick={() => setSelectedSessionFolder(sess)}
                                  style={{
                                    background: 'rgba(147, 51, 234, 0.08)',
                                    border: '1.5px solid rgba(147, 51, 234, 0.3)',
                                    borderRadius: '16px',
                                    padding: '18px 16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(147, 51, 234, 0.2)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Folder size={32} color="#a855f7" />
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: '700' }}>
                                        ✓ {sess.presentCount} Present
                                      </span>
                                      <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontWeight: '700' }}>
                                        ✕ {sess.absentCount} Absent
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontWeight: '700', fontSize: '1.02rem', color: 'var(--text-primary)' }}>
                                      {sess.title}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#a855f7', fontWeight: '600', marginTop: '2px' }}>
                                      Sem {selectedSemFolder} {sess.division && String(sess.division).toUpperCase() !== 'ALL' ? `(Div ${sess.division})` : '(All Div)'}
                                    </div>
                                    {sess.subject && (
                                      <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: '700', marginTop: '4px' }}>
                                        📚 {sess.subject}
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '6px 0', fontSize: '0.8rem', marginTop: '4px' }}
                                  >
                                    📂 Open {sess.title} Folder
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      /* View 2: Inside Selected Session Directory */
                      (() => {
                        const presentLogs = selectedSessionFolder.logs ? selectedSessionFolder.logs.filter(l => l.status === 'Success') : [];
                        const presentEnrollments = new Set(presentLogs.map(l => String(l.enrollment_no || '').trim().toLowerCase()));

                        const targetSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                        const targetStudents = (studentsList || []).filter(s => {
                          const sSemNum = String(s.semester || '').replace(/\D/g, '');
                          if (targetSemNum && sSemNum !== targetSemNum) return false;
                          return isDivMatch(s.division, selectedSessionFolder.division);
                        });

                        const absentStudents = targetStudents.filter(st => {
                          const key = String(st.enrollment_no || '').trim().toLowerCase();
                          return !presentEnrollments.has(key);
                        });

                        const defaultSemSubj = (() => {
                          const rawDept = activeUser?.department || '';
                          let subs = Array.isArray(activeUser?.subjects) ? activeUser.subjects : [];
                          if (subs.length === 0 && rawDept.includes('||SUB:')) {
                            try {
                              const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
                              const parsed = JSON.parse(jsonStr);
                              if (Array.isArray(parsed)) subs = parsed;
                            } catch(e) {}
                          }
                          const match = subs.find(s => s && String(s.semester).replace(/\D/g, '') === String(selectedSemFolder).replace(/\D/g, ''));
                          return match ? (match.shortName || match.subjectName) : null;
                        })();

                        const sessSubject = selectedSessionFolder.subject ||
                          (selectedSessionFolder.logs && selectedSessionFolder.logs.find(l => l.subject)?.subject) ||
                          defaultSemSubj ||
                          'Subject';

                        return (
                          <div>
                            {/* Session Directory Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => setSelectedSessionFolder(null)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                              >
                                ← Back to Session Folders
                              </button>
                              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {selectedSessionFolder.title} Directory (Sem {selectedSemFolder} {selectedSessionFolder.division && String(selectedSessionFolder.division).toUpperCase() !== 'ALL' ? `Div ${selectedSessionFolder.division}` : ''}) • {folderSearchDate}
                              </div>
                              <span style={{
                                fontSize: '0.85rem',
                                padding: '4px 12px',
                                borderRadius: '10px',
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                fontWeight: '700',
                                marginLeft: 'auto',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                📚 {sessSubject}
                              </span>
                            </div>

                            {/* Present / Absent Tab Switcher */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                              <button
                                type="button"
                                onClick={() => setSessionFolderTab('present')}
                                style={{
                                  padding: '8px 18px', borderRadius: '10px', fontWeight: '700', fontSize: '0.88rem',
                                  cursor: 'pointer', transition: 'all 0.15s ease',
                                  border: sessionFolderTab === 'present' ? '2px solid #22c55e' : '1px solid var(--border-light)',
                                  background: sessionFolderTab === 'present' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                                  color: sessionFolderTab === 'present' ? '#4ade80' : 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                              >
                                <CheckCircle size={16} /> Present Students ({presentLogs.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setSessionFolderTab('absent')}
                                style={{
                                  padding: '8px 18px', borderRadius: '10px', fontWeight: '700', fontSize: '0.88rem',
                                  cursor: 'pointer', transition: 'all 0.15s ease',
                                  border: sessionFolderTab === 'absent' ? '2px solid #ef4444' : '1px solid var(--border-light)',
                                  background: sessionFolderTab === 'absent' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                  color: sessionFolderTab === 'absent' ? '#f87171' : 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                              >
                                <XCircle size={16} /> Absent Students ({absentStudents.length})
                              </button>
                            </div>

                            {/* Search Filters */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                  className="glass-input"
                                  style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
                                  placeholder="Search student by name or roll no..."
                                  value={folderSearchName}
                                  onChange={e => setFolderSearchName(e.target.value)}
                                />
                              </div>
                              {folderSearchName && (
                                <button
                                  onClick={() => setFolderSearchName('')}
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                >Clear</button>
                              )}
                            </div>

                            {/* Tab 1: Present Students Table */}
                            {sessionFolderTab === 'present' && (
                              <div style={styles.tableScrollable} className="custom-table-container">
                                <table className="custom-table" style={styles.table}>
                                  <thead>
                                    <tr>
                                      <th style={styles.tableTh}>Roll No</th>
                                      <th style={styles.tableTh}>Student Name</th>
                                      <th style={styles.tableTh}>Sem & Division</th>
                                      <th style={styles.tableTh}>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const filteredPresent = presentLogs.filter(st => {
                                        return !folderSearchName || 
                                          (st.name && st.name.toLowerCase().includes(folderSearchName.toLowerCase())) ||
                                          (st.roll_no && String(st.roll_no).includes(folderSearchName)) ||
                                          (st.enrollment_no && st.enrollment_no.toLowerCase().includes(folderSearchName.toLowerCase()));
                                      });

                                      if (filteredPresent.length === 0) {
                                        return (
                                          <tr>
                                            <td colSpan={4} style={{ ...styles.noDataRow, textAlign: 'center' }}>
                                              No present student records found for this session.
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return filteredPresent.map((st, idx) => (
                                        <tr key={st.id || idx}>
                                          <td style={{ ...styles.tableTd, fontWeight: '700', color: 'var(--primary)' }}>{st.roll_no || '-'}</td>
                                          <td style={{ ...styles.tableTd, fontWeight: '600' }}>{st.name}</td>
                                          <td style={styles.tableTd}>Sem {st.semester || selectedSemFolder} {st.division ? `(Div ${st.division})` : ''}</td>
                                          <td style={styles.tableTd}>
                                            <span style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: '700', fontSize: '0.78rem' }}>
                                              ✓ Present
                                            </span>
                                          </td>
                                        </tr>
                                      ));
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Tab 2: Absent Students Table */}
                            {sessionFolderTab === 'absent' && (
                              <div style={styles.tableScrollable} className="custom-table-container">
                                <table className="custom-table" style={styles.table}>
                                  <thead>
                                    <tr>
                                      <th style={styles.tableTh}>Roll No</th>
                                      <th style={styles.tableTh}>Student Name</th>
                                      <th style={styles.tableTh}>Sem & Division</th>
                                      <th style={styles.tableTh}>Phone Number</th>
                                      <th style={styles.tableTh}>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const filteredAbsent = absentStudents.filter(st => {
                                        return !folderSearchName || 
                                          (st.name && st.name.toLowerCase().includes(folderSearchName.toLowerCase())) ||
                                          (st.roll_no && String(st.roll_no).includes(folderSearchName)) ||
                                          (st.enrollment_no && st.enrollment_no.toLowerCase().includes(folderSearchName.toLowerCase()));
                                      });

                                      if (filteredAbsent.length === 0) {
                                        return (
                                          <tr>
                                            <td colSpan={5} style={{ ...styles.noDataRow, textAlign: 'center' }}>
                                              All students in targeted class are present for this session!
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return filteredAbsent.map((st, idx) => (
                                        <tr key={st.id || idx}>
                                          <td style={{ ...styles.tableTd, fontWeight: '700', color: '#f87171' }}>{st.roll_no || '-'}</td>
                                          <td style={{ ...styles.tableTd, fontWeight: '600' }}>{st.name}</td>
                                          <td style={styles.tableTd}>Sem {st.semester || selectedSemFolder} {st.division ? `(Div ${st.division})` : ''}</td>
                                          <td style={styles.tableTd}>{st.mobile || st.phone || '-'}</td>
                                          <td style={styles.tableTd}>
                                            <span style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontWeight: '700', fontSize: '0.78rem' }}>
                                              ✕ Absent
                                            </span>
                                          </td>
                                        </tr>
                                      ));
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'otp' && (
            <div style={styles.tabContent}>

              {/* Generator Controls at top */}
              <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px', marginBottom: '20px' }}>
                <div className="mobile-stack-header" style={styles.flexSpaceBetween}>
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
                    {activeQrSessionDetails.semester && (
                      <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-secondary)', margin: '10px 0' }}>
                        Target: Sem {activeQrSessionDetails.semester} {activeQrSessionDetails.division ? `• Div ${activeQrSessionDetails.division}` : '• All Divisions'} {activeQrSessionDetails.subject ? `• 📚 ${activeQrSessionDetails.subject}` : ''}
                      </div>
                    )}

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
                      Token index {tokenIndex + 1} of {activeQrSessionDetails?.tokens?.length || 8} is active. Keep this screen visible to the class.
                    </p>
                    <button
                      className="btn btn-secondary"
                      onClick={() => { setActiveQrSessionDetails(null); setQrSessionTimer(0); }}
                      style={{ marginTop: '16px', width: '100%', fontSize: '0.85rem' }}
                    >
                      End Current Session
                    </button>
                  </div>
                ) : activeOtpDetails ? (
                  <div style={styles.qrDisplayBox}>
                    <div style={{ ...styles.qrBadge, background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', color: '#60a5fa' }}>
                      STATIC OTP CODE
                    </div>
                    {activeOtpDetails.semester && (
                      <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-secondary)', margin: '10px 0' }}>
                        Target: Sem {activeOtpDetails.semester} {activeOtpDetails.division ? `• Div ${activeOtpDetails.division}` : '• All Divisions'} {activeOtpDetails.subject ? `• 📚 ${activeOtpDetails.subject}` : ''}
                      </div>
                    )}

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
            <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px' }}>
              <div className="mobile-stack-header" style={styles.flexSpaceBetween}>
                <h2 style={styles.cardTitle}>Attendance Database Reports</h2>
                <div style={styles.buttonStackRow}>
                  <button onClick={handleExportPDF} className="btn btn-success" style={{ gap: '8px' }}>
                    <Download size={14} />
                    PDF
                  </button>
                  <button onClick={handleExportExcel} className="btn btn-success" style={{ gap: '8px' }}>
                    <Download size={14} />
                    Excel
                  </button>
                  <button onClick={handleExportCSV} className="btn btn-success" style={{ gap: '8px' }}>
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
                    <option value="last_week" style={{ color: '#000' }}>Last 7 Days (Last Week)</option>
                    <option value="last_month" style={{ color: '#000' }}>Last 30 Days (Last Month)</option>
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

              {/* Semester Folder Navigation (4 per row grid) */}
              <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Folder size={16} color="#a855f7" /> Assigned Semester Folders:
                </div>
                <div className="semester-folder-grid" style={{ gap: '8px', marginBottom: 0 }}>
                  <button
                    type="button"
                    className={`btn ${filterSem === '' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFilterSem('')}
                    style={{ fontSize: '0.82rem', padding: '8px 6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                  >
                    <Folder size={14} /> All Folders
                  </button>
                  {assignedSemesters.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`btn ${filterSem === String(s) ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFilterSem(String(s))}
                      style={{ fontSize: '0.82rem', padding: '8px 6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                    >
                      <Folder size={14} /> Sem {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Filters Row */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                <div style={{ ...styles.filterGroup, width: isMobile ? '100%' : 'auto', flex: isMobile ? 'none' : '1' }}>
                  <label style={styles.filterLabel}>Search By Roll No</label>
                  <input
                    type="text"
                    placeholder="Search By Roll No..."
                    value={filterEnrollment}
                    onChange={(e) => setFilterEnrollment(e.target.value)}
                    style={{ ...styles.selectInput, width: isMobile ? '100%' : '180px' }}
                  />
                </div>
                <div style={{ ...styles.filterGroup, width: isMobile ? '100%' : 'auto', flex: isMobile ? 'none' : '1' }}>
                  <label style={styles.filterLabel}>Search By Name</label>
                  <input
                    type="text"
                    placeholder="Search By Name..."
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    style={{ ...styles.selectInput, width: isMobile ? '100%' : '180px' }}
                  />
                </div>
                {(filterEnrollment || filterName || filterSem) && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', width: isMobile ? '100%' : 'auto' }}>
                    <button
                      onClick={() => { setFilterEnrollment(''); setFilterName(''); setFilterSem(''); }}
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px', fontSize: '0.82rem', width: isMobile ? '100%' : 'auto' }}
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
            <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px' }}>
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

        
          {/* ===== MANUAL ATTENDANCE TAB ===== */}
          {activeTab === 'manual' && (
            <div style={styles.tabContent}>
              {/* Header */}
              <div className="glass-panel" style={{ ...styles.cardPadding, marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 6px 20px rgba(245,158,11,0.35)', flexShrink: 0
                  }}>
                    <ClipboardList size={24} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ ...styles.cardTitle, margin: 0 }}>Manual Attendance</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px', margin: 0 }}>
                      Mark attendance manually per session for students without a smartphone.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => { fetchTodaySessions(); fetchTodayAllAttendance(); fetchLiveLogs(); }}
                    style={{ gap: '8px', flexShrink: 0 }}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  Present (via Smartphone)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  Present (Manually by Faculty)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  Absent / Not Yet Marked
                </div>
              </div>

              {/* Session Folder View or Student List */}
              {!manualSessionFolder ? (
                /* Dynamic Generated Session Folders Grid */
                <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px' }}>
                  <h3 style={{ ...styles.cardTitle, marginBottom: '20px' }}>Select Today's Session Folder</h3>

                  {(() => {
                    const safeSessions = Array.isArray(facultySessionsToday) ? facultySessionsToday : [];
                    if (safeSessions.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                          <Folder size={48} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                          <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary)' }}>No sessions started today yet.</p>
                          <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>Please generate a Live QR or OTP session from the OTP/QR tab first to create a session folder.</p>
                        </div>
                      );
                    }

                    return (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '16px'
                      }}>
                        {safeSessions.map(sess => {
                          const targetSemNum = String(sess.semester || '').replace(/\D/g, '');
                          const targetStudents = (studentsList || []).filter(s => {
                            const sSemNum = String(s.semester || '').replace(/\D/g, '');
                            if (targetSemNum && sSemNum !== targetSemNum) return false;
                            return isDivMatch(s.division, sess.division);
                          });

                          const safeLogs = Array.isArray(manualTodayLogs) ? manualTodayLogs : [];
                          const sessionPresentCount = safeLogs.filter(l => {
                            if (l.status !== 'Success') return false;
                            if (sess.qr_session_id && String(l.qr_session_id) === String(sess.qr_session_id)) return true;
                            if (sess.otp_id && String(l.otp_id) === String(sess.otp_id)) return true;
                            return false;
                          }).length;

                          return (
                            <div
                              key={sess.id}
                              onClick={() => {
                                setManualSessionFolder(sess.id);
                                setManualSearchName('');
                              }}
                              style={{
                                background: 'rgba(245,158,11,0.07)',
                                border: '1.5px solid rgba(245,158,11,0.25)',
                                borderRadius: '16px',
                                padding: '22px 16px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(245,158,11,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                              <Folder size={36} color="#f59e0b" style={{ marginBottom: '10px' }} />
                              <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                Session {sess.sessionNumber}
                              </div>
                              <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#f59e0b', marginTop: '4px' }}>
                                Sem {sess.semester || '?'} {sess.division && String(sess.division).trim().toUpperCase() !== 'ALL' ? `(Div ${sess.division})` : '(All Div)'}
                              </div>
                              {sess.subject ? (
                                <div style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  📚 {sess.subject}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                  {targetStudents.length} students
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (() => {
                /* Inside a Session Folder */
                const safeSessions = Array.isArray(facultySessionsToday) ? facultySessionsToday : [];
                const selectedSess = safeSessions.find(s => s.id === manualSessionFolder);
                if (!selectedSess) return null;

                const targetSemNum = String(selectedSess.semester || '').replace(/\D/g, '');
                const targetStudents = (studentsList || []).filter(s => {
                  const sSemNum = String(s.semester || '').replace(/\D/g, '');
                  if (targetSemNum && sSemNum !== targetSemNum) return false;
                  return isDivMatch(s.division, selectedSess.division);
                });

                const filteredStudents = targetStudents.filter(s => {
                  return !manualSearchName || (s.name && s.name.toLowerCase().includes(manualSearchName.toLowerCase()));
                });

                return (
                  <div className="glass-panel" style={styles.cardPadding}>
                    {/* Breadcrumb + Back */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setManualSessionFolder(null)}
                        className="btn btn-secondary"
                        style={{ gap: '8px', fontSize: '0.82rem', padding: '8px 14px' }}
                      >
                        ← All Session Folders
                      </button>
                      <h3 style={{ ...styles.cardTitle, margin: 0 }}>
                        Session {selectedSess.sessionNumber} Folder Directory
                      </h3>
                      <span style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: '600', marginLeft: 'auto' }}>
                        Target: Sem {selectedSess.semester || '?'} {selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL' ? `(Division ${selectedSess.division})` : '(All Divisions)'} {selectedSess.subject ? `• 📚 ${selectedSess.subject}` : ''}
                      </span>
                    </div>

                    {/* Search */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          className="glass-input"
                          style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
                          placeholder="Search student by name..."
                          value={manualSearchName}
                          onChange={e => setManualSearchName(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Students Table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ ...styles.table, minWidth: '600px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <th style={styles.tableTh}>Roll No</th>
                            <th style={styles.tableTh}>Name</th>
                            <th style={styles.tableTh}>Division</th>
                            <th style={styles.tableTh}>Status</th>
                            <th style={styles.tableTh}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ ...styles.noDataRow, textAlign: 'center' }}>No students found for this session class.</td>
                            </tr>
                          ) : filteredStudents.map(student => {
                            const safeLogs = Array.isArray(manualTodayLogs) ? manualTodayLogs : [];
                            const sessionRecord = safeLogs.find(l => {
                              const matchStudent = (l.student_id && String(l.student_id) === String(student.id)) ||
                                (l.enrollment_no && l.enrollment_no === student.enrollment_no) ||
                                (l.roll_no && l.roll_no === student.roll_no);
                              if (!matchStudent) return false;
                              if (selectedSess.qr_session_id && String(l.qr_session_id) === String(selectedSess.qr_session_id)) return true;
                              if (selectedSess.otp_id && String(l.otp_id) === String(selectedSess.otp_id)) return true;
                              return false;
                            });

                            const isPresent = sessionRecord && sessionRecord.status === 'Success';
                            const isManual = sessionRecord && sessionRecord.device_id === 'Manual';
                            const isPhone = isPresent && !isManual;
                            const isActionPending = manualActionMsg.id === student.id;

                            return (
                              <tr key={student.id} style={{ transition: 'background 0.15s' }}>
                                <td style={{ ...styles.tableTd, fontWeight: '700', color: 'var(--primary)' }}>{student.roll_no || '-'}</td>
                                <td style={{ ...styles.tableTd, fontWeight: '600' }}>{student.name}</td>
                                <td style={styles.tableTd}>
                                  {student.division ? (
                                    <span style={{ padding: '2px 8px', background: 'rgba(245,158,11,0.15)', borderRadius: '6px', color: '#fbbf24', fontSize: '0.78rem', fontWeight: '700' }}>
                                      {student.division}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td style={styles.tableTd}>
                                  {isPhone ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(34,197,94,0.12)', color: '#4ade80', fontSize: '0.78rem', fontWeight: '700' }}>
                                      <Smartphone size={12} /> Phone
                                    </span>
                                  ) : isManual ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '0.78rem', fontWeight: '700' }}>
                                      <ClipboardList size={12} /> Manual
                                    </span>
                                  ) : (
                                    <span style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: '0.78rem', fontWeight: '600' }}>
                                      Absent
                                    </span>
                                  )}
                                </td>
                                <td style={styles.tableTd}>
                                  {isActionPending && manualActionMsg.type === 'error' && manualActionMsg.text ? (
                                    <span style={{ fontSize: '0.8rem', color: '#f87171', fontWeight: '600' }}>
                                      {manualActionMsg.text}
                                    </span>
                                  ) : isPhone ? (
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Already via Phone</span>
                                  ) : isManual ? (
                                    <button
                                      onClick={() => handleManualUnmark(student, selectedSess)}
                                      style={{
                                        padding: '6px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '600',
                                        border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)',
                                        color: '#f87171', cursor: 'pointer', transition: 'all 0.15s ease'
                                      }}
                                      title="Mark Absent for this Session"
                                    >
                                      Mark Absent
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleManualMark(student, selectedSess)}
                                      style={{
                                        padding: '6px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700',
                                        border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title="Mark Present for this Session"
                                    >
                                      Mark Present
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
</main>
      </div>

      {/* ===== SEMESTER, DIVISION & SUBJECT SELECT MODAL FOR GENERATION ===== */}
      {semesterModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
          onClick={() => setSemesterModal(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%', maxWidth: '440px', borderRadius: '20px',
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

            <h3 style={{ ...styles.cardTitle, marginBottom: '6px' }}>
              Start {semesterModal === 'qr' ? 'QR Code' : 'OTP'} Session
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Select assigned semester, division & teaching subject:
            </p>

            {/* Step 1: Assigned Semesters Only */}
            <div style={{ textAlign: 'left', marginBottom: '16px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                1️⃣ Select Semester:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {assignedSemesters.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectSemesterForModal(String(s))}
                    style={{
                      padding: '10px 6px', borderRadius: '10px', fontWeight: '700',
                      fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s ease',
                      border: selectedSemester === String(s) ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                      background: selectedSemester === String(s) ? 'rgba(147,51,234,0.25)' : 'rgba(255,255,255,0.05)',
                      color: selectedSemester === String(s) ? '#a855f7' : 'var(--text-primary)'
                    }}
                  >
                    Sem {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Division Selection (Conditional on Selected Semester) */}
            {selectedSemester && (
              <div style={{ textAlign: 'left', marginBottom: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                  2️⃣ Select Division (Sem {selectedSemester}):
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedDivision('ALL')}
                    style={{
                      padding: '7px 14px', borderRadius: '8px', fontWeight: '600',
                      fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s ease',
                      border: selectedDivision === 'ALL' ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                      background: selectedDivision === 'ALL' ? 'rgba(147,51,234,0.25)' : 'rgba(255,255,255,0.05)',
                      color: selectedDivision === 'ALL' ? '#a855f7' : 'var(--text-primary)'
                    }}
                  >
                    All Divisions
                  </button>
                  {availableDivisions.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDivision(d)}
                      style={{
                        padding: '7px 16px', borderRadius: '8px', fontWeight: '600',
                        fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s ease',
                        border: selectedDivision === d ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                        background: selectedDivision === d ? 'rgba(147,51,234,0.25)' : 'rgba(255,255,255,0.05)',
                        color: selectedDivision === d ? '#a855f7' : 'var(--text-primary)'
                      }}
                    >
                      Div {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Subject Selection (Filtered for Selected Semester) */}
            {selectedSemester && selectedDivision && (
              <div style={{ textAlign: 'left', marginBottom: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                  3️⃣ Select Subject (Sem {selectedSemester}):
                </label>
                {availableSubjectsForSem.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {availableSubjectsForSem.map((subObj, subIdx) => {
                      const subLabel = (subObj.shortName && String(subObj.shortName).trim() !== '') 
                        ? String(subObj.shortName).trim() 
                        : subObj.subjectName;
                      const isSelected = selectedSubject === subLabel || selectedSubject === subObj.subjectName;

                      return (
                        <button
                          key={subIdx}
                          type="button"
                          title={subObj.subjectName}
                          onClick={() => setSelectedSubject(subLabel)}
                          style={{
                            padding: '8px 14px', borderRadius: '10px', fontWeight: '600',
                            fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s ease',
                            border: isSelected ? '2px solid #a855f7' : '1px solid var(--border-light)',
                            background: isSelected ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.05)',
                            color: isSelected ? '#c084fc' : 'var(--text-primary)',
                            display: 'inline-flex', alignItems: 'center', gap: '6px'
                          }}
                        >
                          📚 {subLabel}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No subject mapped for Sem {selectedSemester}. Session will start without subject filter.
                  </div>
                )}
              </div>
            )}

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
                disabled={!selectedSemester || !selectedDivision || (availableSubjectsForSem.length > 0 && !selectedSubject)}
              >
                Start Session →
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
    padding: '20px 24px',
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    height: '100vh',
    maxHeight: '100vh',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    borderRadius: '16px',
    flexShrink: 0
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
    gap: '24px',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden'
  },
  sidebar: {
    padding: '24px 16px',
    borderRadius: '16px',
    alignSelf: 'start',
    height: 'fit-content',
    flexShrink: 0
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
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#001b3d',
    fontWeight: '700',
    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
  },
  contentPane: {
    minWidth: 0,
    height: '100%',
    maxHeight: '100%',
    overflowY: 'auto',
    paddingRight: '6px'
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
    borderRadius: '16px',
    boxSizing: 'border-box',
    width: '100%'
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
