import React, { useState, useEffect, useRef } from 'react';
import {
  Users, KeyRound, QrCode, BarChart3, Download, Search, CheckCircle,
  XCircle, Clock, ShieldAlert, LogOut, RefreshCw, Sun, Moon, Menu, X, Folder, Calendar,
  ClipboardList, UserCheck, UserX, Smartphone, HandIcon, GraduationCap, User, Settings, MapPin, Plus, Trash2, Edit,
  LayoutGrid, ChevronDown, FileText, Check, TrendingUp, RotateCcw
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import Swal from 'sweetalert2';
import ToastContainer from './ToastContainer';
import SearchableSemesterSelect from './SearchableSemesterSelect';

// Global Division Normalizer and Matcher Helpers
const normalizeDiv = (d) => String(d || '').replace(/div/gi, '').trim().toUpperCase();

const getLocalDateStr = (dInput) => {
  if (!dInput) return '';
  if (typeof dInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dInput.trim())) {
    return dInput.trim();
  }
  const d = new Date(dInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDivMatch = (studentDiv, sessionDiv) => {

  const normTarget = normalizeDiv(sessionDiv);
  if (!normTarget || normTarget === 'ALL' || normTarget.includes('ALL')) return true;
  const normStudent = normalizeDiv(studentDiv);
  if (!normStudent) return false;
  return normStudent === normTarget;
};

export default function FacultyDashboard({ user, token, onLogout, theme, toggleTheme }) {
  // Automatically enforce Dark Theme for Faculty Panel
  useEffect(() => {
    document.body.classList.remove('light-theme');
  }, []);

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

  // Floating Mobile Hamburger Toggle Setting (ON/OFF)
  const [showFloatingMobileMenu, setShowFloatingMobileMenu] = useState(() => {
    const saved = localStorage.getItem('faculty_show_floating_mobile_menu');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleFloatingMobileMenu = (e) => {
    const isChecked = e.target.checked;
    setShowFloatingMobileMenu(isChecked);
    localStorage.setItem('faculty_show_floating_mobile_menu', JSON.stringify(isChecked));
  };

  // Manual Attendance state
  const [manualSessionFolder, setManualSessionFolder] = useState(null); // null | 1 | 2 | 3 | 4 | 5
  const [manualFolderSem, setManualFolderSem] = useState('');
  const [manualFolderDiv, setManualFolderDiv] = useState('ALL');
  const [manualDivFilter, setManualDivFilter] = useState('ALL');
  const [manualSearchName, setManualSearchName] = useState('');
  const [manualTodayLogs, setManualTodayLogs] = useState([]); // today's attendance (all)
  const [manualActionMsg, setManualActionMsg] = useState({ id: null, text: '', type: '' });
  const [manualLoading, setManualLoading] = useState(false);

  // Toastr Notification System
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Leave Applications Management State
  const [allLeaves, setAllLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);

  const fetchAllLeaves = async () => {
    setLeavesLoading(true);
    try {
      const res = await fetch('/api/leaves/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllLeaves(data);
      }
    } catch (err) {
      console.error('Error fetching all leaves:', err);
    } finally {
      setLeavesLoading(false);
    }
  };

  const handleUpdateLeaveStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/leaves/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Leave request updated to ${newStatus}`, 'success');
        fetchAllLeaves();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update leave status', 'error');
      }
    } catch (err) {
      console.error('Error updating leave status:', err);
      showToast('Network error while updating leave status', 'error');
    }
  };

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '-';
    const str = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [yyyy, mm, dd] = str.split('-');
      return `${dd}-${mm}-${yyyy}`;
    }
    return str;
  };

  const handleDeleteLeave = (id) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'Do you really want to delete this leave application record? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete it!',
      cancelButtonText: 'Cancel',
      background: '#0f172a',
      color: '#ffffff',
      customClass: {
        popup: 'swal2-custom-dark'
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`/api/leaves/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            Swal.fire({
              title: 'Deleted!',
              text: 'Leave application record deleted successfully.',
              icon: 'success',
              timer: 2000,
              showConfirmButton: false,
              background: '#0f172a',
              color: '#ffffff'
            });
            fetchAllLeaves();
          } else {
            const data = await res.json();
            showToast(data.error || 'Failed to delete leave application', 'error');
          }
        } catch (err) {
          console.error('Error deleting leave:', err);
          showToast('Network error while deleting leave application', 'error');
        }
      }
    });
  };

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
  const [reportType, setReportType] = useState('subject_wise'); // 'subject_wise' | 'subject_date_wise' | 'semester_date_wise'
  const [reportSubjectFilter, setReportSubjectFilter] = useState('ALL');
  const [reportSemFilter, setReportSemFilter] = useState('1');
  const [reportDivFilter, setReportDivFilter] = useState('ALL');
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
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

  const fetchMyProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          setFetchedFacultyUser(data.user);
          try {
            localStorage.setItem('attendance_user', JSON.stringify(data.user));
            if (data.user.id || data.user.username) {
              localStorage.setItem(`cached_faculty_${data.user.id || data.user.username}`, JSON.stringify(data.user));
            }
          } catch (e) {}
        }
      }
    } catch(err) {
      console.error('Error fetching faculty profile:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchMyProfile();
      fetchAllLeaves();
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

  const [folderDateLoading, setFolderDateLoading] = useState(false);

  useEffect(() => {
    if (folderSearchDate && token) {
      setFolderDateLoading(true);
      fetch(`/api/attendance/reports?date=${folderSearchDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDateLogs(data);
          else if (data.success && Array.isArray(data.report)) setDateLogs(data.report);
        })
        .catch(err => console.error(err))
        .finally(() => setFolderDateLoading(false));
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

  const [directoryReloading, setDirectoryReloading] = useState(false);

  const handleReloadDirectory = async () => {
    setDirectoryReloading(true);
    try {
      await Promise.all([
        fetchLiveLogs(),
        fetchTodaySessions(),
        fetchTodayAllAttendance()
      ]);
    } catch (err) {
      console.error('Error reloading directory:', err);
    } finally {
      setDirectoryReloading(false);
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
          (l.enrollment_no && String(l.enrollment_no).trim().toLowerCase() === String(student.enrollment_no || '').trim().toLowerCase());
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

  // Smart Auto-Polling for Live Sessions & Stats (0ms Broadcast Sync for Instant Edits)
  useEffect(() => {
    const isSessionActive = activeQrSessionDetails !== null || activeOtpDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 25000;

    const interval = setInterval(() => {
      if (isSessionActive) {
        fetchLiveLogs();
        fetchStats();
        fetchTodaySessions();
      } else {
        fetchStats();
        fetchTodaySessions();
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [activeQrSessionDetails, activeOtpDetails, activeTab]);

  // Reset folder navigation when switching active tab so returning to Manual tab shows main root directory
  useEffect(() => {
    setManualSessionFolder(null);
    setManualDivFilter('ALL');
    setManualSearchName('');
  }, [activeTab]);

  // Instant Cross-Panel BroadcastChannel & Custom Event Sync
  useEffect(() => {
    const refreshAll = () => {
      fetchMyProfile();
      fetchStats();
      fetchLiveLogs();
      fetchQrSettings();
      fetchStudents();
      fetchAllLeaves();
      fetchTodaySessions();
      fetchTodayAllAttendance();
    };

    window.addEventListener('app_data_changed', refreshAll);

    let bc = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('attendance_system_sync');
        bc.onmessage = (msg) => {
          if (msg && msg.data && msg.data.type === 'DATA_CHANGED') {
            refreshAll();
          }
        };
      } catch (e) {}
    }

    return () => {
      window.removeEventListener('app_data_changed', refreshAll);
      if (bc) bc.close();
    };
  }, []);

  const handleEndCurrentQrSession = async () => {
    try {
      await fetch('/api/qr/end', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {}
    setActiveQrSessionDetails(null);
    setQrSessionTimer(0);
    showToast('QR Session ended successfully', 'info');
    fetchStats();
  };

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
          const totalTokens = activeQrSessionDetails?.tokens?.length || 20;
          const ROTATE_INTERVAL = 6;
          const elapsed = 120 - (prev - 1);
          const idx = Math.min(totalTokens - 1, Math.floor(elapsed / ROTATE_INTERVAL));
          setTokenIndex(idx);
          setQrCodeTimer(ROTATE_INTERVAL - (elapsed % ROTATE_INTERVAL));
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

  // QR Code Rendering Effect - activeTab aur dashModal bhi dependency mein hain
  // Taaki jab user tab switch karke wapas aaye, QR turant render ho
  const renderQrToCanvas = (canvasEl) => {
    if (!canvasEl || !activeQrSessionDetails) return;
    const currentToken = activeQrSessionDetails.tokens[tokenIndex];
    if (!currentToken) return;
    const qrData = `${activeQrSessionDetails.id},${tokenIndex},${currentToken}`;
    QRCode.toCanvas(canvasEl, qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    }, (err) => {
      if (err) console.error('Error generating QR on canvas:', err);
    });
  };

  useEffect(() => {
    if (!activeQrSessionDetails) return;
    // requestAnimationFrame se wait karo taaki canvas DOM mein mount ho jaye
    const frame = requestAnimationFrame(() => {
      if (qrCanvasRef.current) {
        renderQrToCanvas(qrCanvasRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeQrSessionDetails, tokenIndex, activeTab, dashModal]);

  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState('');

  // Extract unique semester numbers assigned to this faculty member that have student records in database
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

    // Build set of active semesters present in student database records
    const activeStudentSemSet = new Set();
    if (studentsList && Array.isArray(studentsList)) {
      studentsList.forEach(st => {
        if (st && st.semester !== undefined && st.semester !== null) {
          const num = String(st.semester).replace(/\D/g, '');
          if (num) activeStudentSemSet.add(num);
        }
      });
    }

    subs.forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '');
        if (semNum) {
          // If student records are loaded, only include semesters that actually have student records
          if (activeStudentSemSet.size === 0 || activeStudentSemSet.has(semNum)) {
            semSet.add(semNum);
          }
        }
      }
    });

    const list = Array.from(semSet).sort((a, b) => Number(a) - Number(b));
    if (list.length > 0) return list;

    // Fallback: extract semesters from today's/past sessions or logs conducted by this faculty
    const sessionSemSet = new Set();
    (facultySessionsToday || []).forEach(sess => {
      if (sess.semester) {
        const num = String(sess.semester).replace(/\D/g, '');
        if (num) {
          if (activeStudentSemSet.size === 0 || activeStudentSemSet.has(num)) {
            sessionSemSet.add(num);
          }
        }
      }
    });
    (liveLogs || []).forEach(log => {
      if (log.semester) {
        const num = String(log.semester).replace(/\D/g, '');
        if (num) {
          if (activeStudentSemSet.size === 0 || activeStudentSemSet.has(num)) {
            sessionSemSet.add(num);
          }
        }
      }
    });

    return Array.from(sessionSemSet).sort((a, b) => Number(a) - Number(b));
  })();

  // All teaching subjects assigned to this faculty
  const allFacultySubjects = (() => {
    const rawDept = activeUser?.department || '';
    let subs = Array.isArray(activeUser?.subjects) ? activeUser.subjects : [];
    
    if (subs.length === 0 && rawDept.includes('||SUB:')) {
      try {
        const jsonStr = rawDept.split('||SUB:')[1].split('||')[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) subs = parsed;
      } catch(e) {}
    }
    return subs;
  })();

  // Filter teaching subjects for the currently selected semester
  const availableSubjectsForSem = (() => {
    if (!selectedSemester) return [];
    return allFacultySubjects.filter(s => s && s.subjectName && String(s.semester).replace(/\D/g, '') === String(selectedSemester).replace(/\D/g, ''));
  })();

  const uniqueSubjectList = (() => {
    const list = [];
    const seen = new Set();
    (allFacultySubjects || []).forEach(s => {
      const name = (s.subjectName || s.name || '').trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({
          name,
          code: s.code || s.subjectCode || s.shortName || '',
          semester: s.semester || '1',
          facultyName: s.facultyName || activeUser?.name || ''
        });
      }
    });
    return list;
  })();

  const subjectReportData = (() => {
    const rows = [];
    const allLogs = [...(dateLogs || []), ...(reportData || [])];

    const normDateStr = (raw) => {
      if (!raw) return '';
      let s = String(raw);
      if (s.includes('T')) s = s.split('T')[0];
      return s.trim();
    };

    const getSemNum = (val) => {
      if (!val) return '';
      return String(val).replace(/\D/g, '').trim();
    };

    (studentsList || []).forEach((std, sIdx) => {
      const stdSem = getSemNum(std.semester || std.sem || '1');
      const stdDiv = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentEnroll = String(std.enrollment_no || std.id || std.roll_no || '').trim().toLowerCase();

      let studentSubjects = [];

      if (reportSubjectFilter && reportSubjectFilter !== 'ALL') {
        const matchInAll = (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').trim().toLowerCase() === reportSubjectFilter.trim().toLowerCase());
        const subSem = matchInAll ? getSemNum(matchInAll.semester) : null;

        if (subSem && stdSem && subSem !== stdSem) {
          return;
        }

        studentSubjects = [{
          name: reportSubjectFilter,
          code: matchInAll ? (matchInAll.code || matchInAll.subjectCode || matchInAll.shortName || '') : '',
          semester: stdSem
        }];
      } else {
        const semSubjects = (allFacultySubjects || []).filter(s => getSemNum(s.semester) === stdSem);

        const seenNames = new Set();
        const uniqueSemSubjects = [];
        semSubjects.forEach(s => {
          const sName = (s.subjectName || s.name || '').trim();
          if (sName && !seenNames.has(sName.toLowerCase())) {
            seenNames.add(sName.toLowerCase());
            uniqueSemSubjects.push({
              name: sName,
              code: s.code || s.subjectCode || s.shortName || '',
              semester: stdSem
            });
          }
        });

        studentSubjects = uniqueSemSubjects;
      }

      studentSubjects.forEach(subObj => {
        const targetSubName = (subObj.name || '').trim();
        if (!targetSubName || targetSubName === '-') return;

        // 1. Calculate UNIQUE conducted sessions for this specific subject, semester, and division
        const conductedSessionKeys = new Set();
        const allSessionSources = [...(dateLogs || []), ...(reportData || [])];

        allSessionSources.forEach(sess => {
          if (!sess) return;
          const sSem = getSemNum(sess.semester || '1');
          if (sSem && sSem !== stdSem) return;

          const sDiv = String(sess.division || 'ALL').trim().toUpperCase();
          if (sDiv !== 'ALL' && sDiv !== stdDiv) return;

          const sName = (sess.subject_name || sess.subject || '').trim().toLowerCase();
          if (sName && sName !== targetSubName.toLowerCase()) return;

          const sKey = sess.qr_session_id ? `qr_${sess.qr_session_id}` : 
                       sess.otp_id ? `otp_${sess.otp_id}` : 
                       sess.id ? `sess_${sess.id}` : 
                       (sess.date && sess.time ? `${normDateStr(sess.date)}_${sess.time}` : (sess.date ? normDateStr(sess.date) : null));

          if (sKey) {
            conductedSessionKeys.add(sKey);
          }
        });

        let totalLectures = conductedSessionKeys.size;

        // 2. Calculate real unique attended sessions for this student & subject
        const uniqueAttendedKeys = new Set();
        allLogs.forEach(log => {
          if (!log) return;
          const status = String(log.status || '').toLowerCase();
          if (status !== 'success' && status !== 'present') return;

          const logEnroll = String(log.enrollment_no || log.student_id || log.roll_no || '').trim().toLowerCase();
          if (logEnroll !== studentEnroll) return;

          if (log.subject && String(log.subject).trim().toLowerCase() !== targetSubName.toLowerCase()) return;

          const logKey = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : `${normDateStr(log.date || log.created_at)}_${log.time || log.id}`;
          uniqueAttendedKeys.add(logKey);
        });

        const rawAttended = uniqueAttendedKeys.size;
        const attended = totalLectures > 0 ? Math.min(totalLectures, rawAttended) : rawAttended;
        const absent = totalLectures > 0 ? Math.max(0, totalLectures - attended) : 0;
        const pct = totalLectures > 0 ? Math.min(100, Math.round((attended / totalLectures) * 100)) : 0;

        const semStr = `Sem ${stdSem || '1'}`;
        const divStr = `Div ${stdDiv || 'A'}`;
        const rawSubCode = subObj.code || (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').toLowerCase().trim() === targetSubName.toLowerCase())?.code;
        const subjCode = (rawSubCode && String(rawSubCode).trim() !== '' && String(rawSubCode).trim() !== 'SUB101') ? String(rawSubCode).trim() : '-';

        rows.push({
          id: `${std.id || sIdx}_${targetSubName}`,
          roll_no: std.roll_no || std.roll || std.enrollment_no || '-',
          name: std.name || 'Student',
          semester: semStr,
          division: divStr,
          subject: targetSubName,
          subject_code: subjCode,
          total_attendance: totalLectures,
          present: attended,
          absent: absent,
          attendance_percentage: `${pct}%`,
          raw_percentage: pct
        });
      });
    });

    rows.sort((a, b) => {
      const subA = String(a.subject || '').toLowerCase();
      const subB = String(b.subject || '').toLowerCase();
      if (subA !== subB) return subA.localeCompare(subB);

      const semA = parseInt(String(a.semester || '').replace(/\D/g, '')) || 0;
      const semB = parseInt(String(b.semester || '').replace(/\D/g, '')) || 0;
      if (semA !== semB) return semA - semB;

      const divA = String(a.division || '').toLowerCase();
      const divB = String(b.division || '').toLowerCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rollA = parseInt(String(a.roll_no || '').replace(/\D/g, '')) || 0;
      const rollB = parseInt(String(b.roll_no || '').replace(/\D/g, '')) || 0;
      return rollA - rollB;
    });

    return rows;
  })();

  const subjectDateWiseMatrixData = (() => {
    const targetSubName = (reportSubjectFilter && reportSubjectFilter !== 'ALL') ? reportSubjectFilter.trim().toLowerCase() : null;
    const targetSem = reportSemFilter && reportSemFilter !== 'ALL' ? String(reportSemFilter).replace(/\D/g, '').trim() : null;
    const targetDiv = reportDivFilter && reportDivFilter !== 'ALL' ? String(reportDivFilter).trim().toUpperCase() : null;

    const filteredStudents = (studentsList || []).filter(std => {
      if (targetSem) {
        const stdSem = String(std.semester || std.sem || '1').replace(/\D/g, '').trim();
        if (stdSem !== targetSem) return false;
      }
      if (targetDiv) {
        const stdDiv = String(std.division || std.div || '').trim().toUpperCase();
        if (stdDiv !== targetDiv) return false;
      }
      return true;
    });

    let dates = [];
    const start = reportStartDate ? new Date(reportStartDate) : new Date();
    const end = reportEndDate ? new Date(reportEndDate) : new Date();

    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
        if (dates.length >= 60) break;
      }
    } else {
      dates.push(new Date().toISOString().split('T')[0]);
    }

    const normDateStr = (raw) => {
      if (!raw) return '';
      let s = String(raw);
      if (s.includes('T')) s = s.split('T')[0];
      return s.trim();
    };

    const getSemNum = (val) => {
      if (!val) return '';
      return String(val).replace(/\D/g, '').trim();
    };

    const allSystemLogs = [...(dateLogs || []), ...(reportData || [])];

    const sessionCols = [];

    dates.forEach(dStr => {
      const conductedForDate = (dateLogs || []).filter(s => {
        if (!s) return false;
        if (normDateStr(s.date || s.created_at) !== dStr) return false;
        if (targetSem) {
          const sSem = getSemNum(s.semester || '1');
          if (sSem && sSem !== targetSem) return false;
        }
        if (targetSubName) {
          const sName = (s.subject_name || s.subject || '').trim().toLowerCase();
          if (sName && sName !== targetSubName) return false;
        }
        return true;
      });

      let finalSesses = [...conductedForDate];
      if (finalSesses.length === 0) {
        const dateLogsSub = (allSystemLogs || []).filter(l => {
          if (!l) return false;
          if (normDateStr(l.date || l.created_at) !== dStr) return false;
          if (targetSem) {
            const lSem = getSemNum(l.semester);
            if (lSem && lSem !== targetSem) return false;
          }
          if (targetSubName) {
            const lSub = (l.subject || '').trim().toLowerCase();
            if (lSub && lSub !== targetSubName) return false;
          }
          return true;
        });

        const sessGroupMap = new Map();
        dateLogsSub.forEach(l => {
          const key = l.qr_session_id ? `qr_${l.qr_session_id}` : l.otp_id ? `otp_${l.otp_id}` : (l.subject || 'default');
          if (!sessGroupMap.has(key)) {
            sessGroupMap.set(key, {
              id: key,
              date: dStr,
              semester: l.semester || targetSem || '1',
              division: l.division || 'ALL',
              subject: l.subject || targetSubName || 'Subject'
            });
          }
        });
        if (sessGroupMap.size > 0) {
          finalSesses = Array.from(sessGroupMap.values());
        }
      }

      if (finalSesses.length === 0) return;

      finalSesses.sort((a, b) => {
        const tA = new Date(a.created_at || a.date || 0).getTime();
        const tB = new Date(b.created_at || b.date || 0).getTime();
        return tA - tB;
      });

      const dParts = dStr.split('-');
      const formattedDate = dParts.length === 3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : dStr;

      finalSesses.forEach((sess, sIdx) => {
        const sessId = sess.id || sess.qr_session_id || sess.otp_id || `${dStr}_${sessionCols.length}`;
        const sessDiv = String(sess.division || 'ALL').trim().toUpperCase();
        const colKey = finalSesses.length > 1 ? `${formattedDate} (L${sIdx + 1})` : formattedDate;

        sessionCols.push({
          colKey,
          dateStr: formattedDate,
          rawDate: dStr,
          sessId: String(sessId),
          qr_session_id: sess.qr_session_id ? String(sess.qr_session_id) : null,
          otp_id: sess.otp_id ? String(sess.otp_id) : null,
          sessDiv,
          subject: sess.subject || sess.subject_name || targetSubName
        });
      });
    });

    const columns = [
      'Roll No', 'Student Name', 'Sem', 'Division', 'Subject', 'Subject Code',
      ...sessionCols.map(c => c.colKey),
      'Total Attendance', 'Present', 'Absent', 'Attendance %'
    ];

    const presentMap = new Set();
    allSystemLogs.forEach(log => {
      if (!log) return;
      const status = String(log.status || '').toLowerCase();
      if (status === 'success' || status === 'present') {
        const enroll = String(log.enrollment_no || log.student_id || log.roll_no || '').trim().toLowerCase();
        if (enroll) {
          if (log.qr_session_id) {
            presentMap.add(`${enroll}_qr_${log.qr_session_id}`);
            presentMap.add(`${enroll}_${log.qr_session_id}`);
          }
          if (log.otp_id) {
            presentMap.add(`${enroll}_otp_${log.otp_id}`);
            presentMap.add(`${enroll}_${log.otp_id}`);
          }
          if (log.session_id) {
            presentMap.add(`${enroll}_sess_${log.session_id}`);
            presentMap.add(`${enroll}_${log.session_id}`);
          }
          if (log.id) {
            presentMap.add(`${enroll}_log_${log.id}`);
            presentMap.add(`${enroll}_${log.id}`);
          }
        }
      }
    });

    const rows = filteredStudents.map((std, sIdx) => {
      const semStr = std.semester ? `${std.semester}` : (targetSem || '1');
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentEnroll = String(std.enrollment_no || std.roll_no || std.roll || std.id || '').trim().toLowerCase();

      let subjName = '';
      let subjCode = '-';

      if (reportSubjectFilter && reportSubjectFilter !== 'ALL') {
        subjName = reportSubjectFilter;
        const matchedSub = (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').toLowerCase().trim() === reportSubjectFilter.toLowerCase().trim());
        const rawSubCode = matchedSub ? (matchedSub.code || matchedSub.subjectCode || matchedSub.shortName) : null;
        subjCode = (rawSubCode && String(rawSubCode).trim() !== '' && String(rawSubCode).trim() !== 'SUB101') ? String(rawSubCode).trim() : '-';
      } else {
        const semClean = String(semStr).replace(/\D/g, '').trim();
        const semSubs = (allFacultySubjects || []).filter(s => String(s.semester || '').replace(/\D/g, '').trim() === semClean);
        
        const names = [];
        const codes = [];
        const seenName = new Set();
        
        semSubs.forEach(s => {
          const n = (s.subjectName || s.name || '').trim();
          const c = (s.code || s.subjectCode || s.shortName || '').trim();
          if (n && !seenName.has(n.toLowerCase())) {
            seenName.add(n.toLowerCase());
            names.push(n);
            if (c && c !== 'SUB101' && c !== '-') codes.push(c);
          }
        });

        if (names.length === 0) {
          const sessSubs = Array.from(new Set(sessionCols.map(c => c.subject).filter(Boolean)));
          if (sessSubs.length > 0) {
            names.push(...sessSubs);
          }
        }

        subjName = names.length > 0 ? names.join(', ') : 'C Language (101)';
        subjCode = codes.length > 0 ? codes.join(', ') : '-';
      }

      let totalPresent = 0;
      let totalAbsent = 0;
      let conductedForStudentCount = 0;

      const rowObj = {
        'Roll No': std.roll_no || std.roll || std.enrollment_no || (sIdx + 1),
        'Student Name': std.name || 'Student',
        'Sem': semStr,
        'Division': divCode,
        'Subject': subjName,
        'Subject Code': subjCode
      };

      sessionCols.forEach(colObj => {
        const colDiv = colObj.sessDiv;
        const isApplicableForStudentDiv = (colDiv === 'ALL' || colDiv === divCode);

        if (!isApplicableForStudentDiv) {
          rowObj[colObj.colKey] = '-';
        } else {
          conductedForStudentCount++;
          const qId = colObj.qr_session_id || (String(colObj.sessId).startsWith('qr_') ? String(colObj.sessId).replace('qr_', '') : null);
          const oId = colObj.otp_id || (String(colObj.sessId).startsWith('otp_') ? String(colObj.sessId).replace('otp_', '') : null);
          const sId = colObj.sessId;

          let isPresent = false;
          if (qId && (presentMap.has(`${studentEnroll}_qr_${qId}`) || presentMap.has(`${studentEnroll}_${qId}`))) {
            isPresent = true;
          } else if (oId && (presentMap.has(`${studentEnroll}_otp_${oId}`) || presentMap.has(`${studentEnroll}_${oId}`))) {
            isPresent = true;
          } else if (sId && presentMap.has(`${studentEnroll}_${sId}`)) {
            isPresent = true;
          } else {
            isPresent = allSystemLogs.some(l => {
              if (!l) return false;
              const st = String(l.status || '').toLowerCase();
              if (st !== 'success' && st !== 'present') return false;
              const lEnroll = String(l.enrollment_no || l.student_id || l.roll_no || '').trim().toLowerCase();
              if (lEnroll !== studentEnroll) return false;
              
              if (qId && String(l.qr_session_id || '').trim() === qId) return true;
              if (oId && String(l.otp_id || '').trim() === oId) return true;
              if (sId && (
                String(l.qr_session_id || '').trim() === sId ||
                String(l.otp_id || '').trim() === sId ||
                String(l.session_id || '').trim() === sId ||
                `qr_${l.qr_session_id}` === sId ||
                `otp_${l.otp_id}` === sId
              )) return true;
              return false;
            });
          }

          if (isPresent) {
            rowObj[colObj.colKey] = 'P';
            totalPresent++;
          } else {
            rowObj[colObj.colKey] = 'A';
            totalAbsent++;
          }
        }
      });

      const totalAttendance = conductedForStudentCount;
      const attPct = totalAttendance > 0 ? `${Math.round((totalPresent / totalAttendance) * 100)}%` : '0%';

      rowObj['Total Attendance'] = totalAttendance;
      rowObj['Present'] = totalPresent;
      rowObj['Absent'] = totalAbsent;
      rowObj['Attendance %'] = attPct;

      return rowObj;
    });

    return { columns, dates, rows };
  })();

  const semesterDateWiseMatrixData = (() => {
    const targetSem = reportSemFilter && reportSemFilter !== 'ALL' ? String(reportSemFilter).replace(/\D/g, '').trim() : null;
    const targetDiv = reportDivFilter && reportDivFilter !== 'ALL' ? String(reportDivFilter).trim().toUpperCase() : null;

    const filteredStudents = (studentsList || []).filter(std => {
      if (targetSem) {
        const stdSem = String(std.semester || std.sem || '1').replace(/\D/g, '').trim();
        if (stdSem !== targetSem) return false;
      }
      if (targetDiv) {
        const stdDiv = String(std.division || std.div || '').trim().toUpperCase();
        if (stdDiv !== targetDiv) return false;
      }
      return true;
    });

    let dates = [];
    const start = reportStartDate ? new Date(reportStartDate) : new Date();
    const end = reportEndDate ? new Date(reportEndDate) : new Date();

    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
        if (dates.length >= 60) break;
      }
    } else {
      dates.push(new Date().toISOString().split('T')[0]);
    }

    const normDateStr = (raw) => {
      if (!raw) return '';
      let s = String(raw);
      if (s.includes('T')) s = s.split('T')[0];
      return s.trim();
    };

    const allSystemLogs = [...(dateLogs || []), ...(reportData || [])];

    const resolveSessionSubject = (sess, sessIdx, dStr, semVal) => {
      let rawName = sess.subject || sess.subject_name || sess.subjectTitle || '';
      
      if (!rawName || rawName.trim().toLowerCase() === 'subject' || rawName.trim().toLowerCase() === 'all subjects') {
        const sId = sess.id || sess.qr_session_id || sess.otp_id;
        const matchingLog = (allSystemLogs || []).find(l => 
          l && (String(l.qr_session_id) === String(sId) || String(l.otp_id) === String(sId) || (normDateStr(l.date || l.created_at) === dStr && l.subject && l.subject.trim().toLowerCase() !== 'subject'))
        );
        if (matchingLog && matchingLog.subject) {
          rawName = matchingLog.subject;
        }
      }

      const semClean = String(semVal || targetSem || '1').replace(/\D/g, '').trim();
      const semSubjects = (allFacultySubjects || []).filter(s => String(s.semester || '').replace(/\D/g, '').trim() === semClean);

      if ((!rawName || rawName.trim().toLowerCase() === 'subject') && semSubjects.length > 0) {
        const chosen = semSubjects[sessIdx % semSubjects.length];
        rawName = chosen ? (chosen.subjectName || chosen.name || '') : '';
      }

      if (!rawName) rawName = `Lecture ${sessIdx + 1}`;

      const nameClean = String(rawName).trim().toLowerCase();
      const matched = (allFacultySubjects || []).find(s => {
        const sName = String(s.subjectName || s.name || '').trim().toLowerCase();
        return sName === nameClean && String(s.semester || '').replace(/\D/g, '').trim() === semClean;
      }) || (allFacultySubjects || []).find(s => String(s.subjectName || s.name || '').trim().toLowerCase() === nameClean);

      if (matched) {
        const short = matched.shortName || matched.shortCode || matched.short;
        if (short && String(short).trim() !== '' && String(short).trim() !== '-' && isNaN(String(short).trim())) {
          return String(short).trim();
        }
        if (matched.subjectName || matched.name) {
          return String(matched.subjectName || matched.name).trim();
        }
      }

      return String(rawName).trim();
    };

    const sessionCols = [];

    dates.forEach(dStr => {
      const conductedForDate = (dateLogs || []).filter(s => {
        if (!s) return false;
        if (normDateStr(s.date || s.created_at) !== dStr) return false;
        if (targetSem) {
          const sSem = String(s.semester || '').replace(/\D/g, '').trim();
          if (sSem && sSem !== targetSem) return false;
        }
        return true;
      });

      let finalSesses = [...conductedForDate];
      if (finalSesses.length === 0) {
        const dateLogsSub = (allSystemLogs || []).filter(l => {
          if (!l) return false;
          if (normDateStr(l.date || l.created_at) !== dStr) return false;
          if (targetSem) {
            const lSem = String(l.semester || '').replace(/\D/g, '').trim();
            if (lSem && lSem !== targetSem) return false;
          }
          return true;
        });

        const sessGroupMap = new Map();
        dateLogsSub.forEach(l => {
          const key = l.qr_session_id ? `qr_${l.qr_session_id}` : l.otp_id ? `otp_${l.otp_id}` : (l.subject || 'default');
          if (!sessGroupMap.has(key)) {
            sessGroupMap.set(key, {
              id: key,
              date: dStr,
              semester: l.semester || targetSem || '1',
              division: l.division || 'ALL',
              subject: l.subject || 'Subject'
            });
          }
        });
        if (sessGroupMap.size > 0) {
          finalSesses = Array.from(sessGroupMap.values());
        }
      }

      if (finalSesses.length === 0) return;

      finalSesses.sort((a, b) => {
        const tA = new Date(a.created_at || a.date || 0).getTime();
        const tB = new Date(b.created_at || b.date || 0).getTime();
        return tA - tB;
      });

      const dParts = dStr.split('-');
      const formattedDate = dParts.length === 3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : dStr;

      finalSesses.forEach((sess, sIdx) => {
        const semVal = sess.semester || targetSem;
        const resolvedSub = resolveSessionSubject(sess, sIdx, dStr, semVal);
        const sessionLabel = resolvedSub;
        const sessId = sess.id || sess.qr_session_id || `${dStr}_${sessionCols.length}`;
        const sessDiv = String(sess.division || 'ALL').trim().toUpperCase();

        sessionCols.push({
          key: `col_${sessionCols.length}_${sessId}`,
          dateStr: formattedDate,
          rawDate: dStr,
          sessionLabel,
          sessId,
          sessDiv,
          subject: resolvedSub,
          semester: String(semVal)
        });
      });
    });

    const presentMap = new Set();
    allSystemLogs.forEach(log => {
      if (!log) return;
      const status = String(log.status || '').toLowerCase();
      if (status === 'success' || status === 'present') {
        const enroll = String(log.enrollment_no || log.student_id || log.roll_no || '').trim().toLowerCase();
        if (enroll) {
          if (log.qr_session_id) {
            presentMap.add(`${enroll}_qr_${log.qr_session_id}`);
            presentMap.add(`${enroll}_${log.qr_session_id}`);
          }
          if (log.otp_id) {
            presentMap.add(`${enroll}_otp_${log.otp_id}`);
            presentMap.add(`${enroll}_${log.otp_id}`);
          }
          if (log.session_id) {
            presentMap.add(`${enroll}_sess_${log.session_id}`);
            presentMap.add(`${enroll}_${log.session_id}`);
          }
          if (log.id) {
            presentMap.add(`${enroll}_log_${log.id}`);
            presentMap.add(`${enroll}_${log.id}`);
          }
        }
      }
    });

    const rows = filteredStudents.map((std, sIdx) => {
      const semStr = std.semester ? `${std.semester}` : (targetSem || '1');
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentEnroll = String(std.enrollment_no || std.roll_no || std.roll || std.id || '').trim().toLowerCase();

      let totalPresent = 0;
      let totalAbsent = 0;
      let conductedForStudentCount = 0;
      const sessionAttendance = {};

      sessionCols.forEach((col) => {
        const colDiv = col.sessDiv;
        const isApplicableForStudentDiv = (colDiv === 'ALL' || colDiv === divCode);

        if (!isApplicableForStudentDiv) {
          sessionAttendance[col.key] = '-';
        } else {
          conductedForStudentCount++;
          const qId = String(col.sessId).startsWith('qr_') ? String(col.sessId).replace('qr_', '') : null;
          const oId = String(col.sessId).startsWith('otp_') ? String(col.sessId).replace('otp_', '') : null;
          const sId = col.sessId;

          let isPresent = false;
          if (qId && (presentMap.has(`${studentEnroll}_qr_${qId}`) || presentMap.has(`${studentEnroll}_${qId}`))) {
            isPresent = true;
          } else if (oId && (presentMap.has(`${studentEnroll}_otp_${oId}`) || presentMap.has(`${studentEnroll}_${oId}`))) {
            isPresent = true;
          } else if (sId && presentMap.has(`${studentEnroll}_${sId}`)) {
            isPresent = true;
          } else {
            isPresent = allSystemLogs.some(l => {
              if (!l) return false;
              const st = String(l.status || '').toLowerCase();
              if (st !== 'success' && st !== 'present') return false;
              const lEnroll = String(l.enrollment_no || l.student_id || l.roll_no || '').trim().toLowerCase();
              if (lEnroll !== studentEnroll) return false;
              
              if (qId && String(l.qr_session_id || '').trim() === qId) return true;
              if (oId && String(l.otp_id || '').trim() === oId) return true;
              if (sId && (
                String(l.qr_session_id || '').trim() === sId ||
                String(l.otp_id || '').trim() === sId ||
                String(l.session_id || '').trim() === sId ||
                `qr_${l.qr_session_id}` === sId ||
                `otp_${l.otp_id}` === sId
              )) return true;
              return false;
            });
          }

          if (isPresent) {
            sessionAttendance[col.key] = 'P';
            totalPresent++;
          } else {
            sessionAttendance[col.key] = 'A';
            totalAbsent++;
          }
        }
      });

      const totalLectures = conductedForStudentCount;
      const attPct = totalLectures > 0 ? ((totalPresent / totalLectures) * 100).toFixed(1) + '%' : '0.0%';

      return {
        roll_no: std.roll_no || std.roll || std.enrollment_no || (sIdx + 1),
        name: std.name || 'Student',
        sem: semStr,
        division: divCode,
        sessionAttendance,
        totalLectures,
        totalPresent,
        totalAbsent,
        attPct
      };
    });

    return { sessionCols, rows };
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
    setSelectedSubjectKey('');
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
    setSelectedSubjectKey('');
  };

  const confirmSemesterAndGenerate = () => {
    if (!selectedSemester) { alert('Please select a semester first!'); return; }
    if (availableDivisions.length > 0 && !selectedDivision) {
      alert('Please select a division (or All Divisions) for this semester!');
      return;
    }
    const availSubjs = availableSubjectsForSem;
    if (availSubjs.length === 0) {
      alert(`No subject mapped for Sem ${selectedSemester}. Please ask Admin to assign a teaching subject first!`);
      return;
    }
    if (!selectedSubject) {
      alert('Please select a teaching subject for this semester!');
      return;
    }
    const sem = selectedSemester;
    const div = (selectedDivision && selectedDivision !== 'ALL') ? selectedDivision : null;
    const subj = selectedSubject;
    
    setSemesterModal(null);
    setSelectedSemester('');
    setSelectedDivision('');
    setSelectedSubject('');
    setSelectedSubjectKey('');
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
    if (reportType === 'subject_date_wise') {
      const { columns, rows } = subjectDateWiseMatrixData;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(147, 51, 234);
      const subjTitle = reportSubjectFilter && reportSubjectFilter !== 'ALL'
        ? `SUBJECT ATTENDANCE WITH DATES (${reportSubjectFilter.toUpperCase()})`
        : 'SUBJECT ATTENDANCE WITH DATES REPORT';
      doc.text(subjTitle, 14, 15);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100);
      const dateRangeStr = reportStartDate === reportEndDate ? reportStartDate : `${reportStartDate} to ${reportEndDate}`;
      doc.text(`Generated On: ${new Date().toLocaleString()} | Date: ${dateRangeStr} | Division: ${reportDivFilter} | Total Records: ${rows.length}`, 14, 21);

      const tableRows = rows.map(r => columns.map(col => r[col]));

      autoTable(doc, {
        head: [columns],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        headStyles: { fillColor: [147, 51, 234] },
        styles: { fontSize: 7, cellPadding: 1.5 }
      });

      doc.save(`Subject_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.pdf`);
      return;
    }

    if (reportType === 'semester_date_wise') {
      const { sessionCols, rows } = semesterDateWiseMatrixData;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(147, 51, 234);
      doc.text('SEMESTER ATTENDANCE WITH DATES REPORT', 14, 15);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100);
      const dateRangeStr = reportStartDate === reportEndDate ? reportStartDate : `${reportStartDate} to ${reportEndDate}`;
      doc.text(`Generated On: ${new Date().toLocaleString()} | Date: ${dateRangeStr} | Semester: ${reportSemFilter} | Division: ${reportDivFilter} | Records: ${rows.length}`, 14, 21);

      const headerRow1 = [
        'Roll No', 'Student Name', 'Sem', 'Division',
        ...sessionCols.map(col => col.dateStr),
        'Total Lectures', 'Total Present', 'Total Absent', 'Att %'
      ];
      const headerRow2 = [
        '', '', '', '',
        ...sessionCols.map(col => col.sessionLabel),
        '', '', '', ''
      ];
      const tableRows = rows.map(r => [
        r.roll_no,
        r.name,
        r.sem,
        r.division,
        ...sessionCols.map(col => r.sessionAttendance[col.key] || '-'),
        r.totalLectures,
        r.totalPresent,
        r.totalAbsent,
        r.attPct
      ]);

      autoTable(doc, {
        head: [headerRow1, headerRow2],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        headStyles: { fillColor: [147, 51, 234] },
        styles: { fontSize: 6, cellPadding: 1 }
      });

      doc.save(`Semester_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.pdf`);
      return;
    }

    // Default: subject_wise
    const targetData = subjectReportData;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(147, 51, 234);
    const subjTitle = reportSubjectFilter && reportSubjectFilter !== 'ALL' ? `SUBJECT WISE REPORT (${reportSubjectFilter.toUpperCase()})` : 'ALL SUBJECTS ATTENDANCE REPORT';
    doc.text(subjTitle, 14, 15);

    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated On: ${new Date().toLocaleString()} | Total Records: ${targetData.length}`, 14, 21);

    const tableColumn = [
      'Roll No', 'Name', 'Division', 'Subject', 'Subject Code',
      'Total Attendance', 'Present', 'Absent', 'Attendance %'
    ];
    const tableRows = targetData.map(row => [
      row.roll_no,
      row.name,
      row.division,
      row.subject,
      row.subject_code,
      row.total_attendance,
      row.present,
      row.absent,
      row.attendance_percentage
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 26,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        7: { fontStyle: 'bold' },
        8: { fontStyle: 'bold' }
      }
    });

    doc.save(`Subject_Wise_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    if (reportType === 'subject_date_wise') {
      const { rows } = subjectDateWiseMatrixData;
      const worksheet = XLSX.utils.json_to_sheet(rows);

      worksheet['!autofilter'] = { ref: 'C1:E1' };

      if (rows && rows.length > 0) {
        const colKeys = Object.keys(rows[0]);
        worksheet['!cols'] = colKeys.map(k => {
          if (k === 'Student Name') return { wch: 22 };
          if (k === 'Subject') return { wch: 24 };
          if (k === 'Subject Code') return { wch: 14 };
          if (k === 'Roll No' || k === 'Sem' || k === 'Division') return { wch: 10 };
          return { wch: 14 };
        });
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Attendance with Dates');
      XLSX.writeFile(workbook, `Subject_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

    if (reportType === 'semester_date_wise') {
      const { sessionCols, rows } = semesterDateWiseMatrixData;

      const headerRow1 = [
        'Roll No', 'Student Name', 'Sem', 'Division',
        ...sessionCols.map(col => col.dateStr),
        'Total Lectures', 'Total Present', 'Total Absent', 'Attendance %'
      ];
      const headerRow2 = [
        '', '', '', '',
        ...sessionCols.map(col => col.sessionLabel),
        '', '', '', ''
      ];
      const dataRows = rows.map(r => [
        r.roll_no,
        r.name,
        r.sem,
        r.division,
        ...sessionCols.map(col => r.sessionAttendance[col.key] || '-'),
        r.totalLectures,
        r.totalPresent,
        r.totalAbsent,
        r.attPct
      ]);

      const aoa = [headerRow1, headerRow2, ...dataRows];
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);

      worksheet['!cols'] = [
        { wch: 10 }, { wch: 22 }, { wch: 8 }, { wch: 10 },
        ...sessionCols.map(() => ({ wch: 12 })),
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Semester Attendance');
      XLSX.writeFile(workbook, `Semester_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

    // Default: subject_wise
    const cleanSubjectData = subjectReportData.map(row => ({
      'Roll No': row.roll_no,
      'Name': row.name,
      'Semester': row.semester,
      'Division': row.division,
      'Subject': row.subject,
      'Subject Code': row.subject_code,
      'Total Attendance': row.total_attendance,
      'Present': row.present,
      'Absent': row.absent,
      'Attendance %': row.attendance_percentage
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanSubjectData);
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 16 },
      { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }
    ];

    if (worksheet['!ref']) worksheet['!autofilter'] = { ref: 'C1:E1' };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Wise Report');
    XLSX.writeFile(workbook, `Subject_Wise_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    if (reportType === 'subject_date_wise') {
      const { rows } = subjectDateWiseMatrixData;
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Attendance with Dates');
      XLSX.writeFile(workbook, `Subject_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.csv`);
      return;
    }

    if (reportType === 'semester_date_wise') {
      const { sessionCols, rows } = semesterDateWiseMatrixData;
      const headerRow1 = [
        'Roll No', 'Student Name', 'Sem', 'Division',
        ...sessionCols.map(col => col.dateStr),
        'Total Lectures', 'Total Present', 'Total Absent', 'Attendance %'
      ];
      const headerRow2 = [
        '', '', '', '',
        ...sessionCols.map(col => col.sessionLabel),
        '', '', '', ''
      ];
      const dataRows = rows.map(r => [
        r.roll_no,
        r.name,
        r.sem,
        r.division,
        ...sessionCols.map(col => r.sessionAttendance[col.key] || '-'),
        r.totalLectures,
        r.totalPresent,
        r.totalAbsent,
        r.attPct
      ]);
      const aoa = [headerRow1, headerRow2, ...dataRows];
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Semester Attendance');
      XLSX.writeFile(workbook, `Semester_Attendance_With_Dates_${new Date().toISOString().split('T')[0]}.csv`);
      return;
    }

    // Default: subject_wise
    const cleanSubjectData = subjectReportData.map(row => ({
      'Roll No': row.roll_no,
      'Name': row.name,
      'Semester': row.semester,
      'Division': row.division,
      'Subject': row.subject,
      'Subject Code': row.subject_code,
      'Total Attendance': row.total_attendance,
      'Present': row.present,
      'Absent': row.absent,
      'Attendance %': row.attendance_percentage
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanSubjectData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Wise Report');
    XLSX.writeFile(workbook, `Subject_Wise_Report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [reportType, reportStudentId, activeTab]);

  return (
    <div className="admin-dashboard-root">
      {/* Mobile Floating Bottom-Right Hamburger Menu Button */}
      {showFloatingMobileMenu && (
        <button
          type="button"
          className="admin-floating-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          title={mobileMenuOpen ? "Close Menu" : "Open Menu"}
        >
          {mobileMenuOpen ? <X size={26} strokeWidth={2.5} /> : <Menu size={26} strokeWidth={2.5} />}
        </button>
      )}

      {/* Mobile Backdrop Overlay when sidebar is open */}
      {mobileMenuOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="admin-layout">

      {/* ===== MODAL OVERLAY ===== */}
      {dashModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0,
            width: '100dvw', height: '100dvh', minHeight: '100%',
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', boxSizing: 'border-box'
          }}
          onClick={() => setDashModal(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: '520px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              padding: isMobile ? '20px 16px' : '28px',
              maxHeight: '90dvh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden', position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              color: '#0f172a'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setDashModal(null)}
              style={{
                position: 'absolute', top: '16px', right: '16px', background: '#f1f5f9',
                border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem',
                width: '34px', height: '34px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease'
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
                    <CheckCircle size={24} color="#2563eb" />
                    <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Present Today</h2>
                    <span style={{ marginLeft: 'auto', marginRight: '36px', fontSize: '0.82rem', fontWeight: '700', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '12px' }}>
                      {hasStartedSessions ? `${filteredPresent.length} students` : '0 students'}
                    </span>
                  </div>

                  {/* Session-wise Filter Buttons */}
                  {hasStartedSessions ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                      {facultySessionsToday.map(sess => (
                        <button
                          key={sess.id}
                          onClick={() => setDashModalSession(sess.id)}
                          style={{
                            padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px',
                            border: activeSessionId === sess.id ? '1px solid #09355c' : '1px solid #cbd5e1',
                            background: activeSessionId === sess.id ? 'linear-gradient(135deg, #09355c, #0f4c81)' : '#f8fafc',
                            color: activeSessionId === sess.id ? '#ffffff' : '#334155', fontWeight: '700', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: activeSessionId === sess.id ? '0 2px 6px rgba(9,53,92,0.2)' : 'none'
                          }}
                        >
                          <Folder size={14} /> {sess.displayText}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px', fontStyle: 'italic', textAlign: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      ℹ️ No sessions started today yet.
                    </div>
                  )}

                  {/* Target Session Banner Info */}
                  {selectedSess && (
                    <div style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      marginBottom: '16px',
                      fontSize: '0.85rem',
                      color: '#1e3a8a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div>
                        <strong style={{ color: '#1e3a8a' }}>Targeted Class:</strong> Sem {displaySem || 'N/A'}{' '}
                        {selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL'
                          ? `(Division ${selectedSess.division})`
                          : '(All Divisions)'}
                      </div>
                      {selectedSess.subject && (
                        <div style={{ fontWeight: '800', color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                          📚 {selectedSess.subject}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasStartedSessions ? (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 0' }}>
                      <p style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '6px', color: '#0f172a' }}>No session started today yet.</p>
                      <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Start a QR Code or OTP session from the dashboard to view present students.</p>
                    </div>
                  ) : filteredPresent.length === 0 ? (
                    <p style={{ color: '#2563eb', textAlign: 'center', padding: '30px 0', fontWeight: '600', fontSize: '0.95rem' }}>
                      No present students found for this session.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
                      {filteredPresent.map((l, i) => (
                        <div key={l.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px', borderRadius: '12px',
                          background: '#f0f9ff', border: '1px solid #bae6fd'
                        }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: '#0284c7', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: '800', color: '#ffffff', flexShrink: 0
                          }}>{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>{l.name}</div>
                            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                              {l.roll_no ? `Roll: ${l.roll_no} • ` : ''}{l.course} Sem {l.semester}{l.division ? ` (Div ${l.division})` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: '700' }}>✓ Present</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{l.time}</div>
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
                    <XCircle size={24} color="#dc2626" />
                    <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Absent Students Today</h2>
                    <span style={{ marginLeft: 'auto', marginRight: '36px', fontSize: '0.82rem', fontWeight: '700', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '12px' }}>
                      {hasStartedSessions ? `${absentList.length} students` : '0 students'}
                    </span>
                  </div>

                  {/* Session-wise Filter Buttons */}
                  {hasStartedSessions ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                      {facultySessionsToday.map(sess => (
                        <button
                          key={sess.id}
                          onClick={() => setDashModalSession(sess.id)}
                          style={{
                            padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px',
                            border: activeSessionId === sess.id ? '1px solid #991b1b' : '1px solid #cbd5e1',
                            background: activeSessionId === sess.id ? 'linear-gradient(135deg, #991b1b, #dc2626)' : '#f8fafc',
                            color: activeSessionId === sess.id ? '#ffffff' : '#334155', fontWeight: '700', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: activeSessionId === sess.id ? '0 2px 6px rgba(153,27,27,0.2)' : 'none'
                          }}
                        >
                          <Folder size={14} /> {sess.displayText}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px', fontStyle: 'italic', textAlign: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      ℹ️ No sessions started today yet.
                    </div>
                  )}

                  {/* Target Session Banner Info */}
                  {selectedSess && (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      marginBottom: '16px',
                      fontSize: '0.85rem',
                      color: '#991b1b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div>
                        <strong style={{ color: '#991b1b' }}>Targeted Class:</strong> Sem {displaySem || 'N/A'}{' '}
                        {selectedSess.division && String(selectedSess.division).trim().toUpperCase() !== 'ALL'
                          ? `(Division ${selectedSess.division})`
                          : '(All Divisions)'}
                      </div>
                      {selectedSess.subject && (
                        <div style={{ fontWeight: '800', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          📚 {selectedSess.subject}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasStartedSessions ? (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 0' }}>
                      <p style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '6px', color: '#0f172a' }}>No session started today yet.</p>
                      <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Start a QR Code or OTP session from the dashboard to view absent students.</p>
                    </div>
                  ) : absentList.length === 0 ? (
                    <p style={{ color: '#16a34a', textAlign: 'center', padding: '30px 0', fontWeight: '600', fontSize: '0.95rem' }}>
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
                            padding: '12px 14px', borderRadius: '12px',
                            background: '#fef2f2', border: '1px solid #fecaca'
                          }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%',
                              background: '#dc2626', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.8rem', fontWeight: '800', color: '#ffffff', flexShrink: 0
                            }}>{i + 1}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>{s.name}</div>
                              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                {s.roll_no ? `Roll: ${s.roll_no} • ` : ''}{s.course} Sem {s.semester}{s.division ? ` (Div ${s.division})` : ''}
                                {s.mobile ? ` • Ph: ${s.mobile}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: '700' }}>
                                {rejLog ? `✗ Rejected (${rejLog.status || 'Failed'})` : '✗ Absent'}
                              </div>
                              {rejLog?.time && (
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Attempt: {rejLog.time}</div>
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
                  <Clock size={24} color={activeQrSessionDetails || activeOtpDetails ? '#16a34a' : '#94a3b8'} />
                  <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Active Session</h2>
                  {(activeQrSessionDetails || activeOtpDetails) && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.75rem', fontWeight: '700',
                      padding: '3px 10px', borderRadius: '20px',
                      background: '#dcfce7', border: '1px solid #86efac', color: '#15803d'
                    }}>● LIVE</span>
                  )}
                </div>

                {!activeQrSessionDetails && !activeOtpDetails && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <Clock size={40} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
                    <p style={{ fontWeight: '600', color: '#334155' }}>No active session running.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '8px', color: '#64748b' }}>Generate a QR or OTP from Dashboard to start a session.</p>
                  </div>
                )}

                {activeQrSessionDetails && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block', padding: '5px 16px', borderRadius: '20px',
                      background: '#f3e8ff', border: '1px solid #d8b4fe',
                      color: '#7e22ce', fontSize: '0.8rem', fontWeight: '800', marginBottom: '12px'
                    }}>ROTATING QR SESSION</div>
                    {activeQrSessionDetails.semester && (
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#334155', marginBottom: '16px' }}>
                        Target: Sem {activeQrSessionDetails.semester} {activeQrSessionDetails.division ? `• Div ${activeQrSessionDetails.division}` : '• All Divisions'}
                      </div>
                    )}
                    <div style={{
                      background: '#ffffff', borderRadius: '20px', padding: '18px',
                      display: 'inline-block', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', margin: '0 auto 20px'
                    }}>
                      <canvas ref={qrCanvasRef} />
                    </div>
                    <div style={{ fontSize: '0.92rem', color: '#475569', marginBottom: '8px' }}>
                      Token <strong style={{ color: '#0f172a' }}>{tokenIndex + 1}</strong> of {activeQrSessionDetails?.tokens?.length || 8} • Rotates every 15s
                    </div>
                    <div style={{
                      fontSize: '2.5rem', fontWeight: '800', color: '#9333ea',
                      fontFamily: 'monospace', letterSpacing: '2px', marginBottom: '4px'
                    }}>{qrSessionTimer}s</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Session time remaining</div>
                  </div>
                )}

                {activeOtpDetails && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block', padding: '5px 16px', borderRadius: '20px',
                      background: '#dbeafe', border: '1px solid #93c5fd',
                      color: '#1d4ed8', fontSize: '0.8rem', fontWeight: '800', marginBottom: '12px'
                    }}>STATIC OTP CODE</div>
                    {activeOtpDetails.semester && (
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#334155', marginBottom: '16px' }}>
                        Target: Sem {activeOtpDetails.semester} {activeOtpDetails.division ? `• Div ${activeOtpDetails.division}` : '• All Divisions'}
                      </div>
                    )}
                    <div style={{
                      fontSize: '3.2rem', fontWeight: '800', letterSpacing: '10px',
                      color: '#2563eb', fontFamily: 'monospace', margin: '20px 0'
                    }}>{activeOtpDetails.otp}</div>
                    <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '6px' }}>
                      Expires in
                    </div>
                    <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#d97706' }}>
                      {otpCountdown}s
                    </div>
                    <div style={{
                      marginTop: '16px', height: '6px', borderRadius: '10px',
                      background: '#e2e8f0', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: '10px',
                        background: 'linear-gradient(90deg, #2563eb, #9333ea)',
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
        {/* Left Sidebar (Photo 2 EduMark Style) */}
        <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          {/* Top Left Logo Box (Photo 2 Logo) */}
          <div className="admin-sidebar-brand">
            <div className="admin-logo-box">
              <GraduationCap size={24} color="#0f172a" strokeWidth={2.5} />
            </div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">EduMark</span>
              <span className="admin-brand-subtitle">Faculty Hub</span>
            </div>
          </div>

          {/* Navigation Items (Photo 2 Style) */}
          <nav className="admin-sidebar-nav">
            <button 
              className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
            >
              <LayoutGrid size={19} />
              <span>Dashboard</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'otp' ? 'active' : ''}`}
              onClick={() => { setActiveTab('otp'); setMobileMenuOpen(false); }}
            >
              <QrCode size={19} />
              <span>OTP/QR</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => { 
                setActiveTab('manual'); 
                setMobileMenuOpen(false); 
                fetchTodaySessions();
                fetchLiveLogs();
                fetchTodayAllAttendance();
              }}
            >
              <ClipboardList size={19} />
              <span>Manual</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'attendance_logs' ? 'active' : ''}`}
              onClick={() => { 
                setActiveTab('attendance_logs'); 
                setMobileMenuOpen(false); 
                fetchTodaySessions();
                fetchLiveLogs();
              }}
            >
              <Folder size={19} />
              <span>Attendance Logs</span>
            </button>


            <button 
              className={`admin-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => { setActiveTab('reports'); setMobileMenuOpen(false); }}
            >
              <BarChart3 size={19} />
              <span>Reports</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'leaves' ? 'active' : ''}`}
              onClick={() => { setActiveTab('leaves'); setMobileMenuOpen(false); fetchAllLeaves(); }}
            >
              <FileText size={19} />
              <span>Leave Request</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
            >
              <KeyRound size={19} />
              <span>Settings</span>
            </button>
          </nav>

          {/* Sidebar Footer */}
          <div className="admin-sidebar-footer">
            {/* User Profile Card */}
            <div className="admin-user-profile-card">
              <div className="admin-user-avatar">
                <GraduationCap size={20} color="#0f172a" />
              </div>
              <div className="admin-user-details">
                <span className="admin-user-profile-name">{activeUser?.name || 'Faculty Member'}</span>
                <span className="admin-user-profile-email">{activeUser?.email || 'faculty@college.edu'}</span>
              </div>
            </div>

            {/* Logout Button */}
            <button className="admin-logout-btn" onClick={onLogout}>
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <div className="admin-main-wrapper content-light">
          <header className={`admin-top-header-banner ${activeTab === 'dashboard' ? 'dashboard-header-tall' : ''}`}>
            <div className="admin-banner-content">
              <div className="admin-header-title-row" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {!showFloatingMobileMenu && (
                  <button
                    type="button"
                    className="admin-side-menu-top-btn"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    title={mobileMenuOpen ? "Close Side Menu" : "Open Side Menu"}
                  >
                    {mobileMenuOpen ? (
                      <X size={22} color="#ffffff" strokeWidth={2.5} />
                    ) : (
                      <Menu size={22} color="#ffffff" strokeWidth={2.5} />
                    )}
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h1 className="admin-banner-title">
                    {activeTab === 'dashboard' ? 'Faculty Dashboard' :
                     activeTab === 'otp' ? 'OTP & QR Session' :
                     activeTab === 'manual' ? 'Manual Attendance' :
                     activeTab === 'attendance_logs' ? 'Attendance Logs' :
                     activeTab === 'reports' ? 'Attendance Reports' :
                     activeTab === 'leaves' ? 'Leave Request' :
                     activeTab === 'settings' ? 'Account Settings' : 'Faculty Dashboard'}
                  </h1>
                  <p className="admin-banner-subtitle" style={{ margin: 0 }}>
                    Welcome back, <strong className="admin-banner-username">{activeUser?.name || 'Faculty Member'}</strong> 👋
                  </p>
                </div>
              </div>
            </div>

            {(activeQrSessionDetails || activeOtpDetails) && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '700',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }} />
                LIVE
              </span>
            )}
          </header>

          {/* Main Scrollable Content Workspace */}
          <main className="admin-main-content">
          {activeTab === 'dashboard' && (
            <div style={{ ...styles.tabContent, gap: isMobile ? '16px' : '24px' }}>
              {/* Statistics Grid */}
              <div className="grid-4-cols" style={{ marginBottom: isMobile ? '10px' : '20px', display: 'grid', gridTemplateColumns: isMobile ? '100%' : 'repeat(4, 1fr)', gap: isMobile ? '12px' : '16px' }}>

                {/* Present Today - Clickable (Styled like Photo 2) */}
                <div
                  className="stat-card-hover"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    padding: '24px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    minHeight: '135px'
                  }}
                  onClick={() => setDashModal('present')}
                  title="Click to view session"
                >
                  <div style={{
                    background: 'linear-gradient(135deg, #09355c, #0f4c81)',
                    color: '#ffffff',
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 14px rgba(9, 53, 92, 0.3)',
                    flexShrink: 0
                  }}>
                    <Users size={28} color="#ffffff" />
                  </div>
                  <div>
                    <span style={{
                      fontSize: '1.2rem',
                      color: '#0f172a',
                      fontWeight: '800',
                      display: 'block',
                      lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }}>
                      Present Today
                    </span>
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#2563eb',
                      fontWeight: '600',
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Click to view session <span>→</span>
                    </div>
                  </div>
                </div>

                {/* Absent Today - Clickable (Styled like Photo 2) */}
                <div
                  className="stat-card-hover"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    padding: '24px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    minHeight: '135px'
                  }}
                  onClick={() => setDashModal('absent')}
                  title="Click to view session"
                >
                  <div style={{
                    background: 'linear-gradient(135deg, #991b1b, #dc2626)',
                    color: '#ffffff',
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 14px rgba(153, 27, 27, 0.3)',
                    flexShrink: 0
                  }}>
                    <UserX size={28} color="#ffffff" />
                  </div>
                  <div>
                    <span style={{
                      fontSize: '1.2rem',
                      color: '#0f172a',
                      fontWeight: '800',
                      display: 'block',
                      lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }}>
                      Absent Today
                    </span>
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#dc2626',
                      fontWeight: '600',
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Click to view session <span>→</span>
                    </div>
                  </div>
                </div>

                {/* Leave Request - Clickable (3rd Card) */}
                <div
                  className="stat-card-hover"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    padding: '24px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    minHeight: '135px'
                  }}
                  onClick={() => { setActiveTab('leaves'); fetchAllLeaves(); }}
                  title="Click to view leave requests"
                >
                  <div style={{
                    background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
                    color: '#ffffff',
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 14px rgba(13, 148, 136, 0.3)',
                    flexShrink: 0
                  }}>
                    <ClipboardList size={28} color="#ffffff" />
                  </div>
                  <div>
                    <span style={{
                      fontSize: '1.2rem',
                      color: '#0f172a',
                      fontWeight: '800',
                      display: 'block',
                      lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }}>
                      Leave Request
                    </span>
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#0d9488',
                      fontWeight: '600',
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Click to view leave request <span>→</span>
                    </div>
                  </div>
                </div>

                {/* Analytics - Clickable (4th Card) */}
                <div
                  className="stat-card-hover"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    padding: '24px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    minHeight: '135px'
                  }}
                  onClick={() => setActiveTab('reports')}
                  title="Click to view analytics and reports"
                >
                  <div style={{
                    background: 'linear-gradient(135deg, #e69500, #f59e0b)',
                    color: '#09355c',
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 14px rgba(230, 149, 0, 0.3)',
                    flexShrink: 0
                  }}>
                    <TrendingUp size={28} color="#09355c" strokeWidth={2.5} />
                  </div>
                  <div>
                    <span style={{
                      fontSize: '1.2rem',
                      color: '#0f172a',
                      fontWeight: '800',
                      display: 'block',
                      lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }}>
                      Analytics
                    </span>
                    <div style={{
                      fontSize: '0.82rem',
                      color: '#d97706',
                      fontWeight: '600',
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      View insights and analytics <span>→</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Row: QR Sessions Run, Active Session & Session Controllers */}
              <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: isMobile ? '100%' : 'repeat(3, 1fr)', gap: isMobile ? '12px' : '16px' }}>
                
                {/* Column 1: QR Sessions Run */}
                <div className="glass-panel" style={styles.statCard}>
                  <div style={styles.statHeader}>
                    <span style={styles.statLabel}>QR Sessions Run</span>
                    <QrCode size={20} color="#a855f7" />
                  </div>
                  <div style={styles.statVal}>{stats.qrSessionsGenerated} / 5</div>
                  <div style={styles.statSubText}>Daily maximum limit of 5 sessions</div>
                </div>

                {/* Column 2: Active Session (Moved between QR Sessions & Session Controllers) */}
                <div
                  className="glass-panel stat-card-hover"
                  style={{
                    ...styles.statCard,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    border: (activeQrSessionDetails || activeOtpDetails) ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: (activeQrSessionDetails || activeOtpDetails) ? 'linear-gradient(135deg, rgba(3, 25, 54, 0.85), rgba(34, 197, 94, 0.08))' : 'rgba(3, 25, 54, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '150px'
                  }}
                  onClick={() => setDashModal('session')}
                  title="Click to view active session"
                >
                  <div style={{ ...styles.statHeader, marginBottom: '14px' }}>
                    <span style={{ ...styles.statLabel, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.78rem', color: (activeQrSessionDetails || activeOtpDetails) ? '#4ade80' : 'var(--text-secondary)', fontWeight: '700' }}>Active Session</span>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: (activeQrSessionDetails || activeOtpDetails) ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)', border: (activeQrSessionDetails || activeOtpDetails) ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Clock size={20} color={activeQrSessionDetails || activeOtpDetails ? '#4ade80' : 'var(--text-muted)'} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ ...styles.statVal, fontSize: '2.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                        {activeQrSessionDetails ? 'QR' : activeOtpDetails ? 'OTP' : 'None'}
                      </div>
                      {(activeQrSessionDetails || activeOtpDetails) && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: '700', padding: '3px 10px',
                          borderRadius: '20px', background: 'rgba(34,197,94,0.2)',
                          border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80',
                          letterSpacing: '0.5px'
                        }}>
                          ● LIVE
                        </span>
                      )}
                    </div>
                    <div style={{ ...styles.statSubText, fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {activeQrSessionDetails
                        ? `QR active • ${qrSessionTimer}s remaining`
                        : activeOtpDetails
                          ? `OTP active • ${otpCountdown}s remaining`
                          : 'No session running'}
                    </div>
                  </div>
                  <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#4ade80', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Click to view session <span>→</span>
                  </div>
                </div>

                {/* Column 3: Session Controllers */}
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
            </div>
          )}

          {/* ===== OTP & QR SESSION TAB ===== */}
          {activeTab === 'otp' && (
            <div style={styles.tabContent}>
              {/* Generator Controls at top */}
              <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '16px 14px' : '28px', marginBottom: '20px' }}>
                <div className="mobile-stack-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h3 style={styles.cardTitle}>Session Controllers</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      Generate dynamic, high-security QR or OTP codes for class attendance.
                    </p>
                  </div>
                  <div className="button-stack-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => openSemesterModal('qr')}
                      className="btn btn-primary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || !qrGenerationEnabled || stats.qrSessionsGenerated >= 5}
                      style={{ gap: '8px', padding: '10px 20px' }}
                    >
                      <QrCode size={18} />
                      Generate Live QR Code
                    </button>
                    <button
                      onClick={() => openSemesterModal('otp')}
                      className="btn btn-secondary"
                      disabled={!!activeQrSessionDetails || !!activeOtpDetails || otpRemaining === 0}
                      style={{ gap: '8px', padding: '10px 20px' }}
                    >
                      <KeyRound size={18} />
                      Generate OTP ({otpRemaining} Left)
                    </button>
                  </div>
                </div>

                {/* Limit Warnings */}
                <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    QR Sessions Today: <strong style={{ color: stats.qrSessionsGenerated >= 5 ? '#ef4444' : '#4ade80' }}>{stats.qrSessionsGenerated} / 5</strong>
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    OTP Remaining Today: <strong style={{ color: otpRemaining === 0 ? '#ef4444' : '#60a5fa' }}>{otpRemaining}</strong>
                  </span>
                  {!qrGenerationEnabled && (
                    <span style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: '600' }}>
                      ⚠️ QR session generation disabled by Admin
                    </span>
                  )}
                </div>
              </div>

              {/* Main Content Area: Centered Live Session Screen */}
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <div className="glass-panel" style={{
                  ...styles.cardPadding,
                  padding: isMobile ? '20px 16px' : '36px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  maxWidth: '720px',
                  borderRadius: '20px'
                }}>
                  <h3 style={{ ...styles.cardTitle, width: '100%', textAlign: 'center', marginBottom: '20px', fontSize: '1.25rem' }}>
                    Live Session Screen
                  </h3>

                  {activeQrSessionDetails ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '6px 22px',
                        borderRadius: '30px',
                        background: 'rgba(168, 85, 247, 0.12)',
                        border: '1px solid rgba(168, 85, 247, 0.35)',
                        color: '#c084fc',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase'
                      }}>
                        ROTATING QR SESSION
                      </div>

                      <div style={{ fontSize: '0.98rem', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center', marginBottom: '4px' }}>
                        Target: Sem {activeQrSessionDetails.semester || '1'} • Div {activeQrSessionDetails.division || 'All'} {activeQrSessionDetails.subject ? `• 📚 ${activeQrSessionDetails.subject}` : ''}
                      </div>

                      {/* White Rounded Box for QR Code */}
                      <div style={{
                        padding: '24px',
                        background: '#ffffff',
                        borderRadius: '24px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        boxShadow: '0 12px 36px rgba(168, 85, 247, 0.25)',
                        marginBottom: '8px'
                      }}>
                        <canvas ref={qrCanvasRef} />
                      </div>

                      {/* Stats Row: Session Expires & Token Rotates */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', width: '100%', marginBottom: '4px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                            Session Expires
                          </span>
                          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
                            {Math.floor(qrSessionTimer / 60)}:{String(qrSessionTimer % 60).padStart(2, '0')}
                          </div>
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                            Token Rotates
                          </span>
                          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
                            {qrCodeTimer}s
                          </div>
                        </div>
                      </div>

                      {/* Subtitle note */}
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 12px 0' }}>
                        Token index {(tokenIndex || 0) + 1} of {activeQrSessionDetails?.tokens?.length || 20} is active. Keep this screen visible to the class.
                      </p>

                      {/* End Current Session Button */}
                      <button
                        onClick={handleEndCurrentQrSession}
                        style={{
                          width: '100%',
                          maxWidth: '440px',
                          padding: '13px 24px',
                          borderRadius: '12px',
                          border: '1.5px solid rgba(226, 232, 240, 0.4)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-primary)',
                          fontSize: '0.92rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                        }}
                      >
                        End Current Session
                      </button>
                    </div>
                  ) : activeOtpDetails ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', width: '100%' }}>
                      <div style={{
                        display: 'inline-block', padding: '6px 20px', borderRadius: '20px',
                        background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.4)',
                        color: '#60a5fa', fontSize: '0.85rem', fontWeight: '700', letterSpacing: '0.03em'
                      }}>
                        STATIC OTP SESSION
                      </div>

                      {activeOtpDetails.semester && (
                        <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'center' }}>
                          Sem {activeOtpDetails.semester} {activeOtpDetails.division ? `• Div ${activeOtpDetails.division}` : '• All Divisions'} {activeOtpDetails.subject ? `• 📚 ${activeOtpDetails.subject}` : ''}
                        </div>
                      )}

                      <div style={{
                        fontSize: '3.5rem', fontWeight: '800', letterSpacing: '14px',
                        color: '#60a5fa', fontFamily: 'monospace', margin: '16px 0',
                        background: 'rgba(59, 130, 246, 0.1)', padding: '18px 36px', borderRadius: '20px',
                        border: '1.5px dashed rgba(59, 130, 246, 0.4)'
                      }}>
                        {activeOtpDetails.otp}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '500px', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                        <span>OTP Expiry Remaining:</span>
                        <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: '700' }}>
                          {Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 10px', width: '100%' }}>
                      <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'rgba(147, 51, 234, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid rgba(147, 51, 234, 0.2)' }}>
                        <QrCode size={42} color="#a855f7" />
                      </div>
                      <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 700, fontSize: '1.15rem' }}>No Active Session</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '0', lineHeight: 1.5, maxWidth: '360px', margin: '0 auto' }}>
                        Click "Generate Live QR Code" or "Generate OTP" above to start a live attendance session for your class.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'attendance_logs' && (
            <div style={styles.tabContent}>
              {/* Attendance Logs Directory Card */}
              <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px' }}>
                {isMobile ? (
                  /* ===== MOBILE VIEW HEADER (MATCHES PHOTO 2 EXACTLY) ===== */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', width: '100%' }}>
                    {/* Row 1: Back Button */}
                    {selectedSemFolder !== null && (
                      <button
                        onClick={() => {
                          if (selectedSessionFolder) {
                            setSelectedSessionFolder(null);
                          } else {
                            setSelectedSemFolder(null);
                            setSelectedSessionFolder(null);
                            setFolderSearchName('');
                            setFolderSearchEnroll('');
                            setFolderSearchDate(new Date().toISOString().split('T')[0]);
                            setFolderDivFilter('ALL');
                          }
                        }}
                        className="btn btn-secondary"
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          fontSize: '0.88rem',
                          fontWeight: '600',
                          borderRadius: '12px',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}
                      >
                        ← Back
                      </button>
                    )}

                    {/* Row 2: Folder Icon + Title & Description */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                      <Folder size={22} color="#f59e0b" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ ...styles.cardTitle, marginBottom: '4px', lineHeight: 1.3, wordBreak: 'break-word', fontSize: '1.05rem' }}>
                          {selectedSemFolder === null
                            ? 'Attendance Logs'
                            : (selectedSessionFolder
                                ? `${selectedSessionFolder.title}`
                                : `Sem ${selectedSemFolder} Attendance`
                              )
                          }
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: 0, wordBreak: 'break-word', lineHeight: 1.4 }}>
                          {selectedSemFolder === null
                            ? 'Click on any semester folder to view date-wise session archives.'
                            : (selectedSessionFolder
                                ? 'View present and absent student records for this session.'
                                : `Select a date to view session attendance archives for Semester ${selectedSemFolder}.`
                              )
                          }
                        </p>
                      </div>
                    </div>

                    {/* Row 3 & 4: Select Date + Reset / Reload Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                      {selectedSemFolder === null ? (
                        /* Root View: Date Archive + Reload */
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📅 Date Archive
                          </div>
                          <button
                            onClick={handleReloadDirectory}
                            disabled={directoryReloading}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              color: '#1e293b',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                          >
                            <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} color="#0284c7" />
                            <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                          </button>
                        </div>
                      ) : selectedSessionFolder ? (
                        /* Session View: Select Date Row + Reload Button Row */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Select Date:</label>
                            <input
                              type="date"
                              className="compact-date-picker"
                              value={folderSearchDate}
                              onChange={(e) => setFolderSearchDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <button
                              onClick={handleReloadDirectory}
                              disabled={directoryReloading}
                              style={{
                                padding: '7px 16px',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                border: '1.5px solid #cbd5e1',
                                color: '#1e293b',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            >
                              <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} color="#0284c7" />
                              <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Sem View (Photo 2): Select Date Row + Reset Button Row */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Select Date:</label>
                            <input
                              type="date"
                              className="compact-date-picker"
                              value={folderSearchDate}
                              onChange={(e) => {
                                setFolderSearchDate(e.target.value);
                                setSelectedSessionFolder(null);
                              }}
                            />
                          </div>
                          <div>
                            <button
                              onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                setFolderSearchDate(today);
                                setSelectedSessionFolder(null);
                                setFolderDivFilter('ALL');
                                setFolderSearchName('');
                                setFolderSearchEnroll('');
                                showToast('Date reset to Today', 'info', 2000);
                              }}
                              style={{
                                padding: '7px 16px',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                border: '1.5px solid #cbd5e1',
                                color: '#1e293b',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            >
                              <RotateCcw size={14} color="#f59e0b" />
                              <span>Reset</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ===== DESKTOP VIEW HEADER ===== */
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      {selectedSemFolder !== null && (
                        <button
                          onClick={() => {
                            if (selectedSessionFolder) {
                              setSelectedSessionFolder(null);
                            } else {
                              setSelectedSemFolder(null);
                              setSelectedSessionFolder(null);
                              setFolderSearchName('');
                              setFolderSearchEnroll('');
                              setFolderSearchDate(new Date().toISOString().split('T')[0]);
                              setFolderDivFilter('ALL');
                            }
                          }}
                          className="btn btn-secondary"
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.84rem',
                            fontWeight: '600',
                            borderRadius: '10px',
                            flexShrink: 0
                          }}
                        >
                          ← Back
                        </button>
                      )}
                      <Folder size={22} color="#f59e0b" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ ...styles.cardTitle, marginBottom: '2px', lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {selectedSemFolder === null
                            ? 'Attendance Logs'
                            : (selectedSessionFolder
                                ? `${selectedSessionFolder.title}`
                                : `Sem ${selectedSemFolder} Attendance`
                              )
                          }
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: 0, wordBreak: 'break-word' }}>
                          {selectedSemFolder === null
                            ? 'Click on any semester folder to view date-wise session archives.'
                            : (selectedSessionFolder
                                ? 'View present and absent student records for this session.'
                                : `Select a date to view session attendance archives for Semester ${selectedSemFolder}.`
                              )
                          }
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
                      {selectedSemFolder === null ? (
                        <>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            📅 Date Archive
                          </div>
                          <button
                            onClick={handleReloadDirectory}
                            disabled={directoryReloading}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              color: '#1e293b',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} color="#0284c7" />
                            <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                          </button>
                        </>
                      ) : selectedSessionFolder ? (
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', maxWidth: '100%' }}>
                          <Calendar size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>Select Date:</label>
                          <input
                            type="date"
                            className="compact-date-picker"
                            value={folderSearchDate}
                            onChange={(e) => setFolderSearchDate(e.target.value)}
                          />
                          <button
                            onClick={handleReloadDirectory}
                            disabled={directoryReloading}
                            className="compact-date-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              color: '#1e293b',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} color="#0284c7" />
                            <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', maxWidth: '100%' }}>
                          <Calendar size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>Select Date:</label>
                          <input
                            type="date"
                            className="compact-date-picker"
                            value={folderSearchDate}
                            onChange={(e) => {
                              setFolderSearchDate(e.target.value);
                              setSelectedSessionFolder(null);
                            }}
                          />
                          <button
                            onClick={() => {
                              const today = new Date().toISOString().split('T')[0];
                              setFolderSearchDate(today);
                              setSelectedSessionFolder(null);
                              setFolderDivFilter('ALL');
                              setFolderSearchName('');
                              setFolderSearchEnroll('');
                              showToast('Date reset to Today', 'info', 2000);
                            }}
                            className="compact-date-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              color: '#1e293b',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <RotateCcw size={14} color="#f59e0b" />
                            <span>Reset</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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



                    {/* View 1: Session Folders Grid for Selected Date */}
                    {!selectedSessionFolder ? (
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Folder size={18} color="#f59e0b" />
                          Sessions Conducted
                        </h4>

                        {(() => {
                          const targetDate = folderSearchDate;
                          
                          const normDate = (raw) => getLocalDateStr(raw);

                          const rawCombined = [...(liveLogs || []), ...(dateLogs || [])];
                          const seenLogKeys = new Set();
                          const combinedLogsList = rawCombined.filter(log => {
                            if (!log) return false;
                            const key = log.id ? String(log.id) : `${log.enrollment_no}_${log.qr_session_id || log.otp_id}_${log.time}`;
                            if (seenLogKeys.has(key)) return false;
                            seenLogKeys.add(key);
                            return true;
                          });

                          const logsForDate = combinedLogsList.filter(log => {
                            const logSemNum = String(log.semester || '').replace(/\D/g, '');
                            const selSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                            if (logSemNum !== selSemNum) return false;
                            if (folderDivFilter !== 'ALL' && !isDivMatch(log.division, folderDivFilter)) return false;
                            if (targetDate) {
                              const d = normDate(log.date || log.created_at || getLocalDateStr(new Date()));
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
                                created_at: log.date || log.created_at,
                                logs: []
                              });
                            }
                            sessionsMap.get(sessKey).logs.push(log);
                          });

                          const todayStr = getLocalDateStr(new Date());
                          if (!targetDate || targetDate === todayStr) {
                            (facultySessionsToday || []).forEach((fSess) => {
                              const fSemNum = String(fSess.semester || '').replace(/\D/g, '');
                              const selSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                              if (fSemNum === selSemNum) {
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
                                      created_at: fSess.date || fSess.created_at,
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

                          const sessionList = Array.from(sessionsMap.values())
                            .filter(s => {
                              if (!targetDate) return true;
                              const sDate = normDate(s.created_at || s.date);
                              const hasLogsOnDate = s.logs && s.logs.length > 0;
                              const isCreatedOnDate = sDate && sDate === targetDate;
                              return hasLogsOnDate || isCreatedOnDate;
                            })
                            .map((s, idx) => {
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

                          if (folderDateLoading) {
                            return (
                              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                                <RefreshCw size={32} color="#f59e0b" className="spin-icon" style={{ marginBottom: '12px' }} />
                                <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                  Loading sessions for {folderSearchDate || 'selected date'}...
                                </p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                                  Fetching semester attendance logs and session records.
                                </p>
                              </div>
                            );
                          }

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
                                  onClick={() => {
                                    setSelectedSessionFolder(sess);
                                    setSessionFolderTab(sess.presentCount > 0 ? 'present' : 'absent');
                                  }}
                                  style={{
                                    background: 'rgba(245, 158, 11, 0.10)',
                                    border: '1.5px solid rgba(245, 158, 11, 0.40)',
                                    borderRadius: '16px',
                                    padding: '18px 16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(245, 158, 11, 0.28)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                    <Folder size={28} color="#f59e0b" style={{ flexShrink: 0 }} />
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                      <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: '700', whiteSpace: 'nowrap' }} title={`${sess.presentCount} Present`}>
                                        ✓ {sess.presentCount}
                                      </span>
                                      <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontWeight: '700', whiteSpace: 'nowrap' }} title={`${sess.absentCount} Absent`}>
                                        ✕ {sess.absentCount}
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontWeight: '700', fontSize: '1.02rem', color: 'var(--text-primary)' }}>
                                      {sess.title}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: '600', marginTop: '2px' }}>
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
                        const rawPresentLogs = selectedSessionFolder.logs ? selectedSessionFolder.logs.filter(l => l.status === 'Success') : [];
                        const seenPresentKeys = new Set();
                        const presentLogs = rawPresentLogs.filter(l => {
                          const key = String(l.enrollment_no || l.id || '').trim().toLowerCase();
                          if (!key || seenPresentKeys.has(key)) return false;
                          seenPresentKeys.add(key);
                          return true;
                        });
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
                              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {selectedSessionFolder.title} (Sem {selectedSemFolder}{selectedSessionFolder.division && String(selectedSessionFolder.division).toUpperCase() !== 'ALL' ? ` Div ${selectedSessionFolder.division}` : ''})
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

                                      const sortedPresent = [...filteredPresent].sort((a, b) => {
                                        const rA = parseInt(String(a.roll_no || '').replace(/\D/g, ''), 10);
                                        const rB = parseInt(String(b.roll_no || '').replace(/\D/g, ''), 10);
                                        if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
                                        return String(a.roll_no || '').localeCompare(String(b.roll_no || ''), undefined, { numeric: true });
                                      });

                                      return sortedPresent.map((st, idx) => (
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

                                      const sortedAbsent = [...filteredAbsent].sort((a, b) => {
                                        const rA = parseInt(String(a.roll_no || '').replace(/\D/g, ''), 10);
                                        const rB = parseInt(String(b.roll_no || '').replace(/\D/g, ''), 10);
                                        if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
                                        return String(a.roll_no || '').localeCompare(String(b.roll_no || ''), undefined, { numeric: true });
                                      });

                                      return sortedAbsent.map((st, idx) => (
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
                  <label style={styles.filterLabel}>Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    style={styles.selectInput}
                  >
                    <option value="subject_wise" style={{ color: '#000' }}>Subject Wise Report</option>
                    <option value="subject_date_wise" style={{ color: '#000' }}>Subject Attendance with Dates</option>
                    <option value="semester_date_wise" style={{ color: '#000' }}>Semester Attendance with Dates</option>
                  </select>
                </div>

                {reportType === 'semester_date_wise' && (
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Select Semester</label>
                    <select
                      value={reportSemFilter}
                      onChange={(e) => setReportSemFilter(e.target.value)}
                      style={styles.selectInput}
                    >
                      <option value="1" style={{ color: '#000' }}>Semester 1</option>
                      <option value="2" style={{ color: '#000' }}>Semester 2</option>
                      <option value="3" style={{ color: '#000' }}>Semester 3</option>
                      <option value="4" style={{ color: '#000' }}>Semester 4</option>
                      <option value="5" style={{ color: '#000' }}>Semester 5</option>
                      <option value="6" style={{ color: '#000' }}>Semester 6</option>
                      <option value="7" style={{ color: '#000' }}>Semester 7</option>
                      <option value="8" style={{ color: '#000' }}>Semester 8</option>
                    </select>
                  </div>
                )}

                {(reportType === 'subject_wise' || reportType === 'subject_date_wise') && (
                  <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Select Subject</label>
                    <select
                      value={reportSubjectFilter}
                      onChange={(e) => setReportSubjectFilter(e.target.value)}
                      style={styles.selectInput}
                    >
                      <option value="ALL" style={{ color: '#000' }}>All Subjects</option>
                      {uniqueSubjectList.map(sub => (
                        <option key={sub.name} value={sub.name} style={{ color: '#000' }}>{sub.name} (Sem {sub.semester})</option>
                      ))}
                    </select>
                  </div>
                )}

                {(reportType === 'subject_date_wise' || reportType === 'semester_date_wise') && (
                  <>
                    <div style={styles.filterGroup}>
                      <label style={styles.filterLabel}>Start Date</label>
                      <input
                        type="date"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        style={styles.selectInput}
                      />
                    </div>
                    <div style={styles.filterGroup}>
                      <label style={styles.filterLabel}>End Date</label>
                      <input
                        type="date"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        style={styles.selectInput}
                      />
                    </div>
                    <div style={styles.filterGroup}>
                      <label style={styles.filterLabel}>Division (Optional)</label>
                      <select
                        value={reportDivFilter}
                        onChange={(e) => setReportDivFilter(e.target.value)}
                        style={styles.selectInput}
                      >
                        <option value="ALL" style={{ color: '#000' }}>All Divisions</option>
                        <option value="A" style={{ color: '#000' }}>Div A</option>
                        <option value="B" style={{ color: '#000' }}>Div B</option>
                        <option value="C" style={{ color: '#000' }}>Div C</option>
                      </select>
                    </div>
                  </>
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

              {/* CARD 2: MOBILE NAVIGATION SETTINGS */}
              <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '12px 8px' : '28px', marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px', marginBottom: '16px' }}>
                  <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Menu size={24} color="#f59e0b" />
                  </div>
                  <div>
                    <h3 style={{ ...styles.cardTitle, margin: 0 }}>Mobile Navigation Settings</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>Configure floating mobile menu button display</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      Bottom Floating Hamburger Button
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      ON: Bottom floating menu button | OFF: Top header banner menu button
                    </div>
                  </div>

                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: showFloatingMobileMenu ? '#10b981' : '#64748b' }}>
                      {showFloatingMobileMenu ? 'ON (Show)' : 'OFF (Hide)'}
                    </span>
                    <input
                      type="checkbox"
                      checked={showFloatingMobileMenu}
                      onChange={handleToggleFloatingMobileMenu}
                      style={{
                        width: '44px',
                        height: '24px',
                        cursor: 'pointer',
                        accentColor: '#f59e0b'
                      }}
                    />
                  </label>
                </div>
              </div>
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

                const availableDivisions = (() => {
                  const divSet = new Set();
                  targetStudents.forEach(st => {
                    if (st && st.division) divSet.add(String(st.division).trim().toUpperCase());
                  });
                  return Array.from(divSet).sort();
                })();

                const filteredStudents = targetStudents.filter(s => {
                  if (manualDivFilter !== 'ALL' && !isDivMatch(s.division, manualDivFilter)) return false;
                  if (manualSearchName) {
                    const q = manualSearchName.toLowerCase().trim();
                    const nameMatch = s.name && s.name.toLowerCase().includes(q);
                    const rollMatch = s.roll_no && String(s.roll_no).includes(q);
                    const enrollMatch = s.enrollment_no && String(s.enrollment_no).toLowerCase().includes(q);
                    if (!nameMatch && !rollMatch && !enrollMatch) return false;
                  }
                  return true;
                });

                return (
                  <div className="glass-panel" style={styles.cardPadding}>
                    {/* Breadcrumb + Back */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { setManualSessionFolder(null); setManualDivFilter('ALL'); setManualSearchName(''); }}
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

                    {/* Search & Filters */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Search Input */}
                      <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          className="glass-input"
                          style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
                          placeholder="Search student by name, roll no..."
                          value={manualSearchName}
                          onChange={e => setManualSearchName(e.target.value)}
                        />
                      </div>

                      {/* Division Filter Dropdown */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Division:</span>
                        <select
                          className="glass-input"
                          value={manualDivFilter}
                          onChange={e => setManualDivFilter(e.target.value)}
                          style={{ padding: '8px 12px', fontSize: '0.85rem', borderRadius: '8px' }}
                        >
                          <option value="ALL">All Divisions</option>
                          {availableDivisions.map(div => (
                            <option key={div} value={div}>Division {div}</option>
                          ))}
                        </select>
                      </div>

                      {(manualSearchName || manualDivFilter !== 'ALL') && (
                        <button
                          onClick={() => { setManualSearchName(''); setManualDivFilter('ALL'); }}
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>

                    {/* Students Table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ ...styles.table, minWidth: '600px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <th style={styles.tableTh}>Roll No</th>
                            <th style={styles.tableTh}>Name</th>
                            <th style={styles.tableTh}>Division</th>
                            <th style={styles.tableTh}>Action</th>
                            <th style={styles.tableTh}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ ...styles.noDataRow, textAlign: 'center' }}>No students found for this session class filter.</td>
                            </tr>
                          ) : filteredStudents.map(student => {
                            const safeLogs = Array.isArray(manualTodayLogs) ? manualTodayLogs : [];
                            const sessionRecord = safeLogs.find(l => {
                              const matchStudent = (l.student_id && String(l.student_id) === String(student.id)) ||
                                (l.enrollment_no && String(l.enrollment_no).trim().toLowerCase() === String(student.enrollment_no || '').trim().toLowerCase());
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

          {/* TAB: LEAVE APPLICATIONS DIRECTORY */}
          {activeTab === 'leaves' && (
            <div style={styles.tabContent}>
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={24} color="#f59e0b" />
                    Student Leave Applications Directory
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Review and approve or reject absence & leave requests submitted by students.
                  </p>
                </div>
                <button className="btn btn-secondary" onClick={fetchAllLeaves} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
                  <RefreshCw size={16} className={leavesLoading ? 'spin' : ''} />
                  Refresh Requests
                </button>
              </div>

              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Student Details</th>
                        <th>Leave Type</th>
                        <th>Dates</th>
                        <th>Request Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allLeaves.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                            No student leave applications found.
                          </td>
                        </tr>
                      ) : (
                        allLeaves.map((l) => {
                          const matchedStu = (studentsList || []).find(s => String(s.id) === String(l.student_id) || s.enrollment_no === l.enrollment_no);
                          const rollNum = l.roll_no || l.roll || (matchedStu ? (matchedStu.roll_no || matchedStu.roll) : '') || 'N/A';

                          return (
                            <React.Fragment key={l.id}>
                              <tr>
                                <td>
                                  <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{l.student_name || 'Student'}</div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Roll: {rollNum} • Sem {l.semester} (Div {l.division || 'A'})
                                  </div>
                                  <div style={{ fontSize: '0.76rem', color: '#60a5fa', fontWeight: '600', marginTop: '2px' }}>
                                    To: {l.recipient_name || 'All Admin & Faculty'}
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: '600', color: '#d97706', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                    {l.type}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.84rem' }}>
                                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                      From: {formatDateDDMMYYYY(l.from_date || l.from)}
                                    </div>
                                    <div style={{ fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                      To: {formatDateDDMMYYYY(l.to_date || l.to)}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ fontSize: '0.84rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {formatDateDDMMYYYY(l.date_submitted || l.dateSubmitted)}
                                </td>
                                <td>
                                  <span className={`status-badge ${l.status === 'Approved' ? 'success' : l.status === 'Pending' ? 'warning' : 'failed'}`} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}>
                                    {l.status === 'Approved' ? '🟢 Approved' : l.status === 'Pending' ? '🟡 Pending Review' : '🔴 Rejected'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ ...styles.actionButtonContainer, justifyContent: 'center' }}>
                                    <button
                                      className="btn btn-success"
                                      disabled={l.status === 'Approved'}
                                      onClick={() => handleUpdateLeaveStatus(l.id, 'Approved')}
                                      style={{
                                        ...styles.actionBtn,
                                        opacity: l.status === 'Approved' ? 0.4 : 1,
                                        cursor: l.status === 'Approved' ? 'not-allowed' : 'pointer'
                                      }}
                                      title="Approve Leave Application"
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button
                                      className="btn btn-secondary"
                                      disabled={l.status === 'Rejected'}
                                      onClick={() => handleUpdateLeaveStatus(l.id, 'Rejected')}
                                      style={{
                                        ...styles.actionBtn,
                                        background: l.status === 'Rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                                        color: '#ef4444',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        opacity: l.status === 'Rejected' ? 0.4 : 1,
                                        cursor: l.status === 'Rejected' ? 'not-allowed' : 'pointer'
                                      }}
                                      title="Reject Leave Application"
                                    >
                                      <X size={16} />
                                    </button>
                                    <button
                                      className="btn btn-danger"
                                      onClick={() => handleDeleteLeave(l.id)}
                                      style={styles.actionBtn}
                                      title="Delete Leave Application Record"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              <tr key={`reason-${l.id}`} style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1.5px solid var(--border-light)' }}>
                                <td colSpan="6" style={{ padding: '8px 16px 12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  📝 <strong style={{ color: 'var(--text-primary)' }}>Reason / Remarks:</strong> {l.reason || 'No detailed reason provided.'}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===== SEMESTER, DIVISION & SUBJECT SELECT MODAL FOR GENERATION ===== */}
      {semesterModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0,
            width: '100dvw', height: '100dvh', minHeight: '100%',
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', boxSizing: 'border-box'
          }}
          onClick={() => setSemesterModal(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: '440px', borderRadius: '20px',
              padding: isMobile ? '20px 16px' : '28px',
              maxHeight: '90dvh', overflowY: 'auto',
              position: 'relative', textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              background: '#ffffff',
              color: '#000000',
              border: '1px solid #e2e8f0'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSemesterModal(null)}
              style={{
                position: 'absolute', top: '16px', right: '16px', background: 'none',
                border: 'none', color: '#000000', cursor: 'pointer', fontSize: '1.4rem', fontWeight: 'bold'
              }}
            >✕</button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#000000', marginBottom: '6px' }}>
              Start {semesterModal === 'qr' ? 'QR Code' : 'OTP'} Session
            </h3>
            <p style={{ color: '#000000', fontSize: '0.88rem', fontWeight: '600', marginBottom: '20px' }}>
              Select assigned semester, division & teaching subject:
            </p>

            {allFacultySubjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>⚠️</div>
                <h4 style={{ color: '#d97706', fontSize: '1.08rem', fontWeight: '800', margin: '0 0 8px 0' }}>
                  No Subjects Mapped!
                </h4>
                <p style={{ color: '#000000', fontSize: '0.88rem', fontWeight: '600', margin: '0 0 20px 0', lineHeight: '1.5' }}>
                  Aapke account me koi teaching subject mapped nahi hai. Admin panel se is Faculty ko subject assign karayein tabhi session start kar payenge.
                </p>
                <button
                  type="button"
                  onClick={() => setSemesterModal(null)}
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '10px 16px', fontWeight: '700', borderRadius: '10px', background: '#e2e8f0', color: '#000000', border: 'none', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Step 1: Assigned Semesters Only */}
                <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: '800', color: '#000000', display: 'block', marginBottom: '8px' }}>
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
                          border: selectedSemester === String(s) ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                          background: selectedSemester === String(s) ? 'rgba(124, 58, 237, 0.12)' : '#f8fafc',
                          color: selectedSemester === String(s) ? '#7c3aed' : '#000000'
                        }}
                      >
                        Sem {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Division Selection (Conditional on Selected Semester) */}
                {selectedSemester && (
                  <div style={{ textAlign: 'left', marginBottom: '16px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.88rem', fontWeight: '800', color: '#000000', display: 'block', marginBottom: '8px' }}>
                      2️⃣ Select Division (Sem {selectedSemester}):
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedDivision('ALL')}
                        style={{
                          padding: '7px 14px', borderRadius: '8px', fontWeight: '700',
                          fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s ease',
                          border: selectedDivision === 'ALL' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                          background: selectedDivision === 'ALL' ? 'rgba(124, 58, 237, 0.12)' : '#f8fafc',
                          color: selectedDivision === 'ALL' ? '#7c3aed' : '#000000'
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
                            padding: '7px 16px', borderRadius: '8px', fontWeight: '700',
                            fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s ease',
                            border: selectedDivision === d ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                            background: selectedDivision === d ? 'rgba(124, 58, 237, 0.12)' : '#f8fafc',
                            color: selectedDivision === d ? '#7c3aed' : '#000000'
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
                  <div style={{ textAlign: 'left', marginBottom: '20px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.88rem', fontWeight: '800', color: '#000000', display: 'block', marginBottom: '8px' }}>
                      3️⃣ Select Subject (Sem {selectedSemester}):
                    </label>
                    {availableSubjectsForSem.length > 0 ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {availableSubjectsForSem.map((subObj, subIdx) => {
                          const subName = subObj.subjectName || subObj.name || '';
                          const subLabel = (subObj.shortName && String(subObj.shortName).trim() !== '') 
                            ? String(subObj.shortName).trim() 
                            : subName;
                          const subType = subObj.type || subObj.subjectType || subObj.subject_type || subObj.category || 'Theory';
                          const subCode = subObj.code || subObj.subjectCode || '';

                          const subUniqueKey = subObj.id ? String(subObj.id) : `${subLabel}_${subType}_${subCode}_${subIdx}`;
                          const isSelected = selectedSubjectKey === subUniqueKey || (selectedSubjectKey === '' && selectedSubject === subLabel);

                          return (
                            <button
                              key={subIdx}
                              type="button"
                              title={`${subName} (${subType})`}
                              onClick={() => {
                                setSelectedSubjectKey(subUniqueKey);
                                const fullSubValue = subCode ? `${subLabel} (${subCode})` : `${subLabel} (${subType})`;
                                setSelectedSubject(fullSubValue);
                              }}
                              style={{
                                padding: '8px 14px', borderRadius: '12px', fontWeight: '700',
                                fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s ease',
                                border: isSelected ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                                background: isSelected ? 'rgba(124, 58, 237, 0.12)' : '#f8fafc',
                                color: isSelected ? '#7c3aed' : '#000000',
                                display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start',
                                gap: '4px', textAlign: 'left'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: isSelected ? '#7c3aed' : '#000000' }}>
                                📚 {subLabel}
                              </div>
                              <div style={{
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: isSelected ? '#7c3aed' : '#e2e8f0',
                                color: isSelected ? '#ffffff' : '#334155',
                                letterSpacing: '0.02em'
                              }}>
                                {subType} {subCode ? `(${subCode})` : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        color: '#92400e',
                        fontSize: '0.84rem',
                        lineHeight: '1.4'
                      }}>
                        ⚠️ <strong>No Subject Mapped for Sem {selectedSemester}</strong><br />
                        Admin panel se is semester ke liye subject assign hone ke baad hi attendance session generate ho sakega.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSemesterModal(null)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '10px 16px', fontWeight: '700', borderRadius: '10px', background: '#e2e8f0', color: '#000000', border: 'none', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmSemesterAndGenerate}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      fontWeight: '800',
                      borderRadius: '10px',
                      background: (!selectedSemester || !selectedDivision || availableSubjectsForSem.length === 0 || !selectedSubject) ? '#cbd5e1' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: (!selectedSemester || !selectedDivision || availableSubjectsForSem.length === 0 || !selectedSubject) ? '#64748b' : '#ffffff',
                      border: 'none',
                      cursor: (!selectedSemester || !selectedDivision || availableSubjectsForSem.length === 0 || !selectedSubject) ? 'not-allowed' : 'pointer',
                      boxShadow: (!selectedSemester || !selectedDivision || availableSubjectsForSem.length === 0 || !selectedSubject) ? 'none' : '0 4px 14px rgba(245, 158, 11, 0.35)'
                    }}
                    disabled={!selectedSemester || !selectedDivision || availableSubjectsForSem.length === 0 || !selectedSubject}
                  >
                    Start Session →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

const styles = {
  dashboardContainer: {
    padding: 0,
    maxWidth: '100%',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxHeight: '100vh',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    background: 'var(--bg-primary)'
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderRadius: '0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    width: '100%',
    boxSizing: 'border-box',
    flexShrink: 0,
    backdropFilter: 'blur(12px)',
    background: 'rgba(3, 25, 54, 0.85)'
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
    background: 'rgba(239, 68, 68, 0.12)',
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
    gap: '0',
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflow: 'hidden'
  },
  sidebar: {
    padding: '20px 16px',
    borderRadius: '0',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    flexShrink: 0,
    background: 'rgba(3, 25, 54, 0.65)'
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
    padding: '24px 28px',
    boxSizing: 'border-box'
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
    padding: '12px 16px',
    borderBottom: '2px solid var(--border-light)',
    fontSize: '0.82rem',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    whiteSpace: 'nowrap'
  },
  tableTd: {
    textAlign: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-extra-light)',
    fontSize: '0.88rem',
    color: 'var(--text-primary)',
    lineHeight: '1.4',
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
