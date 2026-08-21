import React, { useState, useEffect, useRef } from 'react';
import { 
  LogOut, User, MapPin, Navigation, History, CheckCircle2, XCircle, RefreshCw, 
  Smartphone, Sun, Moon, QrCode, Camera, ShieldAlert, ZoomIn, ZoomOut, GraduationCap,
  LayoutGrid, BarChart3, Calendar, FileText, Bell, Settings, ShieldCheck, Clock, 
  BookOpen, Menu, X, ChevronRight, Send, Check, AlertCircle, Award, Info, Search, Building2,
  KeyRound, ClipboardList, Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import AttendanceNotification from './AttendanceNotification';
import ToastContainer from './ToastContainer';
import Swal from 'sweetalert2';

export default function StudentDashboard({ user, token, onLogout, theme, toggleTheme }) {
  // Automatically enforce Dark Theme for Student Panel
  useEffect(() => {
    document.body.classList.remove('light-theme');
  }, []);

  const triggerStudentLockout = (reason = 'tab_switch') => {
    const lockUntil = Date.now() + 3 * 60 * 1000;
    localStorage.setItem('student_lockout_until', lockUntil.toString());
    if (user) {
      const idVal = user.email || user.username || user.enrollment_no || user.id || '';
      if (idVal) localStorage.setItem('student_lockout_user_id', String(idVal));
    }

    try {
      const payload = JSON.stringify({
        studentId: user?.id,
        identifier: user?.email || user?.username || user?.enrollment_no,
        durationMs: 3 * 60 * 1000
      });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/auth/student/lockout', blob);
      } else {
        fetch('/api/auth/student/lockout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: payload
        }).catch(() => {});
      }
    } catch (e) {}

    if (onLogout) onLogout();
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerStudentLockout('tab_switch');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, token]);

  const handleLogoutConfirm = () => {
    Swal.fire({
      title: 'Sign Out?',
      text: 'Signing out will lock your student account for 3 minutes before you can sign in again.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Sign Out',
      cancelButtonText: 'Cancel',
      background: '#ffffff',
      color: '#0f172a'
    }).then((result) => {
      if (result.isConfirmed) {
        triggerStudentLockout('logout');
      }
    });
  };

  const [activeTab, setActiveTab] = useState('mark-attendance');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Search & Filters for Analytics view
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('ALL');

  // Leave Application state
  const [leaves, setLeaves] = useState([
    { id: 101, type: 'Medical Leave', from: '2026-08-01', to: '2026-08-03', reason: 'Viral Fever & Doctor prescribed rest', status: 'Approved', dateSubmitted: '2026-07-31' },
    { id: 102, type: 'Duty / Sports Leave', from: '2026-08-14', to: '2026-08-15', reason: 'Inter-College Hackathon Representation', status: 'Pending', dateSubmitted: '2026-08-10' }
  ]);
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [leaveDurationMode, setLeaveDurationMode] = useState('single'); // 'single' | 'multiple'
  const [leaveType, setLeaveType] = useState('Medical Leave');
  const [leaveFrom, setLeaveFrom] = useState(getTodayString());
  const [leaveTo, setLeaveTo] = useState(getTodayString());
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveMsg, setLeaveMsg] = useState(null);
  const [recipientsList, setRecipientsList] = useState([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState('ADMIN');

  // Get or generate device ID for hardware cooldown
  const getDeviceId = () => {
    let devId = localStorage.getItem('attendance_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('attendance_device_id', devId);
    }
    return devId;
  };

  const [location, setLocation] = useState(null);
  const [collegeLoc, setCollegeLoc] = useState(null);
  const [distance, setDistance] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [popMessage, setPopMessage] = useState(null);
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'error', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Dynamic Notices state (loaded from admin defaulters sent notices)
  const [studentNotices, setStudentNotices] = useState([]);

  const loadStudentNotices = () => {
    try {
      const allNotices = JSON.parse(localStorage.getItem('attendance_system_notices') || '[]');
      const filtered = allNotices.filter(n => {
        if (!n) return false;
        if (n.studentEnrollment === 'ALL') return true;
        if (!user) return false;

        const uId = String(user.id || '').toLowerCase();
        const uEnroll = String(user.enrollment_no || '').toLowerCase();
        const uEmail = String(user.email || '').toLowerCase();
        const uName = String(user.name || '').toLowerCase();

        const target = String(n.studentEnrollment || '').toLowerCase();
        const targetName = String(n.studentName || '').toLowerCase();

        return (
          (uEnroll && target === uEnroll) ||
          (uEmail && target === uEmail) ||
          (uId && target === uId) ||
          (uName && targetName === uName)
        );
      });
      setStudentNotices(filtered);
    } catch (err) {
      setStudentNotices([]);
    }
  };

  useEffect(() => {
    loadStudentNotices();
    window.addEventListener('storage', loadStudentNotices);
    window.addEventListener('notices_updated', loadStudentNotices);
    return () => {
      window.removeEventListener('storage', loadStudentNotices);
      window.removeEventListener('notices_updated', loadStudentNotices);
    };
  }, [user]);
  const [attendanceData, setAttendanceData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [subjectBreakdown, setSubjectBreakdown] = useState([]);
  const [weeklyAnalysis, setWeeklyAnalysis] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  // Scanner States
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrCodeRef = useRef(null);

  // Zoom States
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [minZoom, setMinZoom] = useState(1.0);
  const [maxZoom, setMaxZoom] = useState(3.0);
  const videoTrackRef = useRef(null);
  const zoomLevelRef = useRef(1.0);
  const initialPinchDistanceRef = useRef(null);
  const initialZoomRef = useRef(1.0);
  const scannerContainerRef = useRef(null);

  // GPS refresh requirement & Device Cooldown States
  const [isGpsRefreshed, setIsGpsRefreshed] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);

  // Active Session Status State
  const [sessionStatus, setSessionStatus] = useState({
    unlocked: false,
    loading: true,
    type: null,
    message: '',
    semester: null,
    division: null,
    secondsLeft: 0
  });

  // Check device cooldown from localStorage
  useEffect(() => {
    const checkCooldown = () => {
      const until = localStorage.getItem('qr_attendance_cooldown');
      if (until) {
        const diff = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
        if (diff > 0) {
          setCooldownTime(diff);
        } else {
          setCooldownTime(0);
          localStorage.removeItem('qr_attendance_cooldown');
        }
      } else {
        setCooldownTime(0);
      }
    };

    checkCooldown();
    const timer = setInterval(checkCooldown, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCooldown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  // Haversine formula to compute distance in meters on client side for display
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Load college location config
  const fetchCollegeLocation = async () => {
    try {
      const res = await fetch('/api/location', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCollegeLoc(data);
      }
    } catch (err) {
      console.error('Error fetching college location:', err);
    }
  };

  // Load attendance history
  const fetchHistory = async (isBackground = false) => {
    if (!isBackground) setHistoryLoading(true);
    try {
      const res = await fetch('/api/attendance/history/student', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Error fetching attendance history:', err);
    } finally {
      if (!isBackground) setHistoryLoading(false);
    }
  };

  // Load student attendance trend
  const fetchStudentTrend = async () => {
    setTrendLoading(true);
    try {
      const res = await fetch('/api/attendance/student-trend', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data);
      }
    } catch (err) {
      console.error('Error fetching student trend:', err);
    } finally {
      setTrendLoading(false);
    }
  };

  const fetchSessionStatus = async () => {
    try {
      const res = await fetch('/api/attendance/check-session', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessionStatus({ ...data, loading: false });
      }
    } catch (err) {
      console.error('Error checking attendance session:', err);
    }
  };

  const fetchSubjectBreakdown = async () => {
    try {
      const res = await fetch('/api/attendance/subject-breakdown', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.breakdown)) {
          setSubjectBreakdown(data.breakdown);
        }
      }
    } catch (err) {
      console.error('Error fetching subject breakdown:', err);
    }
  };

  const fetchWeeklyAnalysis = async (isBackground = false) => {
    if (!isBackground) setWeeklyLoading(true);
    try {
      const res = await fetch('/api/attendance/weekly-analysis', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWeeklyAnalysis(data);
      }
    } catch (err) {
      console.error('Error fetching weekly analysis:', err);
    } finally {
      if (!isBackground) setWeeklyLoading(false);
    }
  };

  useEffect(() => {
    fetchCollegeLocation();
    fetchHistory();
    fetchStudentTrend();
    fetchSessionStatus();
    fetchSubjectBreakdown();
    fetchWeeklyAnalysis();

    const interval = setInterval(() => {
      fetchSessionStatus();
      fetchSubjectBreakdown();
      fetchWeeklyAnalysis(true);
      fetchHistory(true);
    }, 3000);

    const refreshAll = () => {
      fetchSessionStatus();
      fetchSubjectBreakdown();
      fetchWeeklyAnalysis(true);
      fetchHistory(true);
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
      clearInterval(interval);
      window.removeEventListener('app_data_changed', refreshAll);
      if (bc) bc.close();
    };
  }, []);

  // Pre-fetch & watch GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      return;
    }

    setLocLoading(true);
    setLocError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ latitude: lat, longitude: lon });
        if (collegeLoc) {
          const d = calculateDistance(lat, lon, collegeLoc.latitude, collegeLoc.longitude);
          setDistance(d);
        }
        setLocLoading(false);
      },
      (error) => {
        console.error("GPS init error:", error);
        setLocError('Location permission is required for attendance. Please allow GPS.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ latitude: lat, longitude: lon });
        if (collegeLoc) {
          const d = calculateDistance(lat, lon, collegeLoc.latitude, collegeLoc.longitude);
          setDistance(d);
        }
        setLocError('');
      },
      (error) => {
        console.warn("GPS watch error:", error);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [collegeLoc]);



  // Apply Zoom logic
  const applyZoom = (newZoom) => {
    zoomLevelRef.current = newZoom;
    setZoomLevel(newZoom);
    if (videoTrackRef.current && zoomSupported) {
      videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: newZoom }]
      }).catch(e => console.warn("Native zoom failed:", e));
    } else {
      const videoEl = document.querySelector('#qr-reader-container video');
      if (videoEl) {
        videoEl.style.transform = `scale(${newZoom})`;
        videoEl.style.transformOrigin = 'center center';
        videoEl.style.transition = 'transform 0.1s ease-out';
      }
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevelRef.current + 0.2, maxZoom);
    applyZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevelRef.current - 0.2, minZoom);
    applyZoom(newZoom);
  };

  useEffect(() => {
    const container = scannerContainerRef.current;
    if (!container || !scannerOpen) return;

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistanceRef.current = Math.hypot(dx, dy);
        initialZoomRef.current = zoomLevelRef.current;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && initialPinchDistanceRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / initialPinchDistanceRef.current;
        
        let newZoom = initialZoomRef.current * scale;
        newZoom = Math.min(Math.max(newZoom, minZoom), maxZoom);
        applyZoom(newZoom);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        initialPinchDistanceRef.current = null;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [scannerOpen, minZoom, maxZoom, zoomSupported]);

  // Refresh GPS manually
  const handleGetLocation = () => {
    setIsGpsRefreshed(true);
    if (scannerError.includes("Set GPS")) {
      setScannerError('');
    }
    setLocLoading(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ latitude: lat, longitude: lon });
        if (collegeLoc) {
          const d = calculateDistance(lat, lon, collegeLoc.latitude, collegeLoc.longitude);
          setDistance(d);
        }
        setLocLoading(false);
      },
      (error) => {
        setLocError('Unable to refresh location.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Submit QR-based attendance logic
  const handleQrSubmit = async (qrData) => {
    if (!location) {
      setMessage({ text: 'GPS Location is not ready. Please allow GPS and wait.', type: 'danger' });
      return;
    }

    setSubmitLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: qrData.sessionId,
          tokenIndex: qrData.tokenIndex,
          tokenValue: qrData.tokenValue,
          latitude: location.latitude,
          longitude: location.longitude,
          deviceId: getDeviceId()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit attendance.');
      }

      setMessage({ text: 'Attendance marked successfully!', type: 'success' });
      setPopMessage({
        type: 'success',
        title: 'Attendance Marked Successfully!',
        message: 'Student attendance has been recorded successfully.'
      });

      const unlockTime = Date.now() + 2 * 60 * 1000;
      localStorage.setItem('qr_attendance_cooldown', unlockTime.toString());
      setCooldownTime(120);

      fetchHistory();
      fetchStudentTrend();
      fetchSubjectBreakdown();
      fetchWeeklyAnalysis();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
      setPopMessage({
        type: 'error',
        title: 'Attendance Rejected!',
        message: err.message || 'Failed to submit attendance.'
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Scanner Controls
  const startScanner = () => {
    if (!sessionStatus.unlocked) {
      const msg = sessionStatus.message || `Attendance session is locked. Faculty has not started a Live QR session for Semester ${user.semester}${user.division ? ' - Div ' + user.division : ''} yet.`;
      setScannerError(msg);
      showToast(msg, 'error');
      return;
    }

    if (cooldownTime > 0) {
      const msg = `Attendance submitted! Scan button is blocked for ${formatCooldown(cooldownTime)} on this device.`;
      setScannerError(msg);
      showToast(msg, 'warning');
      return;
    }

    if (!isGpsRefreshed) {
      const msg = "Set GPS! Please click on the 'Refresh GPS' button first before scanning QR.";
      setScannerError(msg);
      showToast(msg, 'error');
      return;
    }

    setScannerError('');
    setScannerOpen(true);

    setTimeout(() => {
      const container = document.getElementById('qr-reader-container');
      if (!container) return;

      const html5QrCode = new Html5Qrcode('qr-reader-container');
      html5QrCodeRef.current = html5QrCode;

      const scanConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      };

      const handleScanSuccess = async (decodedText) => {
        try {
          let qrData;
          if (decodedText.startsWith('{')) {
            qrData = JSON.parse(decodedText);
          } else {
            const parts = decodedText.split(',');
            qrData = {
              sessionId: parseInt(parts[0], 10),
              tokenIndex: parseInt(parts[1], 10),
              tokenValue: parts[2]
            };
          }

          if (qrData.sessionId && qrData.tokenIndex !== undefined && qrData.tokenValue) {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
              await html5QrCodeRef.current.stop();
            }
            html5QrCodeRef.current = null;
            setScannerOpen(false);
            handleQrSubmit(qrData);
          } else {
            setScannerError('Invalid QR Code format scanned.');
          }
        } catch (e) {
          setScannerError('Could not parse scanned QR Code.');
        }
      };

      const setupZoomTrack = () => {
        setTimeout(() => {
          const videoEl = document.querySelector('#qr-reader-container video');
          if (videoEl && videoEl.srcObject) {
            const track = videoEl.srcObject.getVideoTracks()[0];
            if (track) {
              videoTrackRef.current = track;
              const capabilities = track.getCapabilities ? track.getCapabilities() : {};
              if (capabilities.zoom) {
                setZoomSupported(true);
                setMinZoom(capabilities.zoom.min || 1.0);
                setMaxZoom(capabilities.zoom.max || 3.0);
                applyZoom(capabilities.zoom.min || 1.0);
              } else {
                setZoomSupported(false);
                setMinZoom(1.0);
                setMaxZoom(3.0);
                applyZoom(1.0);
              }
            }
          }
        }, 800);
      };

      html5QrCode.start(
        { facingMode: 'environment' },
        scanConfig,
        handleScanSuccess,
        () => {}
      ).then(() => {
        setupZoomTrack();
      }).catch(err => {
        return html5QrCode.start(
          { facingMode: 'user' },
          scanConfig,
          handleScanSuccess,
          () => {}
        ).then(() => {
          setupZoomTrack();
        });
      }).catch(err2 => {
        setScannerError('Camera access failed. Please ensure camera permissions are allowed.');
      });
    }, 300);
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    html5QrCodeRef.current = null;
    videoTrackRef.current = null;
    setScannerOpen(false);
  };

  // Auto-close scanner if session becomes locked while scanning is open
  useEffect(() => {
    if (!sessionStatus.loading && !sessionStatus.unlocked && scannerOpen) {
      stopScanner();
      setScannerError('Session Locked: Faculty has locked or ended the attendance session.');
    }
  }, [sessionStatus.unlocked, sessionStatus.loading, scannerOpen]);

  // Fetch Student's Leave Applications & Recipients list from backend
  const fetchLeaves = async () => {
    try {
      const res = await fetch('/api/leaves/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLeaves(data);
      }
    } catch (err) {
      console.error('Error fetching student leaves:', err);
    }
  };

  const fetchRecipients = async () => {
    try {
      const res = await fetch('/api/leaves/recipients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecipientsList(data);
      }
    } catch (err) {
      console.error('Error fetching recipients:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLeaves();
      fetchRecipients();
    }
  }, [token]);

  // Submit Leave Form to Backend
  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    const todayStr = getTodayString();
    const finalFrom = leaveFrom || todayStr;
    const finalTo = leaveDurationMode === 'single' ? finalFrom : (leaveTo || finalFrom);

    if (!finalFrom || !finalTo || !leaveReason) {
      setLeaveMsg({ text: 'Please fill out all leave fields.', type: 'danger' });
      return;
    }

    if (finalFrom < todayStr) {
      setLeaveMsg({ text: 'Past dates cannot be selected for leave application.', type: 'danger' });
      return;
    }

    if (finalTo < finalFrom) {
      setLeaveMsg({ text: 'To Date cannot be earlier than From Date.', type: 'danger' });
      return;
    }

    const matchedRecipient = recipientsList.find(r => String(r.id) === String(selectedRecipientId));
    const recipientName = matchedRecipient ? matchedRecipient.name : 'All Admin & Faculty';

    try {
      const res = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: leaveType,
          recipient_id: selectedRecipientId,
          recipient_name: recipientName,
          from: finalFrom,
          to: finalTo,
          reason: leaveReason
        })
      });

      const data = await res.json();

      if (res.ok) {
        setLeaveFrom(getTodayString());
        setLeaveTo(getTodayString());
        setLeaveReason('');
        setLeaveMsg({ text: 'Leave application submitted successfully for review!', type: 'success' });
        fetchLeaves();
        setTimeout(() => setLeaveMsg(null), 4000);
      } else {
        setLeaveMsg({ text: data.error || 'Failed to submit leave application.', type: 'danger' });
      }
    } catch (err) {
      console.error('Error submitting leave application:', err);
      setLeaveMsg({ text: 'Network error while submitting leave application.', type: 'danger' });
    }
  };

  // Render Weekly Analysis Card
  const renderWeeklyAnalysisCard = () => {
    if (weeklyLoading) {
      return (
        <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
          Loading Weekly Analysis Data...
        </div>
      );
    }

    if (!weeklyAnalysis) return null;

    const {
      semester,
      division,
      weekRange,
      totalSessions,
      attendedSessions,
      absentSessions,
      percentage,
      days
    } = weeklyAnalysis;

    const pctBg = percentage >= 75 
      ? 'rgba(34, 197, 94, 0.08)' 
      : percentage >= 50 
      ? 'rgba(245, 158, 11, 0.08)' 
      : 'rgba(239, 68, 68, 0.08)';

    const pctBorder = percentage >= 75 
      ? '1px solid rgba(34, 197, 94, 0.25)' 
      : percentage >= 50 
      ? '1px solid rgba(245, 158, 11, 0.25)' 
      : '1px solid rgba(239, 68, 68, 0.25)';

    const pctTextColor = percentage >= 75 
      ? '#4ade80' 
      : percentage >= 50 
      ? '#fbbf24' 
      : '#f87171';

    return (
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={22} color="#f59e0b" />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Weekly Attendance Analysis
              </h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 32px' }}>
              Weekly Session Tracker • <strong style={{ color: '#fbbf24' }}>{weekRange}</strong>
            </p>
          </div>
        </div>

        {/* 4 Core Metric Cards (Glass Style) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {/* Total Sessions Conducted */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Total Sessions Started
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalSessions}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lectures</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {totalSessions === 0 ? 'No sessions this week yet' : 'Conducted by Faculty'}
            </span>
          </div>

          {/* Attended (Present) */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Sessions Attended
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80' }}>{attendedSessions}</span>
              <span style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 600 }}>Present</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>
              Verified Attendance
            </span>
          </div>

          {/* Absent / Missed */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Sessions Missed
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f87171' }}>{absentSessions}</span>
              <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 600 }}>Absent</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#f87171' }}>
              Unattended lectures
            </span>
          </div>

          {/* Weekly Attendance Rate */}
          <div style={{ padding: '16px', borderRadius: '12px', background: pctBg, border: pctBorder, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: pctTextColor, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Weekly Percentage
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: pctTextColor }}>{percentage}%</span>
              <span style={{ fontSize: '0.78rem', color: pctTextColor, fontWeight: 600 }}>
                {percentage >= 75 ? 'Eligible' : percentage >= 50 ? 'Average' : 'Low'}
              </span>
            </div>
            {/* Progress Bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: pctTextColor, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        </div>

        {/* Day by Day Pill Breakdown */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={15} color="#f59e0b" />
            Day-Wise Session Breakdown (Mon - Sun)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
            {(days || []).map((d, i) => {
              const dayTotal = d.total;
              const dayAttended = d.attended;

              let dayBg = 'rgba(255,255,255,0.04)';
              let dayBorder = 'rgba(255,255,255,0.08)';
              let statusText = 'No Class';
              let statusColor = 'var(--text-muted)';

              if (dayTotal > 0) {
                if (dayAttended === dayTotal) {
                  statusText = `${dayAttended}/${dayTotal} Present`;
                  statusColor = '#4ade80';
                  dayBg = 'rgba(34, 197, 94, 0.06)';
                  dayBorder = 'rgba(34, 197, 94, 0.2)';
                } else if (dayAttended > 0) {
                  statusText = `${dayAttended}/${dayTotal} Attended`;
                  statusColor = '#fbbf24';
                  dayBg = 'rgba(245, 158, 11, 0.06)';
                  dayBorder = 'rgba(245, 158, 11, 0.2)';
                } else {
                  statusText = `0/${dayTotal} Missed`;
                  statusColor = '#f87171';
                  dayBg = 'rgba(239, 68, 68, 0.06)';
                  dayBorder = 'rgba(239, 68, 68, 0.2)';
                }
              }

              return (
                <div key={i} style={{ background: dayBg, border: `1px solid ${dayBorder}`, borderRadius: '10px', padding: '10px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {d.dayName}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    {d.date ? d.date.split('-').slice(1).join('/') : ''}
                  </span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 600, color: statusColor, marginTop: '2px' }}>
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render Subject-Wise Attendance Breakdown Card
  const renderSubjectBreakdownCard = () => (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BookOpen size={18} color="#f59e0b" />
        Subject-Wise Attendance Breakdown (Sem {user.semester})
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {subjectBreakdown.map((sub, i) => {
          const displayShortName = sub.shortName || sub.shortCode || sub.short || (sub.name && sub.name.length <= 16 ? sub.name : sub.name.split(' ').map(w => w[0]).join('').toUpperCase());
          const displayCode = (sub.code && sub.code !== sub.name && sub.code !== displayShortName) ? sub.code : (sub.subjectCode || sub.subject_code || `BCA-${user.semester || 1}0${i + 1}`);
          return (
            <div key={i} style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)', display: 'block', fontWeight: '800' }}>
                    {displayShortName}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px', fontWeight: '500' }}>
                    {displayCode}
                  </span>
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: sub.pct >= 75 ? '#4ade80' : sub.pct >= 50 ? '#fbbf24' : '#f87171' }}>
                  {sub.pct}%
                </span>
              </div>

              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${sub.pct}%`, height: '100%', background: sub.pct >= 75 ? '#4ade80' : sub.pct >= 50 ? '#fbbf24' : '#f87171', borderRadius: '4px', transition: 'width 0.5s ease' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span>Attended: <strong>{sub.attended}</strong> / <strong>{sub.total}</strong> Lectures</span>
                <span style={{ color: sub.pct >= 75 ? '#4ade80' : sub.pct >= 50 ? '#fbbf24' : '#f87171', fontWeight: '600' }}>{sub.pct >= 75 ? 'Eligible' : sub.pct >= 50 ? 'Average' : 'Shortage'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render Gauge & Trend Graphs
  const renderRadialGauge = () => {
    const pct = attendanceData ? attendanceData.currentAttendance : 100.0;
    const radius = 40;
    const stroke = 8;
    const normRadius = radius - stroke * 2;
    const circumference = normRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (pct / 100) * circumference;

    return (
      <div className="student-radial-gauge" style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: '0', width: '100%', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', flexWrap: 'wrap', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', width: '90px', height: '90px' }}>
          <svg height="90" width="90" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              stroke="rgba(255, 255, 255, 0.05)"
              fill="transparent"
              strokeWidth={stroke}
              r={normRadius}
              cx="45"
              cy="45"
            />
            <circle
              stroke="#ffb703"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease' }}
              r={normRadius}
              cx="45"
              cy="45"
              strokeLinecap="round"
            />
          </svg>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '90px',
            height: '90px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: '700',
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)'
          }}>
            {pct}%
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Overall Attendance</span>
          <strong style={{ fontSize: '1.1rem', color: pct >= 75 ? '#34d399' : '#f87171' }}>
            {pct >= 75 ? 'Good Standing (Eligible)' : 'Low Attendance (<75%)'}
          </strong>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Semester {user.semester} {user.division ? `(Div ${user.division})` : ''}
          </span>
        </div>
      </div>
    );
  };

  const renderTrendGraph = () => {
    if (!attendanceData || !attendanceData.trend || attendanceData.trend.length === 0) {
      return <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No trend data available yet.</div>;
    }

    const points = attendanceData.trend;
    const width = 380;
    const height = 130;
    const paddingLeft = 20;
    const paddingRight = 20;
    const paddingTop = 22;
    const paddingBottom = 22;

    const availableWidth = width - paddingLeft - paddingRight;
    const availableHeight = height - paddingTop - paddingBottom;
    const N = points.length;

    // Calculate bar width & gap dynamically
    const rawBarWidth = availableWidth / N;
    const barGap = Math.max(3, Math.min(6, rawBarWidth * 0.2));
    const barWidth = Math.max(6, Math.min(22, (availableWidth - (N - 1) * barGap) / N));
    const totalGroupWidth = N * barWidth + (N - 1) * barGap;
    const startX = paddingLeft + (availableWidth - totalGroupWidth) / 2;

    return (
      <div className="student-trend-graph" style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '0', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
          <span>Attendance Trend (Bar Chart)</span>
          <span>Lectures →</span>
        </div>
        <div style={{ position: 'relative', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', borderRadius: '12px', padding: '12px' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="barGradGood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.75" />
              </linearGradient>
              <linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="#e2e8f0" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={paddingTop + availableHeight / 2} x2={width - paddingRight} y2={paddingTop + availableHeight / 2} stroke="#f1f5f9" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#cbd5e1" strokeWidth="1.5" />

            {/* Bars */}
            {points.map((p, idx) => {
              const barHeight = Math.max(4, (p.percentage / 100) * availableHeight);
              const x = startX + idx * (barWidth + barGap);
              const y = height - paddingBottom - barHeight;
              const isEligible = p.percentage >= 75;

              return (
                <g key={idx}>
                  {/* Column Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(4, barWidth / 2)}
                    fill={isEligible ? "url(#barGradGood)" : "url(#barGradLow)"}
                  >
                    <title>{`${p.label || `Lecture ${idx+1}`}: ${p.percentage}%`}</title>
                  </rect>

                  {/* Top percentage text for last item or max/highlighted bars */}
                  {(idx === N - 1 || N <= 12) && (
                    <text
                      x={x + barWidth / 2}
                      y={Math.max(10, y - 4)}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize={N > 15 ? "7.5" : "9"}
                      fontWeight="bold"
                    >
                      {p.percentage}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  // Reusable QR Scanner & GPS Component Block
  const renderScannerAndGpsBlock = () => (
    <div className="glass-panel" style={{ padding: '24px', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <QrCode size={20} color="#ffb703" />
        Submit Live QR Attendance
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {message.text && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: message.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            color: message.type === 'success' ? '#34d399' : '#f87171'
          }}>
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Live Session lock banner */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Camera QR Scanner</label>
            {sessionStatus.unlocked ? (
              <span style={{ color: '#34d399', fontSize: '0.78rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                🔓 Session Active (Sem {sessionStatus.semester}{sessionStatus.division ? ` - Div ${sessionStatus.division}` : ''})
              </span>
            ) : (
              <span style={{ color: '#f87171', fontSize: '0.78rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                🔒 Session Locked
              </span>
            )}
          </div>



          {sessionStatus.unlocked && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              color: '#34d399',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
              <span>
                <strong>Session Active!</strong> Live session started by {sessionStatus.facultyName || 'Faculty'} for Sem {sessionStatus.semester} {sessionStatus.division ? `(Div ${sessionStatus.division})` : ''}.
              </span>
            </div>
          )}

          {scannerOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: '100%' }}>
              <div 
                ref={scannerContainerRef}
                style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div id="qr-reader-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', background: '#000' }} />
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <button type="button" onClick={handleZoomOut} disabled={zoomLevel <= minZoom} style={{ background: 'transparent', border: 'none', color: zoomLevel <= minZoom ? 'var(--text-muted)' : 'var(--primary)', cursor: zoomLevel <= minZoom ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ZoomOut size={24} />
                  </button>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {zoomLevel.toFixed(1)}x {zoomSupported ? '(Native)' : '(Digital)'}
                  </span>
                  <button type="button" onClick={handleZoomIn} disabled={zoomLevel >= maxZoom} style={{ background: 'transparent', border: 'none', color: zoomLevel >= maxZoom ? 'var(--text-muted)' : 'var(--primary)', cursor: zoomLevel >= maxZoom ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ZoomIn size={24} />
                  </button>
                </div>
              </div>

              <button className="btn btn-secondary" onClick={stopScanner} style={{ width: '100%', maxWidth: '320px' }}>
                Cancel Scan
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={startScanner}
              disabled={submitLoading || !location || !sessionStatus.unlocked || sessionStatus.alreadySubmitted}
              style={{ 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px', 
                padding: '14px',
                opacity: (submitLoading || !location || !sessionStatus.unlocked || sessionStatus.alreadySubmitted) ? 0.7 : 1,
                cursor: (!sessionStatus.unlocked || sessionStatus.alreadySubmitted) ? 'not-allowed' : 'pointer',
                background: sessionStatus.alreadySubmitted 
                  ? 'rgba(34, 197, 94, 0.15)' 
                  : !sessionStatus.unlocked 
                  ? 'rgba(239, 68, 68, 0.15)' 
                  : undefined,
                border: sessionStatus.alreadySubmitted 
                  ? '1px solid rgba(34, 197, 94, 0.4)' 
                  : !sessionStatus.unlocked 
                  ? '1px solid rgba(239, 68, 68, 0.3)' 
                  : undefined,
                color: sessionStatus.alreadySubmitted 
                  ? '#34d399' 
                  : !sessionStatus.unlocked 
                  ? '#f87171' 
                  : undefined
              }}
            >
              {sessionStatus.alreadySubmitted ? (
                <CheckCircle2 size={18} color="#34d399" />
              ) : !sessionStatus.unlocked ? (
                <ShieldAlert size={18} />
              ) : (
                <Camera size={18} />
              )}
              {sessionStatus.alreadySubmitted
                ? 'Attendance Marked Successfully ✓ (Locked)'
                : !sessionStatus.unlocked
                ? 'Scan Attendance QR (Locked - Waiting for Faculty)'
                : submitLoading 
                ? 'Processing Scan...' 
                : !isGpsRefreshed 
                ? 'Scan Attendance QR (Click Refresh GPS first)' 
                : 'Scan Attendance QR'}
            </button>
          )}

          {scannerError && (
            <div className="status-badge failed" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.88rem', width: '100%', marginTop: '8px', textAlign: 'center', boxSizing: 'border-box' }}>
              {scannerError}
            </div>
          )}
        </div>

        {/* GPS Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
              GPS Location Verification
              {isGpsRefreshed && <span style={{ color: '#34d399', fontSize: '0.75rem', marginLeft: '8px' }}>✓ Ready</span>}
            </label>
            <button
              type="button"
              className="btn btn-secondary gps-refresh-btn"
              onClick={handleGetLocation}
              disabled={locLoading}
              style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px', border: !isGpsRefreshed ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.1)' }}
            >
              <RefreshCw size={12} className={locLoading ? 'spin-slow' : ''} />
              {locLoading ? 'Refreshing...' : 'Refresh GPS'}
            </button>
          </div>

          {locError && <div style={{ fontSize: '0.85rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px 12px', borderRadius: '6px' }}>{locError}</div>}

          {location && distance !== null && (
            <div style={{ marginTop: '4px' }}>
              <div style={{
                background: distance <= (collegeLoc?.radius || 200.0) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: distance <= (collegeLoc?.radius || 200.0) ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distance to College Campus</span>
                <strong style={{
                  color: distance <= (collegeLoc?.radius || 200.0) ? '#34d399' : '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.88rem'
                }}>
                  <Navigation size={14} />
                  <span>{distance.toFixed(1)} meters ({distance <= (collegeLoc?.radius || 200.0) ? 'Within Campus' : 'Out of Campus Range'})</span>
                </strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const handleExportStudentReportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(245, 158, 11);
      doc.text('College Student Attendance Report', 14, 20);

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Student Name: ${user.name}`, 14, 28);
      doc.text(`Enrollment No: ${user.enrollment_no}`, 14, 34);
      doc.text(`Course & Semester: ${user.course} - Semester ${user.semester}`, 14, 40);
      const overallPct = weeklyAnalysis?.percentage || (attendanceData ? attendanceData.currentAttendance : 0);
      doc.text(`Overall Attendance: ${overallPct}%`, 14, 46);
      doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 52);

      const tableColumn = ['#', 'Date', 'Time', 'Subject', 'Faculty', 'Status'];
      const tableRows = [];

      (history || []).forEach((log, idx) => {
        const isPresent = log.status === 'Present' || log.status === 'Success';
        tableRows.push([
          idx + 1,
          log.date || '-',
          log.time || '-',
          log.subject || log.subject_name || 'Class Lecture',
          log.faculty_name || 'Faculty',
          isPresent ? 'PRESENT' : 'ABSENT'
        ]);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 58,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11] },
        styles: { fontSize: 8 }
      });

      doc.save(`Attendance_Report_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
    }
  };

  const handleExportStudentReportExcel = () => {
    try {
      const cleanData = (history || []).map((log, idx) => {
        const isPresent = log.status === 'Present' || log.status === 'Success';
        return {
          'S.No': idx + 1,
          'Date': log.date || '-',
          'Time': log.time || '-',
          'Subject': log.subject || log.subject_name || 'Class Lecture',
          'Faculty': log.faculty_name || 'Faculty',
          'Semester': log.semester || user.semester,
          'Status': isPresent ? 'PRESENT' : 'ABSENT'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(cleanData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
      XLSX.writeFile(workbook, `Attendance_Report_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Error exporting Excel:', err);
    }
  };

  return (
    <div className="admin-layout">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="admin-sidebar-overlay"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 99
          }}
        />
      )}

      {/* Left Sidebar (Photo 2 EduMark Design matching Admin & Faculty Panels) */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Brand Logo Box */}
        <div className="admin-sidebar-brand">
          <div className="admin-logo-box">
            <GraduationCap size={24} color="#0f172a" strokeWidth={2.5} />
          </div>
          <div className="admin-brand-text">
            <span className="admin-brand-title">EduMark</span>
            <span className="admin-brand-subtitle">Student Portal</span>
          </div>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="admin-sidebar-nav">
          <button 
            className={`admin-nav-item ${activeTab === 'mark-attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('mark-attendance'); setMobileMenuOpen(false); }}
          >
            <QrCode size={19} />
            <span>Mark Attendance</span>
            {sessionStatus.unlocked && (
              <span className="status-badge success" style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '1px 6px', background: '#22c55e', color: '#0f172a', fontWeight: '800' }}>
                LIVE
              </span>
            )}
          </button>

          <button 
            className={`admin-nav-item ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => { setActiveTab('report'); setMobileMenuOpen(false); }}
          >
            <BarChart3 size={19} />
            <span>Report</span>
          </button>

          <button 
            className={`admin-nav-item ${activeTab === 'leave' ? 'active' : ''}`}
            onClick={() => { setActiveTab('leave'); setMobileMenuOpen(false); }}
          >
            <FileText size={19} />
            <span>Leave Request</span>
          </button>

          <button 
            className={`admin-nav-item ${activeTab === 'notices' ? 'active' : ''}`}
            onClick={() => { setActiveTab('notices'); setMobileMenuOpen(false); }}
          >
            <Bell size={19} />
            <span>Notice Board</span>
          </button>



          <button 
            className={`admin-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}
          >
            <User size={19} />
            <span>My Profile</span>
          </button>


        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer">
          <div className="admin-user-profile-card">
            <div className="admin-user-avatar">
              <GraduationCap size={20} color="#0f172a" />
            </div>
            <div className="admin-user-details">
              <span className="admin-user-profile-name">{user.name}</span>
              <span className="admin-user-profile-email">ID: {user.enrollment_no}</span>
            </div>
          </div>

          <button className="admin-logout-btn" onClick={handleLogoutConfirm}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Right Workspace Wrapper */}
      <div className="admin-main-wrapper content-light">
        {/* Top Header Banner Card */}
        <header className="admin-top-header-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="admin-banner-content">
            <div className="admin-header-title-row">
              <button 
                className="admin-mobile-toggle-btn"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                title="Toggle Menu"
              >
                <Menu size={22} />
              </button>
              <h1 className="admin-banner-title">
                {activeTab === 'mark-attendance' ? 'Mark Attendance' :
                 activeTab === 'analytics' ? 'Attendance Analytics & Logs' :
                 activeTab === 'report' ? 'Attendance Report' :
                 activeTab === 'leave' ? 'Leave Applications' :
                 activeTab === 'notices' ? 'Notice Board & Announcements' :
                 activeTab === 'profile' ? 'My Student Profile' :
                 activeTab === 'settings' ? 'Account & Security Settings' : 'Student Portal'}
              </h1>
            </div>
            <p className="admin-banner-subtitle">
              Welcome back, <strong className="admin-banner-username">{user.name}</strong> 👋
            </p>
          </div>


        </header>

        {/* Scrollable Main Content Space */}
        <main className="admin-main-content">
          
          {/* TAB 1: MARK ATTENDANCE */}
          {activeTab === 'mark-attendance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {renderScannerAndGpsBlock()}
            </div>
          )}

          {/* TAB 3: ATTENDANCE RECORDS & ANALYTICS */}
          {activeTab === 'analytics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {renderWeeklyAnalysisCard()}
              {renderSubjectBreakdownCard()}

              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '600', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <History size={18} color="#d97706" />
                    Complete Attendance Log History
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', color: '#475569' }} />
                      <input 
                        type="text"
                        placeholder="Search date or OTP..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        style={{ padding: '6px 10px 6px 30px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                      {['ALL', 'PRESENT', 'ABSENT'].map(f => (
                        <button
                          key={f}
                          className={`btn ${historyFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setHistoryFilter(f)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="custom-table-container">
                  {historyLoading ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>Loading history records...</div>
                  ) : history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No records found.</div>
                  ) : (
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Session / OTP</th>
                          <th>Distance</th>
                          <th>Verification</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history
                          .filter(row => {
                            if (historyFilter === 'PRESENT' && row.status !== 'Success') return false;
                            if (historyFilter === 'ABSENT' && row.status === 'Success') return false;
                            if (historySearch) {
                              const q = historySearch.toLowerCase();
                              return (row.date && row.date.toLowerCase().includes(q)) || (row.otp && row.otp.toLowerCase().includes(q));
                            }
                            return true;
                          })
                          .map((row) => (
                            <tr key={row.id}>
                              <td>{row.date}</td>
                              <td>{row.time}</td>
                              <td>
                                {row.qr_session_id ? (
                                  <span className="status-badge success" style={{ background: 'rgba(255, 183, 3, 0.15)', color: '#ffb703', border: '1px solid rgba(255, 183, 3, 0.3)' }}>
                                    Live QR #{row.qr_session_id}
                                  </span>
                                ) : (
                                  <code>{row.otp || 'OTP'}</code>
                                )}
                              </td>
                              <td>{row.distance}m</td>
                              <td>
                                <span style={{ fontSize: '0.78rem', color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <ShieldCheck size={14} /> GPS Verified
                                </span>
                              </td>
                              <td>
                                <span className={`status-badge ${row.status === 'Success' ? 'present' : 'failed'}`}>
                                  {row.status === 'Success' ? 'Present' : 'Rejected'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3.5: ATTENDANCE REPORT & EXPORT */}
          {activeTab === 'report' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>


              {renderWeeklyAnalysisCard()}
              {renderSubjectBreakdownCard()}

              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Logs / Report Detail Table */}
                <div className="custom-table-container" style={{ marginTop: '10px' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        <th>DATE</th>
                        <th>SUBJECT</th>
                        <th>FACULTY</th>
                        <th style={{ textAlign: 'center' }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            No attendance records available for report.
                          </td>
                        </tr>
                      ) : (
                        history.map((log, idx) => {
                          const isPresent = log.status === 'Present' || log.status === 'Success';
                          return (
                            <tr key={log.id || idx}>
                              <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--text-muted)' }}>{idx + 1}</td>
                              <td style={{ fontWeight: '700' }}>{log.date}</td>
                              <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{log.subject || log.subject_name || log.subjectName || 'C Language'}</td>
                              <td style={{ fontWeight: '600' }}>{log.faculty_name || log.facultyName || log.faculty || 'Faculty'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '800',
                                  background: isPresent ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                  color: isPresent ? '#4ade80' : '#f87171',
                                  border: `1px solid ${isPresent ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                                }}>
                                  {isPresent ? 'PRESENT' : 'ABSENT'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEAVE APPLICATION */}

          {/* TAB 5: LEAVE APPLICATION */}
          {activeTab === 'leave' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={22} color="#ffb703" />
                  Submit Absence / Leave Application
                </h2>

                {leaveMsg && (
                  <div style={{ padding: '12px', borderRadius: '8px', fontSize: '0.88rem', background: leaveMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: leaveMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', color: leaveMsg.type === 'success' ? '#34d399' : '#f87171' }}>
                    {leaveMsg.text}
                  </div>
                )}

                <form onSubmit={handleLeaveSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  {/* Leave Duration Mode Selector */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600' }}>Leave Duration Mode:</label>
                    <div style={{ display: 'inline-flex', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setLeaveDurationMode('single');
                          const t = leaveFrom || getTodayString();
                          setLeaveFrom(t);
                          setLeaveTo(t);
                        }}
                        style={{
                          padding: '6px 14px', borderRadius: '8px', border: 'none',
                          fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer',
                          background: leaveDurationMode === 'single' ? '#3b82f6' : 'transparent',
                          color: leaveDurationMode === 'single' ? '#fff' : '#94a3b8',
                          transition: 'all 0.2s'
                        }}
                      >
                        📅 Single Day Leave
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLeaveDurationMode('multiple');
                          if (!leaveFrom) setLeaveFrom(getTodayString());
                          if (!leaveTo) setLeaveTo(leaveFrom || getTodayString());
                        }}
                        style={{
                          padding: '6px 14px', borderRadius: '8px', border: 'none',
                          fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer',
                          background: leaveDurationMode === 'multiple' ? '#3b82f6' : 'transparent',
                          color: leaveDurationMode === 'multiple' ? '#fff' : '#94a3b8',
                          transition: 'all 0.2s'
                        }}
                      >
                        🗓️ Multiple Days (Range)
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Leave Type</label>
                    <select
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value)}
                      style={{ 
                        width: '100%', 
                        maxWidth: '100%', 
                        boxSizing: 'border-box', 
                        padding: '10px 12px', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        background: 'rgba(255,255,255,0.05)', 
                        color: '#fff',
                        fontSize: '0.88rem'
                      }}
                    >
                      <option value="Medical Leave" style={{ background: '#0b1329' }}>Medical Leave</option>
                      <option value="Duty / Sports Leave" style={{ background: '#0b1329' }}>Duty / Sports</option>
                      <option value="Personal Leave" style={{ background: '#0b1329' }}>Personal Leave</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Send Application To (Faculty / Admin)</label>
                    <select
                      value={selectedRecipientId}
                      onChange={(e) => setSelectedRecipientId(e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    >
                      {recipientsList.map((r) => {
                        let cleanName = String(r.name || '').trim();
                        if (cleanName.includes('(')) cleanName = cleanName.split('(')[0].trim();
                        if (cleanName.includes('||')) cleanName = cleanName.split('||')[0].trim();

                        return (
                          <option key={r.id} value={r.id} style={{ background: '#0b1329' }}>
                            {cleanName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {leaveDurationMode === 'single' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Leave Date (Single Day)</label>
                      <input
                        type="date"
                        min={getTodayString()}
                        value={leaveFrom || getTodayString()}
                        onChange={(e) => {
                          setLeaveFrom(e.target.value);
                          setLeaveTo(e.target.value);
                        }}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>From Date</label>
                        <input
                          type="date"
                          min={getTodayString()}
                          value={leaveFrom || getTodayString()}
                          onChange={(e) => {
                            setLeaveFrom(e.target.value);
                            if (leaveTo && e.target.value > leaveTo) {
                              setLeaveTo(e.target.value);
                            }
                          }}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>To Date</label>
                        <input
                          type="date"
                          min={leaveFrom || getTodayString()}
                          value={leaveTo || leaveFrom || getTodayString()}
                          onChange={(e) => setLeaveTo(e.target.value)}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                        />
                      </div>
                    </>
                  )}

                  <div style={{ gridColumn: isMobile ? '1 / -1' : (leaveDurationMode === 'multiple' ? '1 / span 3' : '1 / span 2'), display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Reason / Remarks</label>
                    <textarea
                      rows={2}
                      placeholder="Specify detailed reason for absence..."
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ gridColumn: isMobile ? '1 / -1' : 'span 1', display: 'flex', alignItems: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '12px 20px', width: '100%', gap: '8px', display: 'flex', justifyContent: 'center', fontWeight: '600' }}>
                      <Send size={16} /> Submit Leave Application
                    </button>
                  </div>
                </form>
              </div>

              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} color="#ffb703" />
                  My Leave Applications Status
                </h3>

                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Leave Type</th>
                        <th>Sent To</th>
                        <th>Dates</th>
                        <th>Reason</th>
                        <th>Submitted On</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                            No leave applications submitted yet.
                          </td>
                        </tr>
                      ) : (
                        leaves.map((l) => (
                          <tr key={l.id}>
                            <td><strong>{l.type}</strong></td>
                            <td><span style={{ fontSize: '0.82rem', color: '#60a5fa', fontWeight: '600' }}>{l.recipient_name || 'All Admin & Faculty'}</span></td>
                            <td>{l.from_date || l.from} to {l.to_date || l.to}</td>
                            <td>{l.reason}</td>
                            <td>{l.date_submitted || l.dateSubmitted}</td>
                            <td>
                              <span className={`status-badge ${l.status === 'Approved' ? 'success' : l.status === 'Pending' ? 'warning' : 'failed'}`}>
                                {l.status === 'Approved' ? '🟢 Approved' : l.status === 'Pending' ? '🟡 Pending Review' : '🔴 Rejected'}
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

          {/* TAB 6: NOTICES & ANNOUNCEMENTS */}
          {activeTab === 'notices' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bell size={22} color="#ffb703" />
                    Notice Board & Campus Announcements
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {studentNotices.length > 0 ? `${studentNotices.length} Notice(s)` : 'Live Feed'}
                  </span>
                </div>

                {studentNotices.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <Bell size={48} color="#94a3b8" style={{ opacity: 0.3 }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                      No Notices Received Yet
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, maxWidth: '420px', lineHeight: '1.4' }}>
                      You have not received any attendance warning or defaulter notices from the administration yet.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {studentNotices.map((notice) => {
                      const isCritical = notice.tagColor === '#ef4444' || notice.category === 'DEFAULTER NOTICE';
                      return (
                        <div key={notice.id} style={{
                          background: '#ffffff',
                          border: `1.5px solid ${isCritical ? '#fca5a5' : '#fde68a'}`,
                          borderRadius: '14px',
                          padding: '18px 20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.74rem',
                              fontWeight: '800',
                              color: isCritical ? '#dc2626' : '#d97706',
                              background: isCritical ? '#fee2e2' : '#fef3c7',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${isCritical ? '#fca5a5' : '#fcd34d'}`
                            }}>
                              {notice.category || 'ATTENDANCE WARNING'}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>{notice.date}</span>
                          </div>
                          <h4 style={{ fontSize: '1.02rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldAlert size={18} color={isCritical ? '#dc2626' : '#d97706'} />
                            {notice.title}
                          </h4>
                          <p style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: '600', margin: 0, lineHeight: '1.55' }}>
                            {notice.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: MY PROFILE */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '28px', borderRadius: '18px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
                  <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)' }}>
                    <User size={44} color="#ffffff" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '0.01em' }}>{user.name}</h2>
                    <span style={{ fontSize: '0.92rem', color: '#d97706', fontWeight: '700', display: 'inline-block', marginTop: '3px' }}>Enrollment No: {user.enrollment_no}</span>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: '#e6f4ea', color: '#137333', border: '1px solid #ceead6', padding: '4px 12px', borderRadius: '14px', fontSize: '0.78rem', fontWeight: '700' }}>
                        ✓ Active Student
                      </span>
                      <span style={{ background: '#e8f0fe', color: '#1a73e8', border: '1px solid #d2e3fc', padding: '4px 12px', borderRadius: '14px', fontSize: '0.78rem', fontWeight: '700' }}>
                        Regular Admission
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  {/* Academic Info Box */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ fontSize: '1rem', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
                      <Award size={18} color="#d97706" /> Academic Information
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Course Program</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>{user.course}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Current Semester</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>Semester {user.semester}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Division / Section</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>Division {user.division || 'A'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Academic Session</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>2025 - 2026</strong>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details Box */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ fontSize: '1rem', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
                      <Smartphone size={18} color="#2563eb" /> Contact Details
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Mobile Number</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>{user.mobile}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Student Email</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>{user.email || user.username || `${(user.enrollment_no || 'student').toLowerCase()}@student.edu`}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1e293b', fontWeight: '600' }}>Campus Location</span>
                        <strong style={{ color: '#0f172a', background: '#ffffff', padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700' }}>Main Campus</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sign Out Button inside Profile Page */}
                <button
                  type="button"
                  className="student-profile-mobile-logout-btn"
                  onClick={handleLogoutConfirm}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: '14px',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                    cursor: 'pointer',
                    marginTop: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <LogOut size={20} color="#ffffff" />
                  <span style={{ color: '#ffffff' }}>Sign Out of Account</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS & SECURITY */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={22} color="#ffb703" />
                  Settings & Security Configuration
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ fontSize: '0.95rem', color: '#ffffff', margin: 0 }}>Appearance Theme</h4>
                    <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>Toggle interface light or dark mode theme styling.</p>
                    <button className="btn btn-secondary" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px' }}>
                      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                      Switch to {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                    </button>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '0.95rem', color: '#ffffff', margin: 0 }}>Hardware Device Identification</h4>
                    <div style={{ fontSize: '0.82rem', color: '#cbd5e1', wordBreak: 'break-all' }}>
                      Device ID: <code>{getDeviceId()}</code>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#34d399' }}>
                      ✓ Hardware Binding Active (Anti-Proxy Protection)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Curved Dock Bottom Navigation Bar (Paytm / Fintech FAB Scoop Notch Style) */}
      <div className="student-mobile-curved-dock">
        {/* SVG Curved Scoop Notch Background */}
        <svg className="student-dock-svg-bg" viewBox="0 0 375 64" preserveAspectRatio="none">
          <path 
            d="M 0,14 L 132,14 C 148,14 154,46 187.5,46 C 221,46 227,14 243,14 L 375,14 L 375,64 L 0,64 Z" 
            fill="#ffffff" 
          />
        </svg>

        <div className="student-dock-content">
          {/* Slot 1: Leave */}
          <button
            type="button"
            className={`student-dock-item ${activeTab === 'leave' ? 'active' : ''}`}
            onClick={() => setActiveTab('leave')}
          >
            <FileText size={20} />
            <span>Leave</span>
          </button>

          {/* Slot 2: Notice / Notification */}
          <button
            type="button"
            className={`student-dock-item ${activeTab === 'notices' ? 'active' : ''}`}
            onClick={() => setActiveTab('notices')}
          >
            <Bell size={20} />
            <span>Notice</span>
          </button>

          {/* Center Elevated Floating Action Button (FAB): Mark Attendance / QR */}
          <div className="student-fab-container">
            <button
              type="button"
              className={`student-fab-btn ${activeTab === 'mark-attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('mark-attendance')}
              title="Mark Attendance"
            >
              <QrCode size={26} strokeWidth={2.5} />
            </button>
          </div>

          {/* Slot 4: Report */}
          <button
            type="button"
            className={`student-dock-item ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => setActiveTab('report')}
          >
            <BarChart3 size={20} />
            <span>Report</span>
          </button>

          {/* Slot 5: Profile (Last option in footer dock) */}
          <button
            type="button"
            className={`student-dock-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={20} />
            <span>Profile</span>
          </button>
        </div>
      </div>

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Attendance Notification Popup */}
      {popMessage && (
        <AttendanceNotification
          type={popMessage.type}
          title={popMessage.title}
          message={popMessage.message}
          duration={3000}
          onClose={() => setPopMessage(null)}
        />
      )}
    </div>
  );
}
