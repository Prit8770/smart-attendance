import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, KeyRound, QrCode, MapPin, BarChart3, Download, Plus, Search, 
  Trash2, Edit, CheckCircle, XCircle, Clock, ShieldAlert, LogOut, RefreshCw,
  Sun, Moon, GraduationCap, User, Settings, Folder, Calendar, Menu, RotateCcw
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

// Bulletproof Helper to get local date string YYYY-MM-DD
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

const isTodaySession = (dStr, cStr) => {
  if (!dStr && !cStr) return true;
  const today = getLocalDateStr(new Date());
  if (dStr) {
    const parsedD = getLocalDateStr(dStr);
    if (parsedD && parsedD === today) return true;
  }
  if (cStr) {
    const parsedC = getLocalDateStr(cStr);
    if (parsedC && parsedC === today) return true;
  }
  return true; // Default true for backend endpoints that already return today's records
};

export default function AdminDashboard({ user, token, onLogout, theme, toggleTheme, onUpdateUser }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'students', 'otp', 'location', 'reports'
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeStatsList, setActiveStatsList] = useState(null); // null, 'total', 'present', 'absent', 'qrsessions'
  const [presentFacultyFolder, setPresentFacultyFolder] = useState(null); // null or faculty_name
  const [presentSessionFolder, setPresentSessionFolder] = useState(null); // null or session_id
  const [presentSearchName, setPresentSearchName] = useState('');
  const [presentSearchRoll, setPresentSearchRoll] = useState('');

  // Absent Today Faculty Folder & Session State
  const [absentFacultyFolder, setAbsentFacultyFolder] = useState(null);
  const [absentSessionFolder, setAbsentSessionFolder] = useState(null);
  const [absentSearchName, setAbsentSearchName] = useState('');
  const [absentSearchRoll, setAbsentSearchRoll] = useState('');
  
  // Dashboard Stats with Instant Local Hydration on Refresh
  const [stats, setStats] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_stats') || localStorage.getItem('cached_admin_stats');
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
      const cached = sessionStorage.getItem('cached_admin_stats') || localStorage.getItem('cached_admin_stats');
      return !cached;
    } catch(e) {
      return true;
    }
  });

  // Student CRUD State with persistent cache hydration for instant <1s rendering on refresh/login
  const [students, setStudents] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_students') || localStorage.getItem('cached_admin_students');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [totalListSemFilter, setTotalListSemFilter] = useState('');
  const [totalListDivFilter, setTotalListDivFilter] = useState('');
  const [statsSemFolder, setStatsSemFolder] = useState(null);
  const [statsDivFilter, setStatsDivFilter] = useState('ALL');
  const [stuSemFilter, setStuSemFilter] = useState('');
  const [stuDivFilter, setStuDivFilter] = useState('');
  const [stuPage, setStuPage] = useState(1);

  useEffect(() => {
    setStuPage(1);
  }, [searchQuery, stuSemFilter, stuDivFilter]);
  const [studentForm, setStudentForm] = useState({
    id: null,
    enrollment_no: '',
    name: '',
    course: '',
    semester: '',
    mobile: '',
    password: ''
  });
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [enrollmentTouched, setEnrollmentTouched] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [createdStudentCredentials, setCreatedStudentCredentials] = useState(null); // Save generated credentials
  const [studentsLoading, setStudentsLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_students') || localStorage.getItem('cached_admin_students');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch(e) {}
    return true;
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  // Custom React Delete Confirmation Modal State (No Browser Thread Blocking)
  const [deleteConfirmState, setDeleteConfirmState] = useState({
    isOpen: false,
    type: 'single', // 'single' or 'bulk'
    studentId: null,
    studentName: '',
    targetIds: []
  });

  // Faculty CRUD State
  const [faculties, setFaculties] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_faculties');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return [];
  });
  const [facultySearchQuery, setFacultySearchQuery] = useState('');
  const [facultyForm, setFacultyForm] = useState({
    id: null,
    employee_no: '',
    name: '',
    department: '',
    mobile: '',
    password: '',
    subjects: [{ subjectName: '', semester: '1' }]
  });
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [facultyModalMode, setFacultyModalMode] = useState('add'); // 'add' or 'edit'
  const [createdFacultyCredentials, setCreatedFacultyCredentials] = useState(null); // Save generated credentials
  const [facultyLoading, setFacultyLoading] = useState(false);


  // QR Session Manager State
  const [qrSessionHistory, setQrSessionHistory] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_qrhistory');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return [];
  });
  const [activeQrSessionDetails, setActiveQrSessionDetails] = useState(null);
  const [qrSessionTimer, setQrSessionTimer] = useState(0);
  const [tokenIndex, setTokenIndex] = useState(0);
  const [qrCodeTimer, setQrCodeTimer] = useState(15);
  const [qrGenerationEnabled, setQrGenerationEnabled] = useState(true);
  const qrCanvasRef = useRef(null);

  // College Location State with persistent cache hydration
  const [locationForm, setLocationForm] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_location') || localStorage.getItem('cached_admin_location');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.latitude && parsed.longitude) {
          return {
            latitude: parseFloat(parsed.latitude) || 23.0225,
            longitude: parseFloat(parsed.longitude) || 72.5714,
            radius: parseFloat(parsed.radius) || 200
          };
        }
      }
    } catch(e) {}
    return {
      latitude: 23.0225,
      longitude: 72.5714,
      radius: 200
    };
  });
  const [locationMessage, setLocationMessage] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const fileInputRef = useRef(null);

  // Change Password Settings State
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [settingsMessage, setSettingsMessage] = useState({ text: '', type: '' });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Profile Update State
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || ''
  });
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || ''
      });
    }
  }, [user]);

  // Responsive mobile state
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper for division matching
  const isDivMatch = (div1, div2) => {
    if (!div2 || String(div2).trim().toUpperCase() === 'ALL') return true;
    if (!div1) return true;
    return String(div1).trim().toUpperCase() === String(div2).trim().toUpperCase();
  };

  // Attendance live monitor & All Attendance Records Directory state
  const [liveLogs, setLiveLogs] = useState([]);
  const [dateLogs, setDateLogs] = useState([]);
  const [selectedSemFolder, setSelectedSemFolder] = useState(null);
  const [selectedFacultyFolder, setSelectedFacultyFolder] = useState(null);
  const [selectedSessionFolder, setSelectedSessionFolder] = useState(null);
  const [sessionFolderTab, setSessionFolderTab] = useState('present');
  const [folderSearchDate, setFolderSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [folderSearchName, setFolderSearchName] = useState('');
  const [folderDivFilter, setFolderDivFilter] = useState('ALL');
  const [monitorSemFolder, setMonitorSemFolder] = useState(null);
  const [monitorDivFilter, setMonitorDivFilter] = useState('ALL');
  const [monitorSearchName, setMonitorSearchName] = useState('');
  const [monitorSearchRoll, setMonitorSearchRoll] = useState('');
  const [monitorSearchDate, setMonitorSearchDate] = useState('');

  useEffect(() => {
    if (!folderSearchDate) return;
    const fetchDateLogs = async () => {
      try {
        const token = localStorage.getItem('attendance_token');
        if (!token) return;
        const res = await fetch(`/api/attendance/report?type=custom_date&date=${folderSearchDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.success && Array.isArray(data.report)) {
            setDateLogs(data.report);
          }
        }
      } catch (e) {
        console.error('Error fetching date logs:', e);
      }
    };
    fetchDateLogs();
  }, [folderSearchDate]);
  const [reportType, setReportType] = useState('today'); // 'today', 'monthly', 'yearly', 'student_wise', 'custom_date'
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  // reportMonth: 'YYYY-MM' format, reportYear: 'YYYY' format
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportYear, setReportYear] = useState(() => String(new Date().getFullYear()));
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportData, setReportData] = useState([]);
  const [reportFilterSem, setReportFilterSem] = useState('');
  const [reportFilterName, setReportFilterName] = useState('');
  const [reportFilterEnroll, setReportFilterEnroll] = useState('');

  // Calculate available semesters that actually have data in the system
  const availableSemesters = React.useMemo(() => {
    const semSet = new Set();

    // 1. From registered students
    (students || []).forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    // 2. From live attendance logs
    (liveLogs || []).forEach(l => {
      if (l && l.semester) {
        const semNum = String(l.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    // 3. From archived date logs
    (dateLogs || []).forEach(l => {
      if (l && l.semester) {
        const semNum = String(l.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    // 4. From faculty subject mappings
    (faculties || []).forEach(f => {
      if (f && Array.isArray(f.subjects)) {
        f.subjects.forEach(sub => {
          if (sub && sub.semester) {
            const semNum = String(sub.semester).replace(/\D/g, '').trim();
            if (semNum) semSet.add(semNum);
          }
        });
      }
    });

    // 5. From QR session history
    (qrSessionHistory || []).forEach(q => {
      if (q && q.semester) {
        const semNum = String(q.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [students, liveLogs, dateLogs, faculties, qrSessionHistory]);

  // Semesters that actually have registered student accounts
  const registeredSemesters = React.useMemo(() => {
    const semSet = new Set();
    (students || []).forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });
    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [students]);

  // Compute faculty members who teach or have logs/sessions in selectedSemFolder
  const semFacultyList = React.useMemo(() => {
    if (!selectedSemFolder) return [];
    const semStr = String(selectedSemFolder).replace(/\D/g, '');
    const semMap = new Map();

    // 1. Gather registered faculties with subjects mapped to this semester
    (faculties || []).forEach(fac => {
      if (fac && fac.name) {
        const facName = fac.name.trim();
        const subs = Array.isArray(fac.subjects) ? fac.subjects : [];
        const semSubs = subs.filter(s => s && String(s.semester || '').replace(/\D/g, '') === semStr);
        if (semSubs.length > 0) {
          const key = facName.toLowerCase();
          if (!semMap.has(key)) {
            semMap.set(key, {
              name: facName,
              employee_no: fac.employee_no || '',
              department: fac.department || '',
              subjects: semSubs,
              sessionCount: 0,
              totalLogs: 0
            });
          }
        }
      }
    });

    // 2. Gather from live logs & date logs
    const combinedLogsList = [...(liveLogs || []), ...(dateLogs || [])];
    combinedLogsList.forEach(log => {
      if (log && String(log.semester || '').replace(/\D/g, '') === semStr) {
        const facName = (log.faculty_name || (log.faculty && log.faculty.name) || log.generated_by_name || 'Faculty').trim();
        const key = facName.toLowerCase();
        if (!semMap.has(key)) {
          semMap.set(key, {
            name: facName,
            employee_no: '',
            department: '',
            subjects: [],
            sessionCount: 0,
            totalLogs: 0
          });
        }
        semMap.get(key).totalLogs += 1;
      }
    });

    // 3. Gather from QR session history
    (qrSessionHistory || []).forEach(sess => {
      if (sess && String(sess.semester || '').replace(/\D/g, '') === semStr) {
        const facName = (sess.faculty_name || (sess.faculty && sess.faculty.name) || 'Faculty').trim();
        const key = facName.toLowerCase();
        if (!semMap.has(key)) {
          semMap.set(key, {
            name: facName,
            employee_no: '',
            department: '',
            subjects: [],
            sessionCount: 0,
            totalLogs: 0
          });
        }
        semMap.get(key).sessionCount += 1;
      }
    });

    return Array.from(semMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedSemFolder, faculties, liveLogs, dateLogs, qrSessionHistory]);

  const filteredReportData = reportData.filter(row => {
    const matchSem = reportFilterSem ? String(row.semester) === reportFilterSem : true;
    const matchName = reportFilterName ? row.name.toLowerCase().includes(reportFilterName.toLowerCase()) : true;
    const matchEnroll = reportFilterEnroll ? row.enrollment_no.toLowerCase().includes(reportFilterEnroll.toLowerCase()) : true;
    return matchSem && matchName && matchEnroll;
  });

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
          sessionStorage.setItem('cached_admin_stats', JSON.stringify(data));
          localStorage.setItem('cached_admin_stats', JSON.stringify(data));
        } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Helper to sort students by Semester -> Division -> Roll Number (e.g. Sem 1: roll 1, 2, 3... Sem 2: roll 1, 2, 3...)
  const sortStudentList = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
      const semA = parseInt(a.semester, 10) || 0;
      const semB = parseInt(b.semester, 10) || 0;
      if (semA !== semB) return semA - semB;

      const divA = (a.division || '').trim().toUpperCase();
      const divB = (b.division || '').trim().toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rollA = String(a.roll_no || '').trim();
      const rollB = String(b.roll_no || '').trim();
      if (!rollA && !rollB) return String(a.name || '').localeCompare(String(b.name || ''));
      if (!rollA) return 1;
      if (!rollB) return -1;
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  // Fetch student records (Non-blocking background refresh if cache exists)
  const fetchStudents = async (forceLoading = false) => {
    if (forceLoading || !students || students.length === 0) {
      setStudentsLoading(true);
    }
    try {
      const res = await fetch('/api/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const sorted = sortStudentList(data);
        setStudents(sorted);
        try {
          sessionStorage.setItem('cached_admin_students', JSON.stringify(sorted));
          localStorage.setItem('cached_admin_students', JSON.stringify(sorted));
        } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  // Fetch faculty records
  const fetchFaculties = async () => {
    setFacultyLoading(true);
    try {
      const res = await fetch('/api/faculty', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFaculties(data);
        try { sessionStorage.setItem('cached_admin_faculties', JSON.stringify(data)); } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching faculties:', err);
    } finally {
      setFacultyLoading(false);
    }
  };

  // Fetch active QR session and Today's Session History (both QR and OTP)
  const fetchQrData = async () => {
    try {
      // 1. Fetch active QR session
      const resActive = await fetch('/api/qr/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resActive.ok) {
        const activeData = await resActive.json();
        if (activeData.active) {
          setActiveQrSessionDetails(activeData.session);
          setQrSessionTimer(activeData.secondsLeft);
        } else {
          setActiveQrSessionDetails(null);
          setQrSessionTimer(0);
        }
      }

      // 2. Fetch today's QR history & OTP history
      const [resTodayQr, resTodayOtp] = await Promise.all([
        fetch('/api/qr/today', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/otp/today', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      let qrSessions = [];
      let otpSessions = [];

      if (resTodayQr.ok) {
        qrSessions = await resTodayQr.json();
      }
      if (resTodayOtp.ok) {
        const otpData = await resTodayOtp.json();
        otpSessions = otpData.otps || [];
      }

      const formattedQr = (qrSessions || []).map(s => ({
        id: `qr_${s.id}`,
        qr_session_id: s.id,
        otp_id: null,
        faculty_name: s.faculty_name || (s.faculty && s.faculty.name) || 'Faculty',
        semester: s.semester,
        division: s.division,
        created_at: s.created_at || s.date,
        date: s.date
      }));

      const formattedOtp = (otpSessions || []).map(s => ({
        id: `otp_${s.id}`,
        qr_session_id: null,
        otp_id: s.id,
        faculty_name: s.faculty_name || (s.faculty && s.faculty.name) || 'Faculty',
        semester: s.semester,
        division: s.division,
        created_at: s.generated_time || s.created_at || s.date,
        date: s.date
      }));

      const combined = [...formattedQr, ...formattedOtp];
      setQrSessionHistory(combined);
      try { sessionStorage.setItem('cached_admin_qrhistory', JSON.stringify(combined)); } catch(e) {}
    } catch (err) {
      console.error('Error fetching QR & OTP data in Admin:', err);
    }
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

  const handleToggleQrSettings = async () => {
    try {
      const nextState = !qrGenerationEnabled;
      const res = await fetch('/api/qr/toggle-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        setQrGenerationEnabled(nextState);
      }
    } catch (err) {
      console.error('Error toggling QR settings:', err);
    }
  };

  // Helper to re-center map, marker, and radius circle seamlessly
  const syncMapLayer = (latVal, lonVal, radVal) => {
    if (!mapRef.current || !window.L) return;
    const lat = parseFloat(latVal) || 23.0225;
    const lon = parseFloat(lonVal) || 72.5714;
    const rad = parseFloat(radVal) || 200;

    mapRef.current.setView([lat, lon], 16);

    mapRef.current.eachLayer((layer) => {
      if (layer instanceof window.L.Marker || layer instanceof window.L.Circle) {
        mapRef.current.removeLayer(layer);
      }
    });

    const marker = window.L.marker([lat, lon], { draggable: true }).addTo(mapRef.current);
    const circle = window.L.circle([lat, lon], {
      color: '#9333ea',
      fillColor: '#9333ea',
      fillOpacity: 0.15,
      radius: rad
    }).addTo(mapRef.current);

    marker.on('dragend', function (event) {
      const m = event.target;
      const pos = m.getLatLng();
      const newLat = parseFloat(pos.lat.toFixed(6));
      const newLon = parseFloat(pos.lng.toFixed(6));
      setLocationForm(prev => {
        const updated = { ...prev, latitude: newLat, longitude: newLon };
        try {
          sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
          localStorage.setItem('cached_admin_location', JSON.stringify(updated));
        } catch(e) {}
        return updated;
      });
      circle.setLatLng(pos);
    });

    mapRef.current.off('click');
    mapRef.current.on('click', function(e) {
      const coord = e.latlng;
      const newLat = parseFloat(coord.lat.toFixed(6));
      const newLon = parseFloat(coord.lng.toFixed(6));
      setLocationForm(prev => {
        const updated = { ...prev, latitude: newLat, longitude: newLon };
        try {
          sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
          localStorage.setItem('cached_admin_location', JSON.stringify(updated));
        } catch(e) {}
        return updated;
      });
      marker.setLatLng(coord);
      circle.setLatLng(coord);
    });
  };

  // Fetch College Location
  const fetchLocation = async () => {
    try {
      const res = await fetch('/api/location', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const updated = {
          latitude: parseFloat(data.latitude) || 23.0225,
          longitude: parseFloat(data.longitude) || 72.5714,
          radius: parseFloat(data.radius) || 200
        };
        setLocationForm(updated);
        try {
          sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
          localStorage.setItem('cached_admin_location', JSON.stringify(updated));
        } catch(e) {}
        syncMapLayer(updated.latitude, updated.longitude, updated.radius);
      }
    } catch (err) {
      console.error('Error fetching college location:', err);
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
        try { sessionStorage.setItem('cached_admin_livelogs', JSON.stringify(data)); } catch(e) {}
      }
    } catch (err) {
      console.error('Error fetching live logs:', err);
    }
  };

  const [directoryReloading, setDirectoryReloading] = useState(false);

  const handleReloadDirectory = async () => {
    setDirectoryReloading(true);
    try {
      await fetchLiveLogs();
    } catch (err) {
      console.error('Error reloading directory:', err);
    } finally {
      setDirectoryReloading(false);
    }
  };

  // Fetch Report Data
  const fetchReportData = async () => {
    let query = '';
    if (reportType === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      query = `?date=${todayStr}`;
    } else if (reportType === 'monthly') {
      // reportMonth is 'YYYY-MM'
      const [yr, mo] = reportMonth.split('-').map(Number);
      const startOfMonth = new Date(yr, mo - 1, 1).toISOString().split('T')[0];
      const endOfMonth   = new Date(yr, mo, 0).toISOString().split('T')[0]; // last day of month
      query = `?startDate=${startOfMonth}&endDate=${endOfMonth}`;
    } else if (reportType === 'yearly') {
      // reportYear is 'YYYY'
      const yr = parseInt(reportYear, 10);
      const startOfYear = `${yr}-01-01`;
      const endOfYear   = `${yr}-12-31`;
      query = `?startDate=${startOfYear}&endDate=${endOfYear}`;
    } else if (reportType === 'student_wise') {
      query = `?studentId=${reportStudentId}`;
    } else if (reportType === 'custom_date') {
      query = `?date=${reportDate || new Date().toISOString().split('T')[0]}`;
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

  // Run on mount
  useEffect(() => {
    fetchStats();
    fetchLiveLogs();
    fetchStudents();
    fetchQrData();
    fetchFaculties();
    fetchQrSettings();
  }, []);

  // Dynamic Polling for Stats & Live Logs (Poll every 3s during active QR session, else 10s)
  useEffect(() => {
    const isSessionActive = stats.activeQrSession !== null || activeQrSessionDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 10000;
    
    const interval = setInterval(() => {
      fetchStats();
      fetchLiveLogs();
      fetchQrData();
      fetchQrSettings();
    }, intervalTime);
    
    return () => clearInterval(interval);
  }, [stats.activeQrSession, activeQrSessionDetails]);

  // Handle QR session timers
  useEffect(() => {
    let timerInterval;
    if (activeQrSessionDetails && qrSessionTimer > 0) {
      timerInterval = setInterval(() => {
        setQrSessionTimer(prev => {
          if (prev <= 1) {
            setActiveQrSessionDetails(null);
            fetchStats();
            return 0;
          }
          const elapsed = 120 - (prev - 1);
          const idx = Math.min(7, Math.floor(elapsed / 15));
          setTokenIndex(idx);
          setQrCodeTimer(15 - (elapsed % 15));
          return prev - 1;
        });
      }, 1000);
    } else {
      setQrSessionTimer(0);
      setQrCodeTimer(0);
      setTokenIndex(0);
    }
    return () => clearInterval(timerInterval);
  }, [activeQrSessionDetails, qrSessionTimer]);

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

  // Handle Tab Switch Actions
  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudents();
    } else if (activeTab === 'otp') {
      fetchQrData();
    } else if (activeTab === 'location') {
      fetchLocation();
    } else if (activeTab === 'reports') {
      fetchStudents(); // Load students for the dropdown
      fetchReportData();
    }
  }, [activeTab]);

  // Re-fetch report when configuration changed
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [reportType, reportStudentId, reportDate, reportMonth, reportYear]);

  // Leaflet Map Initialization & Sync
  useEffect(() => {
    if (activeTab === 'location' && mapContainerRef.current) {
      // Destroy existing map if initialized
      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }

      if (window.L) {
        const { latitude, longitude, radius } = locationForm;
        const parsedLat = parseFloat(latitude) || 23.0225;
        const parsedLon = parseFloat(longitude) || 72.5714;
        const parsedRad = parseFloat(radius) || 200;

        // Initialize Map
        mapRef.current = window.L.map(mapContainerRef.current).setView([parsedLat, parsedLon], 16);

        // Tile Layer (Dark styled tiles or Standard OpenStreetMap)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(mapRef.current);

        // Draw college center marker
        const marker = window.L.marker([parsedLat, parsedLon], { draggable: true }).addTo(mapRef.current);
        
        // Draw radius circle
        const circle = window.L.circle([parsedLat, parsedLon], {
          color: '#9333ea',
          fillColor: '#9333ea',
          fillOpacity: 0.15,
          radius: parsedRad
        }).addTo(mapRef.current);

        // Drag marker update inputs
        marker.on('dragend', function (event) {
          const m = event.target;
          const position = m.getLatLng();
          setLocationForm(prev => ({
            ...prev,
            latitude: parseFloat(position.lat.toFixed(6)),
            longitude: parseFloat(position.lng.toFixed(6))
          }));
          circle.setLatLng(position);
        });

        // Click map update inputs
        mapRef.current.on('click', function(e) {
          const coord = e.latlng;
          setLocationForm(prev => ({
            ...prev,
            latitude: parseFloat(coord.lat.toFixed(6)),
            longitude: parseFloat(coord.lng.toFixed(6))
          }));
          marker.setLatLng(coord);
          circle.setLatLng(coord);
        });
      }
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
    };
  }, [activeTab]);

  // Update map layer on radius or coordinates change
  const handleLocationInputChange = (field, value) => {
    setLocationForm(prev => {
      const updated = { ...prev, [field]: value };
      try {
        sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
        localStorage.setItem('cached_admin_location', JSON.stringify(updated));
      } catch(e) {}
      syncMapLayer(updated.latitude, updated.longitude, updated.radius);
      return updated;
    });
  };

  // Submit Location updates
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    setLocationMessage('');
    try {
      const res = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(locationForm)
      });
      if (res.ok) {
        const data = await res.json();
        const savedLoc = data.location || locationForm;
        const updated = {
          latitude: parseFloat(savedLoc.latitude) || 23.0225,
          longitude: parseFloat(savedLoc.longitude) || 72.5714,
          radius: parseFloat(savedLoc.radius) || 200
        };
        setLocationForm(updated);
        try {
          sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
          localStorage.setItem('cached_admin_location', JSON.stringify(updated));
        } catch(e) {}
        setLocationMessage('Location configuration saved successfully!');
        syncMapLayer(updated.latitude, updated.longitude, updated.radius);
      } else {
        const err = await res.json();
        setLocationMessage(err.error || 'Failed to save configuration.');
      }
    } catch (err) {
      console.error('Error saving location:', err);
      setLocationMessage('Network error. Failed to save location.');
    }
  };

  // Live coordinates fetching from device GPS
  const handleGetAdminLiveLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lon = parseFloat(position.coords.longitude.toFixed(6));
        
        setLocationForm(prev => {
          const updated = {
            ...prev,
            latitude: lat,
            longitude: lon
          };
          // update map
          if (mapRef.current && window.L) {
            mapRef.current.setView([lat, lon]);
            mapRef.current.eachLayer((layer) => {
              if (layer instanceof window.L.Marker || layer instanceof window.L.Circle) {
                mapRef.current.removeLayer(layer);
              }
            });
            const marker = window.L.marker([lat, lon], { draggable: true }).addTo(mapRef.current);
            const circle = window.L.circle([lat, lon], {
              color: '#9333ea',
              fillColor: '#9333ea',
              fillOpacity: 0.15,
              radius: parseFloat(updated.radius) || 200
            }).addTo(mapRef.current);

            marker.on('dragend', function (event) {
              const m = event.target;
              const pos = m.getLatLng();
              setLocationForm(old => ({
                ...old,
                latitude: parseFloat(pos.lat.toFixed(6)),
                longitude: parseFloat(pos.lng.toFixed(6))
              }));
              circle.setLatLng(pos);
            });
          }
          return updated;
        });
        setLocationMessage(`Set college location to your device GPS: Lat ${lat}, Lng ${lon}`);
      },
      (error) => {
        setLocationMessage(`GPS Fetch Error: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Nominatim Address Search Geocoder
  const handleSearchAddress = async (e) => {
    if (e) e.preventDefault();
    if (!addressQuery.trim()) return;
    setSearchLoading(true);
    setLocationMessage('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const { lat, lon, display_name } = data[0];
          const parsedLat = parseFloat(lat);
          const parsedLon = parseFloat(lon);
          
          setLocationForm(prev => {
            const updated = {
              ...prev,
              latitude: parsedLat,
              longitude: parsedLon
            };
            // update map
            if (mapRef.current && window.L) {
              mapRef.current.setView([parsedLat, parsedLon]);
              mapRef.current.eachLayer((layer) => {
                if (layer instanceof window.L.Marker || layer instanceof window.L.Circle) {
                  mapRef.current.removeLayer(layer);
                }
              });
              const marker = window.L.marker([parsedLat, parsedLon], { draggable: true }).addTo(mapRef.current);
              const circle = window.L.circle([parsedLat, parsedLon], {
                color: '#9333ea',
                fillColor: '#9333ea',
                fillOpacity: 0.15,
                radius: parseFloat(updated.radius) || 200
              }).addTo(mapRef.current);

              marker.on('dragend', function (event) {
                const m = event.target;
                const pos = m.getLatLng();
                setLocationForm(old => ({
                  ...old,
                  latitude: parseFloat(pos.lat.toFixed(6)),
                  longitude: parseFloat(pos.lng.toFixed(6))
                }));
                circle.setLatLng(pos);
              });
            }
            return updated;
          });
          setLocationMessage(`Found Location: ${display_name}`);
        } else {
          setLocationMessage('Location address not found. Please try again.');
        }
      } else {
        setLocationMessage('Failed to connect to search service.');
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      setLocationMessage('Error connecting to search service.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle Profile Update Submission
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMessage({ text: '', type: '' });
    setProfileLoading(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileForm.name,
          email: profileForm.email
        })
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMessage({ text: 'Profile updated successfully! All details synchronized.', type: 'success' });
        if (onUpdateUser) {
          onUpdateUser(data.user, data.token);
        } else {
          localStorage.setItem('attendance_user', JSON.stringify(data.user));
          if (data.token) localStorage.setItem('attendance_token', data.token);
        }
      } else {
        setProfileMessage({ text: data.error || 'Failed to update profile.', type: 'danger' });
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setProfileMessage({ text: 'Network error. Failed to connect to server.', type: 'danger' });
    } finally {
      setProfileLoading(false);
    }
  };

  // Change Admin Password Submission
  const handleChangeAdminPassword = async (e) => {
    e.preventDefault();
    setSettingsMessage({ text: '', type: '' });

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setSettingsMessage({ text: 'New password and confirm password do not match.', type: 'danger' });
      return;
    }

    setSettingsLoading(true);

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

  // Start QR Session logic
  const handleStartQrSession = async () => {
    try {
      const res = await fetch('/api/qr/start-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActiveQrSessionDetails(data.session);
        setQrSessionTimer(120);
        setTokenIndex(0);
        setQrCodeTimer(15);
        fetchStats();
      } else {
        alert(data.error || 'Failed to start QR session');
      }
    } catch (err) {
      console.error('Error starting QR session:', err);
    }
  };

  // Send imported student batch to backend
  const sendBulkImport = async (studentsList) => {
    try {
      const response = await fetch('/api/students/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ students: studentsList })
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        alert(data.error || 'Your session has expired. Please log in again.');
        if (onLogout) onLogout();
        return;
      }
      if (response.ok) {
        let msg = `Successfully imported ${data.successCount} students!`;
        if (data.errors && data.errors.length > 0) {
          msg += `\n\nErrors encountered:\n` + data.errors.slice(0, 5).join('\n');
          if (data.errors.length > 5) msg += `\n...and ${data.errors.length - 5} more errors.`;
        }
        alert(msg);
        fetchStudents();
        fetchStats();
      } else {
        alert(data.error || 'Failed to import students.');
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Network error while importing student data.');
    }
  };

  // Helper to map header columns to student properties
  const parseHeaderToStudentField = (header, val, stuObj) => {
    if (val === undefined || val === null) return;
    let strVal = String(val).trim();
    if (!strVal) return;

    // Fix potential float/scientific notation for numbers in Excel (e.g. 2.400059139e+09 or 2400059139.0)
    if (/^\d+\.?\d*e\+\d+$/i.test(strVal)) {
      strVal = Number(strVal).toLocaleString('fullwide', { useGrouping: false });
    }
    strVal = strVal.replace(/\.0+$/, '').trim();

    const rawH = String(header || '').trim().toLowerCase();
    const cleanH = rawH.replace(/[^a-z0-9]/g, '');

    // 1. Enrollment No (Checked FIRST so 'enrollment' doesn't accidentally match 'roll')
    if (
      cleanH.includes('enroll') || 
      cleanH.includes('enrol') || 
      cleanH.includes('registra') ||
      cleanH.includes('regno') ||
      cleanH === 'eno' || 
      cleanH === 'grno' ||
      cleanH === 'id' ||
      cleanH === 'studentid' ||
      (cleanH.includes('no') && !cleanH.includes('roll') && !cleanH.includes('mobile') && !cleanH.includes('phone'))
    ) {
      stuObj.enrollment_no = strVal;
    } 
    // 2. Roll No (Must explicitly exclude 'enroll'/'enrol')
    else if (
      !cleanH.includes('enroll') && 
      !cleanH.includes('enrol') && 
      (cleanH.includes('roll') || cleanH.includes('seat') || cleanH === 'rno' || cleanH === 'rnumber' || cleanH === 'rollno')
    ) {
      stuObj.roll_no = strVal;
    } 
    // 3. Division / Section / Class / Batch / Group
    else if (
      cleanH.includes('division') || 
      cleanH.includes('divison') || 
      cleanH.includes('divsion') || 
      cleanH.includes('div') || 
      cleanH.includes('sec') || 
      cleanH.includes('section') || 
      cleanH.includes('class') || 
      cleanH.includes('batch') || 
      cleanH.includes('group') || 
      cleanH.includes('grp')
    ) {
      stuObj.division = strVal.replace(/div/gi, '').trim().toUpperCase();
    } 
    // 4. Name
    else if (cleanH.includes('name')) {
      stuObj.name = strVal;
    } 
    // 5. Course / Branch / Stream
    else if (cleanH.includes('course') || cleanH.includes('dept') || cleanH.includes('branch') || cleanH.includes('stream') || cleanH.includes('program')) {
      stuObj.course = strVal;
    } 
    // 6. Semester / Sem
    else if (cleanH.includes('semester') || cleanH.includes('sem')) {
      stuObj.semester = strVal.replace(/sem/gi, '').trim();
    } 
    // 7. Mobile / Phone
    else if (cleanH.includes('mobile') || cleanH.includes('phone') || cleanH.includes('contact') || cleanH.includes('cell')) {
      stuObj.mobile = strVal;
    } 
    // 8. Password
    else if (cleanH.includes('password') || cleanH.includes('pass')) {
      stuObj.password = strVal;
    }
  };

  // CSV & XLSX student import handler
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();

    if (fileType === 'csv') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          alert('CSV file is empty or missing data rows.');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const studentsList = [];

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = lines[i].split(',').map(v => v.trim());
          const stuObj = {};

          headers.forEach((header, index) => {
            let val = values[index] || '';
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1);
            }
            parseHeaderToStudentField(header, val, stuObj);
          });

          if (stuObj.enrollment_no && stuObj.name) {
            stuObj.course = stuObj.course || 'B.E.';
            stuObj.semester = stuObj.semester || '1';
            stuObj.mobile = stuObj.mobile || '0000000000';
            studentsList.push(stuObj);
          }
        }

        if (studentsList.length === 0) {
          alert('No valid student rows found. Header columns should contain at least "Enrollment No" and "Name".');
          return;
        }

        sendBulkImport(studentsList);
      };
      reader.readAsText(file);
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (rows.length < 2) {
            alert('Excel file is empty or missing data rows.');
            return;
          }

          const headers = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
          const studentsList = [];

          for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            if (!values || values.length === 0) continue;

            const stuObj = {};
            headers.forEach((header, index) => {
              let val = values[index] !== undefined && values[index] !== null ? values[index].toString().trim() : '';
              parseHeaderToStudentField(header, val, stuObj);
            });

            if (stuObj.enrollment_no && stuObj.name) {
              stuObj.course = stuObj.course || 'B.E.';
              stuObj.semester = stuObj.semester || '1';
              stuObj.mobile = stuObj.mobile || '0000000000';
              studentsList.push(stuObj);
            }
          }

          if (studentsList.length === 0) {
            alert('No valid student rows found. Header columns should contain at least "Enrollment No" and "Name".');
            return;
          }

          sendBulkImport(studentsList);
        } catch (err) {
          console.error('Error parsing Excel file:', err);
          alert('Failed to parse Excel file. Please ensure it is a valid .xlsx file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Unsupported file format. Please upload CSV or XLSX.');
    }

    e.target.value = '';
  };

  // Student CRUD Submission (Optimized <1s Response Time)
  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(true);
    setMobileTouched(true);

    const isEdit = modalMode === 'edit';
    if (!isEdit) {
      if (!/^\d{10}$/.test(String(studentForm.enrollment_no || '').trim())) {
        alert('Please enter valid enrollment number');
        return;
      }
    }

    if (!/^\d{10}$/.test(String(studentForm.mobile || '').trim())) {
      alert('Please enter valid mobile number');
      return;
    }

    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit 
      ? `/api/students/${studentForm.id}`
      : '/api/students';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(studentForm)
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          alert(data.error || 'Your session has expired. Please log in again.');
          if (onLogout) onLogout();
          return;
        }
        throw new Error(data.error || 'Action failed.');
      }

      const savedStudent = data.student;

      // INSTANT Optimistic local state & cache update (< 1ms)
      if (savedStudent) {
        setStudents(prev => {
          const list = Array.isArray(prev) ? prev : [];
          const existingIdx = list.findIndex(s => String(s.id) === String(savedStudent.id));
          let updated;
          if (existingIdx >= 0) {
            updated = [...list];
            updated[existingIdx] = { ...updated[existingIdx], ...savedStudent };
          } else {
            updated = [savedStudent, ...list];
          }
          const sorted = sortStudentList(updated);
          try { sessionStorage.setItem('cached_admin_students', JSON.stringify(sorted)); } catch(e) {}
          return sorted;
        });

        if (!isEdit) {
          setStats(prev => {
            const updatedStats = {
              ...prev,
              totalStudents: Math.max((prev.totalStudents || 0) + 1, (prev.totalStudents || 0))
            };
            try {
              sessionStorage.setItem('cached_admin_stats', JSON.stringify(updatedStats));
              localStorage.setItem('cached_admin_stats', JSON.stringify(updatedStats));
            } catch(e) {}
            return updatedStats;
          });

          // Show generated credentials modal details INSTANTLY (< 1-2 seconds)
          setCreatedStudentCredentials({
            username: savedStudent.username,
            password: savedStudent.generatedPassword || savedStudent.plain_password
          });
        }
      }

      if (isEdit) {
        setShowStudentModal(false);
      }

      // Perform background refetch quietly without freezing UI modal
      setTimeout(() => {
        fetchStudents();
        fetchStats();
      }, 500);
    } catch (err) {
      alert(err.message);
    }
  };

  // Open Custom Delete Confirmation Modal (Instant < 1ms, No Browser Blocking)
  const handleDeleteStudent = (student) => {
    const sId = student && typeof student === 'object' ? student.id : student;
    const targetStu = typeof student === 'object' ? student : students.find(s => String(s.id) === String(sId));
    const sName = targetStu ? targetStu.name : 'this student';

    setDeleteConfirmState({
      isOpen: true,
      type: 'single',
      studentId: sId,
      studentName: sName,
      targetIds: [sId]
    });
  };

  // Open Bulk Delete Confirmation Modal (Instant < 1ms, No Browser Blocking)
  const handleBulkDeleteStudents = (idsToDelete) => {
    const ids = idsToDelete || selectedStudentIds;
    if (!ids || ids.length === 0) {
      alert('Please select at least one student to delete.');
      return;
    }

    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      studentId: null,
      studentName: `${ids.length} selected student(s)`,
      targetIds: ids
    });
  };

  // Execute Confirmed Delete with 0ms Optimistic UI Removal
  const executeConfirmedDelete = async () => {
    const { type, studentId, targetIds } = deleteConfirmState;
    setDeleteConfirmState({ isOpen: false, type: 'single', studentId: null, studentName: '', targetIds: [] });

    const prevStudents = [...students];
    const targetSet = new Set(targetIds.map(id => String(id)));

    // Optimistic Instant Local Update (0ms delay)
    const updatedList = students.filter(s => !targetSet.has(String(s.id)));
    setStudents(updatedList);
    setSelectedStudentIds(prev => prev.filter(id => !targetSet.has(String(id))));
    setStats(prev => ({ ...prev, totalStudents: Math.max(0, (prev.totalStudents || 0) - targetIds.length) }));
    try { sessionStorage.setItem('cached_admin_students', JSON.stringify(updatedList)); } catch(e) {}

    try {
      let res;
      if (type === 'single' && studentId) {
        res = await fetch(`/api/students/${studentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        res = await fetch('/api/students/bulk-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ studentIds: targetIds })
        });
      }

      if (!res.ok) {
        // Rollback on server error
        setStudents(prevStudents);
        try { sessionStorage.setItem('cached_admin_students', JSON.stringify(prevStudents)); } catch(e) {}
        const data = await res.json();
        if (res.status === 401 || res.status === 403) {
          alert(data.error || 'Your session has expired. Please log in again.');
          if (onLogout) onLogout();
          return;
        }
        alert(data.error || 'Failed to delete student(s) on server.');
      } else {
        fetchStats();
      }
    } catch (err) {
      console.error('Delete execution error:', err);
      setStudents(prevStudents);
    }
  };

  const toggleSelectStudent = (id) => {
    setSelectedStudentIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAllStudents = () => {
    const filteredIds = filteredStudents.map(s => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedStudentIds.includes(id));

    if (allSelected) {
      setSelectedStudentIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedStudentIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setModalMode('add');
    setStudentForm({
      id: null,
      enrollment_no: '',
      roll_no: '',
      division: '',
      name: '',
      course: '',
      semester: '',
      mobile: '',
      password: ''
    });
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(false);
    setMobileTouched(false);
    setShowStudentModal(true);
  };

  // Open Edit Modal
  const openEditModal = (student) => {
    setModalMode('edit');
    setStudentForm({
      id: student.id,
      enrollment_no: student.enrollment_no,
      roll_no: student.roll_no || '',
      division: student.division || '',
      name: student.name,
      course: student.course,
      semester: student.semester,
      mobile: student.mobile,
      password: '',
      resetPassword: false
    });
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(false);
    setMobileTouched(false);
    setShowStudentModal(true);
  };

  // Faculty CRUD Handlers
  const openAddFacultyModal = () => {
    setFacultyModalMode('add');
    setFacultyForm({
      id: null,
      employee_no: '',
      name: '',
      department: '',
      mobile: '',
      password: '',
      subjects: [{ subjectName: '', shortName: '', semester: '1' }]
    });
    setCreatedFacultyCredentials(null);
    setShowFacultyModal(true);
  };

  const openEditFacultyModal = (faculty) => {
    setFacultyModalMode('edit');
    let parsedSubjects = [{ subjectName: '', shortName: '', semester: '1' }];
    if (faculty.subjects) {
      try {
        parsedSubjects = typeof faculty.subjects === 'string' ? JSON.parse(faculty.subjects) : faculty.subjects;
        if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
          parsedSubjects = [{ subjectName: '', shortName: '', semester: '1' }];
        }
      } catch (e) {
        parsedSubjects = [{ subjectName: '', shortName: '', semester: '1' }];
      }
    }
    setFacultyForm({
      id: faculty.id,
      employee_no: faculty.employee_no,
      name: faculty.name,
      department: faculty.department,
      mobile: faculty.mobile,
      password: '',
      subjects: parsedSubjects
    });
    setCreatedFacultyCredentials(null);
    setShowFacultyModal(true);
  };

  const handleSaveFaculty = async (e) => {
    e.preventDefault();
    const isEdit = facultyModalMode === 'edit';
    const url = isEdit 
      ? `/api/faculty/${facultyForm.id}`
      : '/api/faculty';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(facultyForm)
      });
      const data = await res.json();
      if (res.ok) {
        if (!isEdit) {
          setCreatedFacultyCredentials({
            username: data.faculty.username,
            password: data.faculty.plain_password
          });
        } else {
          setShowFacultyModal(false);
        }
        fetchFaculties();
        fetchStats();
      } else {
        if (res.status === 401 || res.status === 403) {
          alert(data.error || 'Your session has expired. Please log in again.');
          if (onLogout) onLogout();
          return;
        }
        alert(data.error || 'Failed to save faculty');
      }
    } catch (err) {
      console.error('Error saving faculty:', err);
      alert('Error connecting to backend');
    }
  };

  const handleResetFacultyPassword = async (facultyId) => {
    if (!window.confirm('Are you sure you want to reset password for this faculty member?')) return;
    try {
      const facultyObj = faculties.find(f => f.id === facultyId);
      const res = await fetch(`/api/faculty/${facultyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: facultyObj.name,
          department: facultyObj.department,
          mobile: facultyObj.mobile,
          resetPassword: true
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Password reset successfully!\nNew Password: ${data.faculty.plain_password}`);
        fetchFaculties();
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch (err) {
      console.error('Error resetting password:', err);
    }
  };

  const handleDeleteFaculty = async (facultyId) => {
    if (!window.confirm('Are you sure you want to delete this faculty member?')) return;
    try {
      const res = await fetch(`/api/faculty/${facultyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        fetchFaculties();
        fetchStats();
      } else {
        alert(data.error || 'Failed to delete faculty');
      }
    } catch (err) {
      console.error('Error deleting faculty:', err);
    }
  };

  // Generate and Download PDF Report
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Title styling
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(147, 51, 234); // Purple color
    doc.text('College Smart Attendance Report', 14, 20);

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100);
    const scopeStr = reportType === 'custom_date' ? `CHOSEN DATE (${reportDate})` : reportType.toUpperCase();
    doc.text(`Report Scope: ${scopeStr}`, 14, 28);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 34);

    // Filter information
    if (reportType === 'student_wise' && reportStudentId) {
      const stu = students.find(s => s.id === parseInt(reportStudentId));
      if (stu) {
        doc.text(`Student: ${stu.name} (${stu.enrollment_no})`, 14, 40);
        doc.text(`Course/Sem: ${stu.course} - Sem ${stu.semester}`, 14, 46);
      }
    }

    const tableColumn = ['Enrollment No', 'Name', 'Course/Sem', 'Faculty', 'Session/OTP', 'Date', 'Time', 'Distance', 'Status'];
    const tableRows = [];

    filteredReportData.forEach((row) => {
      tableRows.push([
        row.enrollment_no,
        row.name,
        `${row.course} - S${row.semester}`,
        row.faculty_name || 'Admin',
        row.qr_session_id ? `QR Session #${row.qr_session_id}` : `${row.otp || 'N/A'} (OTP)`,
        row.date,
        row.time,
        `${row.distance}m`,
        row.status === 'Success' ? 'Present' : 'Rejected'
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: reportType === 'student_wise' ? 52 : 40,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] },
      styles: { fontSize: 8 },
      columnStyles: {
        8: { fontStyle: 'bold' } // bold status
      }
    });

    const fileScope = reportType === 'custom_date' ? `CustomDate_${reportDate}` : reportType;
    doc.save(`Attendance_Report_${fileScope}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const fileScope = reportType === 'custom_date' ? `CustomDate_${reportDate}` : reportType;
    const cleanData = filteredReportData.map(row => ({
      'Roll No': row.roll_no || '-',
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Division': row.division || '-',
      'Faculty': row.faculty_name || 'Admin',
      'Session/OTP': row.qr_session_id ? `QR Session #${row.qr_session_id}` : `${row.otp || 'N/A'} (OTP)`,
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance,
      'Status': row.status === 'Success' ? 'Present' : 'Rejected'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${fileScope}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    const fileScope = reportType === 'custom_date' ? `CustomDate_${reportDate}` : reportType;
    const cleanData = filteredReportData.map(row => ({
      'Roll No': row.roll_no || '-',
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Division': row.division || '-',
      'Faculty': row.faculty_name || 'Admin',
      'Session/OTP': row.qr_session_id ? `QR Session #${row.qr_session_id}` : `${row.otp || 'N/A'} (OTP)`,
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance,
      'Status': row.status === 'Success' ? 'Present' : 'Rejected'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${fileScope}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const filteredStudents = sortStudentList(students.filter(
    (s) => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.enrollment_no.includes(searchQuery);
      const matchSem = !stuSemFilter || String(s.semester) === String(stuSemFilter);
      const matchDiv = !stuDivFilter || 
        (stuDivFilter === 'none' ? !s.division || s.division.trim() === '' : String(s.division).toLowerCase() === stuDivFilter.toLowerCase());
      return matchSearch && matchSem && matchDiv;
    }
  ));

  return (
    <div className="admin-dashboard-root">
      <div className="admin-layout">
        {/* Left Sidebar */}
        <aside className={`admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
          {/* Top Left Logo Box (Photo 3 Logo) */}
          <div className="admin-sidebar-brand">
            <div className="admin-logo-box">
              <GraduationCap size={24} color="#001b3d" strokeWidth={2.5} />
            </div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">Smart Attendance System</span>
            </div>
          </div>

          {/* Navigation Items (Photo 2) */}
          <nav className="admin-sidebar-nav">
            <button 
              className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setActiveTab('dashboard'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <BarChart3 size={18} />
              <span>Dashboard</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => { setActiveTab('students'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <Users size={18} />
              <span>Students</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'faculty' ? 'active' : ''}`}
              onClick={() => { setActiveTab('faculty'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <GraduationCap size={18} />
              <span>Faculty</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'otp' ? 'active' : ''}`}
              onClick={() => { setActiveTab('otp'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <QrCode size={18} />
              <span>QR Attendance</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'location' ? 'active' : ''}`}
              onClick={() => { setActiveTab('location'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <MapPin size={18} />
              <span>College Location</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => { setActiveTab('reports'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <Download size={18} />
              <span>Reports</span>
            </button>

            <button 
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setMobileSidebarOpen(false); }}
            >
              <span className="admin-nav-indicator"></span>
              <Settings size={18} />
              <span>Profile & Settings</span>
            </button>
          </nav>

          {/* Sidebar Footer */}
          <div className="admin-sidebar-footer">
            <div className="admin-theme-switch-row" onClick={toggleTheme}>
              <div className="admin-theme-left">
                {theme === 'light' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#93c5fd" />}
                <span className="admin-theme-label">{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
              </div>
              <div className={`admin-toggle-switch ${theme === 'light' ? 'checked' : ''}`}>
                <div className="admin-toggle-thumb"></div>
              </div>
            </div>

            <button className="admin-logout-btn" onClick={onLogout}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <div className="admin-main-wrapper">
          {/* Top Header Bar */}
          <header className="admin-top-header">
            <div className="admin-top-header-left">
              <button 
                className="admin-mobile-toggle-btn"
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                title="Toggle Menu"
              >
                <Menu size={22} />
              </button>
              <h1 className="admin-page-title">Admin Dashboard</h1>
            </div>

            <div className="admin-top-header-right">
              <div className="admin-user-info">
                <span className="admin-user-name">Welcome, <strong>{user?.name || 'Administrator'}</strong></span>
              </div>
            </div>
          </header>

          {/* Main Tab Panels */}
          <main className="admin-main-content">
            
            {/* PANEL 1: DASHBOARD MONITOR */}
            {activeTab === 'dashboard' && (
              <div style={styles.tabPanel}>
                {/* Stats Overview (Photo 2 V2 Card Layout) */}
                <div className="dashboard-grid">
                  <div 
                    className="glass-panel stat-card-v2" 
                    style={{ cursor: 'pointer', border: activeStatsList === 'total' ? '1.5px solid #3b82f6' : '1px solid var(--panel-border)' }} 
                    onClick={() => {
                      setActiveStatsList(prev => prev === 'total' ? null : 'total');
                      setStatsSemFolder(null);
                      setStatsDivFilter('ALL');
                    }}
                  >
                    <div className="stat-card-top">
                      <div className="stat-card-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                        <Users size={20} />
                      </div>
                      <span className="stat-card-title">Total Students</span>
                    </div>
                    <div className="stat-card-value">
                      {statsLoading ? '...' : stats.totalStudents}
                    </div>
                    <div className="stat-card-sub" style={{ color: '#3b82f6' }}>
                      <span>▲ 2 change</span>
                    </div>
                  </div>

                  <div 
                    className="glass-panel stat-card-v2" 
                    style={{ cursor: 'pointer', border: activeStatsList === 'present' ? '1.5px solid #10b981' : '1px solid var(--panel-border)' }} 
                    onClick={() => setActiveStatsList(prev => prev === 'present' ? null : 'present')}
                  >
                    <div className="stat-card-top">
                      <div className="stat-card-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                        <CheckCircle size={20} />
                      </div>
                      <span className="stat-card-title">Present Today</span>
                    </div>
                    <div className="stat-card-value" style={{ color: '#10b981' }}>
                      {statsLoading ? '...' : stats.presentToday}
                    </div>
                    <div className="stat-card-sub" style={{ color: '#10b981' }}>
                      <span>▲ {stats.totalStudents ? ((stats.presentToday / (stats.totalStudents || 1)) * 100).toFixed(2) : '3.84'}%</span>
                    </div>
                  </div>

                  <div 
                    className="glass-panel stat-card-v2" 
                    style={{ cursor: 'pointer', border: activeStatsList === 'absent' ? '1.5px solid #ef4444' : '1px solid var(--panel-border)' }} 
                    onClick={() => setActiveStatsList(prev => prev === 'absent' ? null : 'absent')}
                  >
                    <div className="stat-card-top">
                      <div className="stat-card-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                        <XCircle size={20} />
                      </div>
                      <span className="stat-card-title">Absent Today</span>
                    </div>
                    <div className="stat-card-value" style={{ color: '#ef4444' }}>
                      {statsLoading ? '...' : stats.absentToday}
                    </div>
                    <div className="stat-card-sub" style={{ color: '#ef4444' }}>
                      <span>▼ {stats.totalStudents ? ((stats.absentToday / (stats.totalStudents || 1)) * 100).toFixed(2) : '1.87'}%</span>
                    </div>
                  </div>

                  <div 
                    className="glass-panel stat-card-v2" 
                    style={{ cursor: 'pointer', border: activeStatsList === 'total_faculty' ? '1.5px solid #f59e0b' : '1px solid var(--panel-border)' }} 
                    onClick={() => setActiveStatsList(prev => prev === 'total_faculty' ? null : 'total_faculty')}
                  >
                    <div className="stat-card-top">
                      <div className="stat-card-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                        <GraduationCap size={20} />
                      </div>
                      <span className="stat-card-title">Total Faculty</span>
                    </div>
                    <div className="stat-card-value">
                      {statsLoading ? '...' : (stats.totalFaculty || 0)}
                    </div>
                    <div className="stat-card-sub" style={{ color: 'var(--text-secondary)' }}>
                      <span>Profiles in context</span>
                    </div>
                  </div>
                </div>

            {/* Clickable Stats Details List */}
            {activeStatsList && (
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                    {activeStatsList === 'total' && 'Total Registered Students'}
                    {activeStatsList === 'total_faculty' && 'Total Registered Faculty'}
                    {activeStatsList === 'present' && (
                      presentSessionFolder 
                        ? `Present Students - Faculty: ${presentFacultyFolder} (Session View)` 
                        : (presentFacultyFolder ? `Faculty: ${presentFacultyFolder} - Session Folders` : 'Present Today - Faculty Folders')
                    )}
                    {activeStatsList === 'absent' && 'Absent Students List (Today)'}
                    {activeStatsList === 'qrsessions' && "Today's Generated QR Sessions"}
                  </h3>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setActiveStatsList(null); setStatsSemFolder(null); setStatsDivFilter('ALL'); setPresentFacultyFolder(null); setPresentSessionFolder(null); setAbsentFacultyFolder(null); setAbsentSessionFolder(null); }} 
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                  >
                    Close Panel
                  </button>
                </div>

                {activeStatsList === 'total' && (
                  statsSemFolder === null ? (
                    <div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                        Click on any Semester Folder to view registered students for that semester.
                      </p>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                        gap: '16px',
                        marginTop: '16px'
                      }}>
                        {registeredSemesters.length === 0 ? (
                          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No registered student accounts found.
                          </div>
                        ) : (
                          registeredSemesters.map(sem => {
                          const semStudents = students.filter(s => String(s.semester) === String(sem));
                          const semDivs = Array.from(new Set(
                            semStudents.filter(s => s.division && s.division.trim() !== '').map(s => String(s.division).trim().toUpperCase())
                          )).sort();
                          return (
                            <div 
                              key={sem} 
                              onClick={() => { setStatsSemFolder(String(sem)); setStatsDivFilter('ALL'); }}
                              style={{
                                background: 'rgba(59, 130, 246, 0.05)',
                                border: '1.5px solid rgba(59, 130, 246, 0.22)',
                                borderRadius: '16px',
                                padding: '18px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.25)';
                                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.22)';
                              }}
                            >
                              <div>
                                {/* Top Header Row */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Folder size={22} color="#3b82f6" />
                                    <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                      Sem {sem} Folder
                                    </span>
                                  </div>
                                  <span style={{
                                    background: 'rgba(59, 130, 246, 0.15)',
                                    color: '#3b82f6',
                                    borderRadius: '12px',
                                    padding: '4px 10px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700'
                                  }}>
                                    {semStudents.length} Students
                                  </span>
                                </div>

                                {/* Middle Info */}
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Semester {sem} Student List
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60a5fa', marginBottom: '14px' }}>
                                  {semDivs.length > 0 ? `Divisions: Div ${semDivs.join(', Div ')}` : 'No Divisions Available'}
                                </div>
                              </div>

                              {/* Bottom Button matching Photo 2 design in BLUE theme */}
                              <button
                                style={{
                                  width: '100%',
                                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '10px',
                                  padding: '10px',
                                  fontWeight: '600',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Folder size={16} color="#ffffff" />
                                Open Sem {sem} Folder
                              </button>
                            </div>
                          );
                        })
                      )}
                      </div>
                    </div>
                  ) : (() => {
                    const semStudentsAll = students.filter(s => String(s.semester) === String(statsSemFolder));
                    const divSet = new Set(semStudentsAll.filter(s => s.division && String(s.division).trim() !== '').map(s => String(s.division).trim().toUpperCase()));
                    const divList = ['ALL', ...Array.from(divSet).sort()];
                    const hasDivisions = divSet.size > 0;

                    const filteredStudents = semStudentsAll.filter(s => {
                      if (!hasDivisions || statsDivFilter === 'ALL') return true;
                      return s.division && String(s.division).trim().toUpperCase() === statsDivFilter;
                    });

                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setStatsSemFolder(null)}
                            className="btn btn-secondary"
                            style={{ gap: '8px', fontSize: '0.82rem', padding: '6px 14px' }}
                          >
                            ← All Semesters
                          </button>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                            Semester {statsSemFolder} Directory ({filteredStudents.length} Students)
                          </h4>
                        </div>

                        {hasDivisions && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                            {divList.map(div => (
                              <button
                                key={div}
                                onClick={() => setStatsDivFilter(div)}
                                style={{
                                  padding: '6px 16px', borderRadius: '20px', fontSize: '0.82rem',
                                  fontWeight: '600', cursor: 'pointer', border: 'none',
                                  background: statsDivFilter === div
                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                    : 'rgba(255,255,255,0.05)',
                                  color: statsDivFilter === div ? '#fff' : 'var(--text-secondary)',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {div === 'ALL' ? 'All Divisions' : `Division ${div}`}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th>Roll No</th>
                                <th>Enrollment No</th>
                                <th>Name</th>
                                <th>Course</th>
                                {hasDivisions && <th>Division</th>}
                                <th>Mobile No</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredStudents.length === 0 ? (
                                <tr><td colSpan={hasDivisions ? 6 : 5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No students found for this semester/division.</td></tr>
                              ) : (
                                filteredStudents.map(s => (
                                  <tr key={s.id}>
                                    <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{s.roll_no || '-'}</td>
                                    <td>{s.enrollment_no}</td>
                                    <td style={{ fontWeight: '600' }}>{s.name}</td>
                                    <td>{s.course}</td>
                                    {hasDivisions && (
                                      <td>
                                        {s.division ? (
                                          <span style={{ padding: '2px 8px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '6px', color: '#60a5fa', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            Div {s.division}
                                          </span>
                                        ) : '-'}
                                      </td>
                                    )}
                                    <td>{s.mobile}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()
                )}

                {activeStatsList === 'present' && (() => {

                  // Gather active faculty map ONLY FOR TODAY'S generated sessions and logs
                  const presentFacultyMap = new Map();

                  // 1. From today's QR history ONLY
                  (qrSessionHistory || []).forEach(sess => {
                    if (isTodaySession(sess.date, sess.created_at)) {
                      const facName = sess.faculty?.name || sess.faculty_name || 'Faculty';
                      if (facName && !presentFacultyMap.has(facName)) {
                        presentFacultyMap.set(facName, { name: facName, logs: [] });
                      }
                    }
                  });

                  // 2. From Live Logs for TODAY ONLY
                  const presentLogsAll = (liveLogs || []).filter(l => l.status === 'Success' && isTodaySession(l.date, l.time));
                  presentLogsAll.forEach(log => {
                    const facName = log.faculty_name || 'Faculty';
                    if (!presentFacultyMap.has(facName)) {
                      presentFacultyMap.set(facName, { name: facName, logs: [] });
                    }
                    const facObj = presentFacultyMap.get(facName);
                    if (facObj && Array.isArray(facObj.logs)) {
                      facObj.logs.push(log);
                    }
                  });

                  const facultyList = Array.from(presentFacultyMap.values());

                  // LEVEL 1: Grid of Faculty Folders
                  if (!presentFacultyFolder) {
                    return (
                      <div style={{ padding: '10px 0' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                          Select a Faculty Folder to view their generated session folders for today.
                        </p>
                        {facultyList.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Folder size={48} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                            <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary)' }}>No faculty has generated an attendance session today yet.</p>
                            <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>Only faculties who generate a session today will have a folder created here.</p>
                          </div>
                        ) : (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '16px'
                          }}>
                            {facultyList.map(fac => {
                              // Deduplicate logs for overall count
                              const uniqueLogs = [];
                              fac.logs.forEach(l => {
                                if (!uniqueLogs.some(u => (u.student_id && String(u.student_id) === String(l.student_id)) || (u.enrollment_no && u.enrollment_no === l.enrollment_no))) {
                                  uniqueLogs.push(l);
                                }
                              });

                              return (
                                <div
                                  key={fac.name}
                                  onClick={() => { setPresentFacultyFolder(fac.name); setPresentSessionFolder(null); setPresentSearchName(''); setPresentSearchRoll(''); }}
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.05)',
                                    border: '1.5px solid rgba(16, 185, 129, 0.22)',
                                    borderRadius: '16px',
                                    padding: '18px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.25)';
                                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.05)';
                                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.22)';
                                  }}
                                >
                                  <div>
                                    {/* Top Header Row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Folder size={22} color="#10b981" />
                                        <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                          {fac.name}
                                        </span>
                                      </div>
                                      <span style={{
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        color: '#10b981',
                                        borderRadius: '12px',
                                        padding: '4px 10px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700'
                                      }}>
                                        ✓ {uniqueLogs.length} Present
                                      </span>
                                    </div>

                                    {/* Middle Info */}
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                      Faculty Attendance Folder
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#4ade80', marginBottom: '14px' }}>
                                      ✓ Active Sessions Generated Today
                                    </div>
                                  </div>

                                  {/* Bottom Button matching Photo 2 design in GREEN theme */}
                                  <button
                                    style={{
                                      width: '100%',
                                      background: 'linear-gradient(135deg, #10b981, #059669)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '10px',
                                      padding: '10px',
                                      fontWeight: '600',
                                      fontSize: '0.85rem',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Folder size={16} color="#ffffff" />
                                    Open {fac.name}'s Folder
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }



                  // Build Session List STRICTLY FOR TODAY'S SESSIONS of selected Faculty
                  const facSessionsMap = new Map();

                  // 1. From QR & OTP Sessions created TODAY
                  (qrSessionHistory || []).forEach(sess => {
                    const fName = sess.faculty_name || sess.faculty?.name || 'Faculty';
                    if (fName && presentFacultyFolder && fName.trim().toLowerCase() === presentFacultyFolder.trim().toLowerCase()) {
                      const key = sess.id;
                      if (!facSessionsMap.has(key)) {
                        const rawQrId = sess.qr_session_id || (typeof sess.id === 'string' && sess.id.startsWith('qr_') ? sess.id.replace('qr_', '') : (typeof sess.id === 'number' ? sess.id : null));
                        const rawOtpId = sess.otp_id || (typeof sess.id === 'string' && sess.id.startsWith('otp_') ? sess.id.replace('otp_', '') : null);

                        facSessionsMap.set(key, {
                          id: key,
                          qr_session_id: rawQrId,
                          otp_id: rawOtpId,
                          semester: sess.semester,
                          division: sess.division,
                          createdAt: sess.created_at || Date.now()
                        });
                      }
                    }
                  });

                  // 2. From Live Logs for TODAY
                  presentLogsAll.forEach(log => {
                    const fName = log.faculty_name || 'Faculty';
                    if (fName && presentFacultyFolder && fName.trim().toLowerCase() === presentFacultyFolder.trim().toLowerCase()) {
                      const key = log.qr_session_id 
                        ? `qr_${log.qr_session_id}` 
                        : (log.otp_id ? `otp_${log.otp_id}` : `manual_today_${log.semester}_${log.division || 'ALL'}`);
                      
                      if (!facSessionsMap.has(key)) {
                        facSessionsMap.set(key, {
                          id: key,
                          qr_session_id: log.qr_session_id || null,
                          otp_id: log.otp_id || null,
                          semester: log.semester,
                          division: log.division,
                          createdAt: log.time || Date.now()
                        });
                      }
                    }
                  });

                  // Sort today's sessions in chronological order (Session 1, Session 2...)
                  const facSessionsList = Array.from(facSessionsMap.values()).sort((a, b) => {
                    const timeA = new Date(a.createdAt).getTime() || 0;
                    const timeB = new Date(b.createdAt).getTime() || 0;
                    return timeA - timeB;
                  });

                  // Pre-calculate logs and counts for each session pill button (Strict Session Isolation)
                  const facSessionsWithLogs = facSessionsList.map(sess => {
                    const sessLogs = presentLogsAll.filter(l => {
                      const logFacName = l.faculty_name || (l.qr_session && l.qr_session.faculty && l.qr_session.faculty.name) || (l.otp && l.otp.faculty && l.otp.faculty.name);
                      const isFacMatch = !logFacName || !presentFacultyFolder || logFacName.trim().toLowerCase() === presentFacultyFolder.trim().toLowerCase() || logFacName.includes('Manual');
                      if (!isFacMatch) return false;

                      // 1. Direct QR session ID match
                      if (sess.qr_session_id && l.qr_session_id) {
                        return String(l.qr_session_id) === String(sess.qr_session_id);
                      }
                      
                      // 2. Direct OTP session ID match
                      if (sess.otp_id && l.otp_id) {
                        return String(l.otp_id) === String(sess.otp_id);
                      }

                      // If session is bound to a specific QR or OTP session, but log didn't match it above, reject!
                      if (sess.qr_session_id || sess.otp_id) {
                        return false;
                      }

                      // If log is bound to a specific QR or OTP session, but session is not that QR/OTP session, reject!
                      if (l.qr_session_id || l.otp_id) {
                        return false;
                      }

                      // 3. Match by Semester & Division for unassigned manual logs only when both session and log have no QR/OTP ID
                      const semMatches = !sess.semester || String(l.semester) === String(sess.semester);
                      const divMatches = !sess.division || sess.division === 'ALL' || (l.division && String(l.division).toUpperCase() === String(sess.division).toUpperCase());
                      
                      return semMatches && divMatches;
                    });

                    // Deduplicate students for this session
                    const uniqueSessLogs = [];
                    sessLogs.forEach(l => {
                      if (!uniqueSessLogs.some(u => (u.student_id && String(u.student_id) === String(l.student_id)) || (u.enrollment_no && u.enrollment_no === l.enrollment_no))) {
                        uniqueSessLogs.push(l);
                      }
                    });

                    return {
                      ...sess,
                      logs: uniqueSessLogs,
                      count: uniqueSessLogs.length
                    };
                  });

                  // Auto-select session with present students by default
                  let selectedSessId = presentSessionFolder;
                  if (!selectedSessId && facSessionsWithLogs.length > 0) {
                    const sessWithStudents = facSessionsWithLogs.find(s => s.count > 0);
                    selectedSessId = sessWithStudents ? sessWithStudents.id : facSessionsWithLogs[0].id;
                  }

                  const selectedSessObj = facSessionsWithLogs.find(s => String(s.id) === String(selectedSessId));
                  const sessIdx = facSessionsWithLogs.findIndex(s => String(s.id) === String(selectedSessId));
                  const uniqueSessLogs = selectedSessObj ? selectedSessObj.logs : (facSessionsWithLogs[0]?.logs || []);

                  const filteredLogs = uniqueSessLogs;

                  return (
                    <div style={{ padding: '10px 0' }}>
                      {/* Breadcrumb & Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => { setPresentFacultyFolder(null); setPresentSessionFolder(null); }}
                          className="btn btn-secondary"
                          style={{ gap: '8px', fontSize: '0.82rem', padding: '6px 14px' }}
                        >
                          ← All Faculty Folders
                        </button>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                          Faculty: {presentFacultyFolder} — Today's Attendance
                        </h4>
                        <span style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: '600', marginLeft: 'auto' }}>
                          {uniqueSessLogs.length} Students Present {sessIdx >= 0 ? `(Session ${sessIdx + 1}${selectedSessObj?.semester ? ' - Sem ' + selectedSessObj.semester : ''}${selectedSessObj?.division ? ' Div ' + selectedSessObj.division : ''})` : ''}
                        </span>
                      </div>

                      {/* SESSION PILL BUTTONS (WITH PRESENT COUNT & SMART AUTO-SELECTION!) */}
                      {facSessionsWithLogs.length > 0 ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                          {facSessionsWithLogs.map((sess, idx) => {
                            const isSelected = sess.id === selectedSessId;
                            const semDivLabel = sess.semester ? `(Sem ${sess.semester}${sess.division ? ' - Div ' + sess.division : ''})` : '';
                            return (
                              <button
                                key={sess.id}
                                onClick={() => setPresentSessionFolder(sess.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 18px',
                                  borderRadius: '12px',
                                  fontSize: '0.88rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  background: isSelected 
                                    ? 'linear-gradient(135deg, #a855f7, #7e22ce)' 
                                    : 'rgba(255, 255, 255, 0.08)',
                                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                                  border: isSelected ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.15)',
                                  boxShadow: isSelected ? '0 4px 14px rgba(168, 85, 247, 0.4)' : 'none'
                                }}
                              >
                                <Folder size={16} color={isSelected ? '#ffffff' : '#f59e0b'} />
                                Session {idx + 1} {semDivLabel}
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(34, 197, 94, 0.15)',
                                  color: isSelected ? '#ffffff' : '#4ade80'
                                }}>
                                  {sess.count} Present
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.85rem' }}>
                          No sessions generated today yet for this faculty.
                        </div>
                      )}

                      {/* Target Session Banner Info */}
                      {selectedSessObj && (() => {
                        const getFacSubj = () => {
                          const facObj = (faculties || []).find(f => f.name && f.name.trim().toLowerCase() === (presentFacultyFolder || '').trim().toLowerCase());
                          if (!facObj) return null;
                          let subs = facObj.subjects;
                          if (typeof subs === 'string') {
                            try { subs = JSON.parse(subs); } catch(e) { subs = []; }
                          }
                          if (!Array.isArray(subs)) return null;
                          const targetSemNum = String(selectedSessObj?.semester || '').replace(/\D/g, '');
                          const match = subs.find(s => s && String(s.semester || '').replace(/\D/g, '') === targetSemNum);
                          return match ? (match.shortName || match.subjectName) : null;
                        };

                        const displaySubject = selectedSessObj?.subject || 
                          (uniqueSessLogs && uniqueSessLogs.find(l => l.subject)?.subject) ||
                          getFacSubj() ||
                          'SADD';

                        return (
                          <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            marginBottom: '16px',
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'space-between',
                            gap: '10px'
                          }}>
                            <div>
                              <strong>Targeted Class:</strong> Sem {selectedSessObj.semester || 'N/A'}{' '}
                              {selectedSessObj.division && String(selectedSessObj.division).trim().toUpperCase() !== 'ALL'
                                ? `(Division ${selectedSessObj.division})`
                                : '(All Divisions)'}
                            </div>
                            <div style={{ fontWeight: '700', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                              📚 {displaySubject}
                            </div>
                          </div>
                        );
                      })()}



                      {/* Student Attendance List Cards (Matching Photo 2 Theme!) */}
                      {filteredLogs.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontStyle: 'italic' }}>
                          No present students found for {sessIdx >= 0 ? `Session ${sessIdx + 1}` : 'this session'}.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
                          {filteredLogs.map((l, i) => (
                            <div
                              key={l.id || i}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                transition: 'transform 0.15s ease'
                              }}
                            >
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'rgba(59, 130, 246, 0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.88rem',
                                fontWeight: '700',
                                color: '#60a5fa',
                                flexShrink: 0
                              }}>
                                {i + 1}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                                  {l.name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {l.roll_no ? `Roll: ${l.roll_no} • ` : ''}{l.course || 'BCA'} Sem {l.semester}{l.division ? ` (Div ${l.division})` : ''}
                                </div>
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.82rem', color: '#60a5fa', fontWeight: '700' }}>
                                  ✓ Present
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {l.time || '-'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeStatsList === 'absent' && (() => {

                  // Gather active faculty map ONLY FOR TODAY'S generated sessions and logs
                  const absentFacultyMap = new Map();

                  // 1. From today's QR history ONLY
                  (qrSessionHistory || []).forEach(sess => {
                    if (isTodaySession(sess.date, sess.created_at)) {
                      const facName = sess.faculty?.name || sess.faculty_name || 'Faculty';
                      if (facName && !absentFacultyMap.has(facName)) {
                        absentFacultyMap.set(facName, { name: facName, sessions: [] });
                      }
                    }
                  });

                  // 2. From Live Logs for TODAY ONLY
                  const todayLogsAll = (liveLogs || []).filter(l => isTodaySession(l.date, l.time));
                  todayLogsAll.forEach(log => {
                    const facName = log.faculty_name || 'Faculty';
                    if (!absentFacultyMap.has(facName)) {
                      absentFacultyMap.set(facName, { name: facName, sessions: [] });
                    }
                  });

                  const facultyList = Array.from(absentFacultyMap.values());

                  // LEVEL 1: Grid of Faculty Folders for Absent Today
                  if (!absentFacultyFolder) {
                    return (
                      <div style={{ padding: '10px 0' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                          Select a Faculty Folder to view absent student records for today's generated sessions.
                        </p>
                        {facultyList.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Folder size={48} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                            <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary)' }}>No faculty has generated an attendance session today yet.</p>
                            <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>Only faculties who generate a session today will have a folder created here.</p>
                          </div>
                        ) : (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '16px'
                          }}>
                            {facultyList.map(fac => {
                              // Calculate overall absent student count for this faculty today
                              let totalAbsentCount = 0;
                              const facSessionsMap = new Map();

                              (qrSessionHistory || []).forEach(sess => {
                                const fName = sess.faculty_name || sess.faculty?.name || 'Faculty';
                                if (fName && fName.trim().toLowerCase() === fac.name.trim().toLowerCase() && isTodaySession(sess.date, sess.created_at)) {
                                  const key = sess.id;
                                  if (!facSessionsMap.has(key)) {
                                    facSessionsMap.set(key, sess);
                                  }
                                }
                              });

                              todayLogsAll.forEach(log => {
                                const fName = log.faculty_name || 'Faculty';
                                if (fName && fName.trim().toLowerCase() === fac.name.trim().toLowerCase()) {
                                  const key = log.qr_session_id 
                                    ? `qr_${log.qr_session_id}` 
                                    : (log.otp_id ? `otp_${log.otp_id}` : `manual_today_${log.semester}_${log.division || 'ALL'}`);
                                  if (!facSessionsMap.has(key)) {
                                    facSessionsMap.set(key, {
                                      id: key,
                                      semester: log.semester,
                                      division: log.division
                                    });
                                  }
                                }
                              });

                              Array.from(facSessionsMap.values()).forEach(sess => {
                                const sessLogs = todayLogsAll.filter(l => {
                                  if (sess.qr_session_id && l.qr_session_id) return String(l.qr_session_id) === String(sess.qr_session_id);
                                  if (sess.otp_id && l.otp_id) return String(l.otp_id) === String(sess.otp_id);
                                  if (sess.qr_session_id || sess.otp_id || l.qr_session_id || l.otp_id) return false;
                                  return (!sess.semester || String(l.semester) === String(sess.semester)) &&
                                         (!sess.division || sess.division === 'ALL' || String(l.division).toUpperCase() === String(sess.division).toUpperCase());
                                });
                                const presentCount = sessLogs.filter(l => l.status === 'Success').length;
                                const targetSemNum = String(sess.semester || '').replace(/\D/g, '');
                                const targetClassCount = (students || []).filter(st => {
                                  const sSemNum = String(st.semester || '').replace(/\D/g, '');
                                  if (targetSemNum && sSemNum !== targetSemNum) return false;
                                  return isDivMatch(st.division, sess.division);
                                }).length;
                                totalAbsentCount += Math.max(0, targetClassCount - presentCount);
                              });

                              return (
                                <div
                                  key={fac.name}
                                  onClick={() => { setAbsentFacultyFolder(fac.name); setAbsentSessionFolder(null); setAbsentSearchName(''); setAbsentSearchRoll(''); }}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    border: '1.5px solid rgba(239, 68, 68, 0.22)',
                                    borderRadius: '16px',
                                    padding: '18px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(239, 68, 68, 0.25)';
                                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.05)';
                                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.22)';
                                  }}
                                >
                                  <div>
                                    {/* Top Header Row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Folder size={22} color="#ef4444" />
                                        <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                          {fac.name}
                                        </span>
                                      </div>
                                      <span style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        borderRadius: '12px',
                                        padding: '4px 10px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700'
                                      }}>
                                        ✕ {totalAbsentCount} Absent
                                      </span>
                                    </div>

                                    {/* Middle Info */}
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                      Faculty Absentee Folder
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#f87171', marginBottom: '14px' }}>
                                      ✕ Sessions Conducted Today
                                    </div>
                                  </div>

                                  {/* Bottom Button in RED theme */}
                                  <button
                                    style={{
                                      width: '100%',
                                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '10px',
                                      padding: '10px',
                                      fontWeight: '600',
                                      fontSize: '0.85rem',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px',
                                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Folder size={16} color="#ffffff" />
                                    Open {fac.name}'s Folder
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // LEVEL 2: Build Session List STRICTLY FOR TODAY'S SESSIONS of selected Faculty
                  const facSessionsMap = new Map();

                  (qrSessionHistory || []).forEach(sess => {
                    const fName = sess.faculty_name || sess.faculty?.name || 'Faculty';
                    if (fName && absentFacultyFolder && fName.trim().toLowerCase() === absentFacultyFolder.trim().toLowerCase() && isTodaySession(sess.date, sess.created_at)) {
                      const key = sess.id;
                      if (!facSessionsMap.has(key)) {
                        const rawQrId = sess.qr_session_id || (typeof sess.id === 'string' && sess.id.startsWith('qr_') ? sess.id.replace('qr_', '') : (typeof sess.id === 'number' ? sess.id : null));
                        const rawOtpId = sess.otp_id || (typeof sess.id === 'string' && sess.id.startsWith('otp_') ? sess.id.replace('otp_', '') : null);

                        facSessionsMap.set(key, {
                          id: key,
                          qr_session_id: rawQrId,
                          otp_id: rawOtpId,
                          semester: sess.semester,
                          division: sess.division,
                          createdAt: sess.created_at || Date.now()
                        });
                      }
                    }
                  });

                  todayLogsAll.forEach(log => {
                    const fName = log.faculty_name || 'Faculty';
                    if (fName && absentFacultyFolder && fName.trim().toLowerCase() === absentFacultyFolder.trim().toLowerCase()) {
                      const key = log.qr_session_id 
                        ? `qr_${log.qr_session_id}` 
                        : (log.otp_id ? `otp_${log.otp_id}` : `manual_today_${log.semester}_${log.division || 'ALL'}`);
                      
                      if (!facSessionsMap.has(key)) {
                        facSessionsMap.set(key, {
                          id: key,
                          qr_session_id: log.qr_session_id || null,
                          otp_id: log.otp_id || null,
                          semester: log.semester,
                          division: log.division,
                          createdAt: log.time || Date.now()
                        });
                      }
                    }
                  });

                  const facSessionsList = Array.from(facSessionsMap.values()).sort((a, b) => {
                    const timeA = new Date(a.createdAt).getTime() || 0;
                    const timeB = new Date(b.createdAt).getTime() || 0;
                    return timeA - timeB;
                  });

                  // Pre-calculate absent student list for each session
                  const facSessionsWithLogs = facSessionsList.map(sess => {
                    const sessLogs = todayLogsAll.filter(l => {
                      const logFacName = l.faculty_name || (l.qr_session && l.qr_session.faculty && l.qr_session.faculty.name) || (l.otp && l.otp.faculty && l.otp.faculty.name);
                      const isFacMatch = !logFacName || !absentFacultyFolder || logFacName.trim().toLowerCase() === absentFacultyFolder.trim().toLowerCase() || logFacName.includes('Manual');
                      if (!isFacMatch) return false;

                      if (sess.qr_session_id && l.qr_session_id) return String(l.qr_session_id) === String(sess.qr_session_id);
                      if (sess.otp_id && l.otp_id) return String(l.otp_id) === String(sess.otp_id);
                      if (sess.qr_session_id || sess.otp_id || l.qr_session_id || l.otp_id) return false;

                      const semMatches = !sess.semester || String(l.semester) === String(sess.semester);
                      const divMatches = !sess.division || sess.division === 'ALL' || (l.division && String(l.division).toUpperCase() === String(sess.division).toUpperCase());
                      return semMatches && divMatches;
                    });

                    // Present student IDs / enrollments
                    const presentSet = new Set(
                      sessLogs.filter(l => l.status === 'Success').map(l => l.enrollment_no || String(l.student_id))
                    );

                    // Target class students
                    const targetSemNum = String(sess.semester || '').replace(/\D/g, '');
                    const classStudents = (students || []).filter(st => {
                      const sSemNum = String(st.semester || '').replace(/\D/g, '');
                      if (targetSemNum && sSemNum !== targetSemNum) return false;
                      return isDivMatch(st.division, sess.division);
                    });

                    const absentStudents = classStudents.filter(st => 
                      !presentSet.has(st.enrollment_no) && !presentSet.has(String(st.id))
                    );

                    return {
                      ...sess,
                      absentStudents,
                      count: absentStudents.length
                    };
                  });

                  // Auto-select session with absent students by default
                  let selectedSessId = absentSessionFolder;
                  if (!selectedSessId && facSessionsWithLogs.length > 0) {
                    const sessWithAbsents = facSessionsWithLogs.find(s => s.count > 0);
                    selectedSessId = sessWithAbsents ? sessWithAbsents.id : facSessionsWithLogs[0].id;
                  }

                  const selectedSessObj = facSessionsWithLogs.find(s => String(s.id) === String(selectedSessId));
                  const sessIdx = facSessionsWithLogs.findIndex(s => String(s.id) === String(selectedSessId));
                  const currentAbsentStudents = selectedSessObj ? selectedSessObj.absentStudents : (facSessionsWithLogs[0]?.absentStudents || []);

                  const filteredAbsents = currentAbsentStudents;

                  return (
                    <div style={{ padding: '10px 0' }}>
                      {/* Breadcrumb & Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => { setAbsentFacultyFolder(null); setAbsentSessionFolder(null); }}
                          className="btn btn-secondary"
                          style={{ gap: '8px', fontSize: '0.82rem', padding: '6px 14px' }}
                        >
                          ← All Faculty Folders
                        </button>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                          Faculty: {absentFacultyFolder} — Today's Absent Students
                        </h4>
                        <span style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: '600', marginLeft: 'auto' }}>
                          ✕ {currentAbsentStudents.length} Students Absent {sessIdx >= 0 ? `(Session ${sessIdx + 1}${selectedSessObj?.semester ? ' - Sem ' + selectedSessObj.semester : ''}${selectedSessObj?.division ? ' Div ' + selectedSessObj.division : ''})` : ''}
                        </span>
                      </div>

                      {/* SESSION PILL BUTTONS */}
                      {facSessionsWithLogs.length > 0 ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                          {facSessionsWithLogs.map((sess, idx) => {
                            const isSelected = sess.id === selectedSessId;
                            const semDivLabel = sess.semester ? `(Sem ${sess.semester}${sess.division ? ' - Div ' + sess.division : ''})` : '';
                            return (
                              <button
                                key={sess.id}
                                onClick={() => setAbsentSessionFolder(sess.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 18px',
                                  borderRadius: '12px',
                                  fontSize: '0.88rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  background: isSelected 
                                    ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                                    : 'rgba(255, 255, 255, 0.08)',
                                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                                  border: isSelected ? '1px solid #f87171' : '1px solid rgba(255, 255, 255, 0.15)',
                                  boxShadow: isSelected ? '0 4px 14px rgba(239, 68, 68, 0.4)' : 'none'
                                }}
                              >
                                <Folder size={16} color={isSelected ? '#ffffff' : '#ef4444'} />
                                Session {idx + 1} {semDivLabel}
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isSelected ? '#ffffff' : '#f87171'
                                }}>
                                  ✕ {sess.count} Absent
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.85rem' }}>
                          No sessions generated today yet for this faculty.
                        </div>
                      )}

                      {/* Target Session Banner Info */}
                      {selectedSessObj && (() => {
                        const getFacSubj = () => {
                          const facObj = (faculties || []).find(f => f.name && f.name.trim().toLowerCase() === (absentFacultyFolder || '').trim().toLowerCase());
                          if (!facObj) return null;
                          let subs = facObj.subjects;
                          if (typeof subs === 'string') {
                            try { subs = JSON.parse(subs); } catch(e) { subs = []; }
                          }
                          if (!Array.isArray(subs)) return null;
                          const targetSemNum = String(selectedSessObj?.semester || '').replace(/\D/g, '');
                          const match = subs.find(s => s && String(s.semester || '').replace(/\D/g, '') === targetSemNum);
                          return match ? (match.shortName || match.subjectName) : null;
                        };

                        const displaySubject = selectedSessObj?.subject || getFacSubj() || 'SADD';

                        return (
                          <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            marginBottom: '16px',
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px'
                          }}>
                            <div>
                              <strong>Targeted Class:</strong> Sem {selectedSessObj.semester || 'N/A'}{' '}
                              {selectedSessObj.division && String(selectedSessObj.division).trim().toUpperCase() !== 'ALL'
                                ? `(Division ${selectedSessObj.division})`
                                : '(All Divisions)'}
                            </div>
                            <div style={{ fontWeight: '700', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                              📚 {displaySubject}
                            </div>
                          </div>
                        );
                      })()}



                      {/* Student Absentee List Cards */}
                      {filteredAbsents.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontStyle: 'italic' }}>
                          No absent students found for {sessIdx >= 0 ? `Session ${sessIdx + 1}` : 'this session'} (100% Attendance!).
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
                          {filteredAbsents.map((s, i) => (
                            <div
                              key={s.id || s.enrollment_no || i}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                transition: 'transform 0.15s ease'
                              }}
                            >
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.88rem',
                                fontWeight: '700',
                                color: '#f87171',
                                flexShrink: 0
                              }}>
                                {i + 1}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                                  {s.name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {s.roll_no ? `Roll: ${s.roll_no} • ` : ''}{s.course || 'BCA'} Sem {s.semester}{s.division ? ` (Div ${s.division})` : ''}
                                </div>
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: '700' }}>
                                  ✕ Absent
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {s.mobile || 'No Mobile'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(activeStatsList === 'total_faculty' || activeStatsList === 'qrsessions') && (
                  <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <table className="custom-table">
                      {activeStatsList === 'total_faculty' && (
                        <>
                          <thead>
                            <tr>
                              <th>Employee ID</th>
                              <th>Name</th>
                              <th>Department</th>
                              <th>Mobile No</th>
                            </tr>
                          </thead>
                          <tbody>
                            {faculties.length === 0 ? (
                              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No faculty members registered.</td></tr>
                            ) : (
                              faculties.map(f => (
                                <tr key={f.id}>
                                  <td>{f.employee_no}</td>
                                  <td style={{ fontWeight: '600' }}>{f.name}</td>
                                  <td>{f.department}</td>
                                  <td>{f.mobile}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </>
                      )}

                      {activeStatsList === 'absent' && (
                        <>
                          <thead>
                            <tr>
                              <th>Enrollment No</th>
                              <th>Name</th>
                              <th>Course</th>
                              <th>Semester</th>
                              <th>Mobile No</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const presentEnrollments = new Set(liveLogs.filter(log => log.status === 'Success').map(log => log.enrollment_no));
                              const absentStudents = students.filter(s => !presentEnrollments.has(s.enrollment_no));
                              if (absentStudents.length === 0) {
                                return <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>All students have checked in today!</td></tr>;
                              }
                              return absentStudents.map(s => (
                                <tr key={s.id}>
                                  <td>{s.enrollment_no}</td>
                                  <td>{s.name}</td>
                                  <td>{s.course}</td>
                                  <td>Sem {s.semester}</td>
                                  <td>{s.mobile}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </>
                      )}

                      {activeStatsList === 'qrsessions' && (
                        <>
                          <thead>
                            <tr>
                              <th>Session ID</th>
                              <th>Faculty Name</th>
                              <th>Time Created</th>
                              <th>Time Expires</th>
                              <th>Present Students</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qrSessionHistory.length === 0 ? (
                              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No QR sessions generated today yet.</td></tr>
                            ) : (
                              qrSessionHistory.map(sess => (
                                <tr key={sess.id}>
                                  <td>#{sess.id}</td>
                                  <td style={{ fontWeight: '600', color: '#eab308' }}>{sess.faculty_name || 'Admin'}</td>
                                  <td>{new Date(sess.created_at).toLocaleTimeString()}</td>
                                  <td>{new Date(sess.expires_at).toLocaleTimeString()}</td>
                                  <td>
                                    <span style={{ fontWeight: 'bold', color: '#10b981' }}>
                                      {sess.presentCount || 0} Present
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </>
                      )}
                    </table>
                  </div>
                )}
              </div>
            )}
{/* OTP Active & Live Monitor Row */}
            <div style={styles.dashboardRow}>
              {/* All Attendance Records Directory (Matching Faculty Panel Photo 2!) */}
              <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1, width: '100%', padding: isMobile ? '12px 8px' : '28px' }}>
                <div style={{ marginBottom: '16px' }}>
                  {/* Line 1: Back Button (Top Left) */}
                  {/* Header Row: Back Button + Title & Subtitle (Left) & Select Date + Reset Controls (Right) */}
                  <div className="mobile-stack-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      {selectedSemFolder !== null && !selectedSessionFolder && (
                        <button
                          onClick={() => {
                            setSelectedSemFolder(null);
                            setSelectedSessionFolder(null);
                            setFolderSearchDate(new Date().toISOString().split('T')[0]);
                            setFolderDivFilter('ALL');
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '5px 14px', fontSize: '0.82rem', flexShrink: 0, marginTop: '2px' }}
                        >
                          ← Back
                        </button>
                      )}
                      {selectedSessionFolder && (
                        <button
                          onClick={() => setSelectedSessionFolder(null)}
                          className="btn btn-secondary"
                          style={{ padding: '5px 14px', fontSize: '0.82rem', flexShrink: 0, marginTop: '2px' }}
                        >
                          ← Back
                        </button>
                      )}
                      <Folder size={22} color="#f59e0b" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        <h3 style={{ ...styles.cardTitle, marginBottom: '2px', lineHeight: 1.2 }}>
                          {selectedSemFolder === null
                            ? 'Attendance Logs'
                            : (selectedSessionFolder
                                ? `${selectedSessionFolder.title} Directory (Sem ${selectedSemFolder})`
                                : `Semester ${selectedSemFolder} Attendance Directory`
                              )
                          }
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0', marginBottom: '0' }}>
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {selectedSemFolder === null ? (
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📅 Date Archive
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={16} color="#f59e0b" />
                          <label style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)' }}>Select Date:</label>
                          <input
                            type="date"
                            value={folderSearchDate}
                            onChange={(e) => {
                              setFolderSearchDate(e.target.value);
                              setSelectedSessionFolder(null);
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-light)',
                              background: 'rgba(255,255,255,0.05)',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem',
                              cursor: 'pointer'
                            }}
                          />
                        </div>
                      )}
                      {selectedSemFolder === null ? (
                        <button
                          className="btn btn-secondary"
                          onClick={handleReloadDirectory}
                          disabled={directoryReloading}
                          style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '6px' }}
                        >
                          <RefreshCw size={12} className={directoryReloading ? 'spin-icon' : ''} />
                          {directoryReloading ? 'Reloading...' : 'Reload'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setFolderSearchDate(new Date().toISOString().split('T')[0]);
                            setSelectedSessionFolder(null);
                            handleReloadDirectory();
                          }}
                          disabled={directoryReloading}
                          style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '6px' }}
                          title="Reset Date to Today"
                        >
                          <RotateCcw size={12} className={directoryReloading ? 'spin-icon' : ''} />
                          {directoryReloading ? 'Resetting...' : 'Reset'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {selectedSemFolder === null ? (
                  <>
                    {/* Semester Folder Cards Grid (Only Semesters with available data) */}
                    <div className="semester-folder-grid" style={{ display: 'grid', width: '100%', boxSizing: 'border-box', marginTop: '16px' }}>
                      {availableSemesters.length === 0 ? (
                        <div style={{
                          gridColumn: '1 / -1',
                          textAlign: 'center',
                          padding: '40px 20px',
                          background: 'rgba(245, 158, 11, 0.04)',
                          border: '1.5px dashed rgba(245, 158, 11, 0.25)',
                          borderRadius: '16px',
                          color: 'var(--text-muted)'
                        }}>
                          <Folder size={42} color="#f59e0b" style={{ marginBottom: '12px', opacity: 0.6 }} />
                          <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                            No Semester Data Available
                          </div>
                          <div style={{ fontSize: '0.85rem' }}>
                            Semester folders will automatically be created here as soon as student records, faculty subjects, or attendance logs are added to the system.
                          </div>
                        </div>
                      ) : (
                        availableSemesters.map(sem => {
                          return (
                            <div
                              key={sem}
                              onClick={() => { setSelectedSemFolder(String(sem)); setSelectedFacultyFolder(null); setSelectedSessionFolder(null); setFolderDivFilter('ALL'); }}
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Folder size={22} color="#f59e0b" style={{ flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                    Sem {sem} Folder
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    Click to view date & session archives
                                  </div>
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
                  /* Semester Date Filter & Session Folders View (Direct Access Without Faculty Folders) */
                  <>




                    {/* View 1: Session Folders Grid for Selected Semester & Date */}
                    {!selectedSessionFolder ? (
                      <div style={{ marginTop: '22px' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Folder size={18} color="#f59e0b" />
                          Sessions Conducted
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
                            if (String(log.semester || '').replace(/\D/g, '') !== String(selectedSemFolder || '').replace(/\D/g, '')) return false;
                            
                            if (folderDivFilter !== 'ALL' && !isDivMatch(log.division, folderDivFilter)) return false;
                            if (targetDate) {
                              const d = normDate(log.date || log.created_at);
                              if (d && d !== targetDate) return false;
                            }
                            return true;
                          });

                          const sessionsMap = new Map();

                          logsForDate.forEach(log => {
                            let facName = log.faculty_name || (log.faculty && log.faculty.name) || log.generated_by_name || 'Faculty';
                            let sessKey = log.qr_session_id 
                              ? `qr_${log.qr_session_id}` 
                              : log.otp_id 
                                ? `otp_${log.otp_id}` 
                                : `manual_${facName}_${log.time || log.id}`;

                            if (!sessionsMap.has(sessKey)) {
                              let sessType = log.qr_session_id ? 'Live QR Session' : log.otp_id ? 'OTP Session' : 'Manual Session';

                              sessionsMap.set(sessKey, {
                                id: sessKey,
                                qr_session_id: log.qr_session_id || null,
                                otp_id: log.otp_id || null,
                                type: sessType,
                                faculty_name: facName,
                                division: log.division || folderDivFilter,
                                subject: log.subject || null,
                                time: log.time || 'Session',
                                logs: []
                              });
                            }
                            sessionsMap.get(sessKey).logs.push(log);
                          });

                          const sessionList = Array.from(sessionsMap.values()).map((s, idx) => {
                            const presentCount = s.logs.filter(l => l.status === 'Success').length;
                            const targetSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                            const targetClassCount = (students || []).filter(st => {
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
                                    background: 'rgba(245, 158, 11, 0.06)',
                                    border: '1.5px solid rgba(245, 158, 11, 0.25)',
                                    borderRadius: '16px',
                                    padding: '18px 16px',
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
                                    <div style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: '600', marginTop: '2px' }}>
                                      Faculty: {sess.faculty_name}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
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
                        const targetStudents = (students || []).filter(s => {
                          const sSemNum = String(s.semester || '').replace(/\D/g, '');
                          if (targetSemNum && sSemNum !== targetSemNum) return false;
                          return isDivMatch(s.division, selectedSessionFolder.division);
                        });

                        const absentStudents = targetStudents.filter(st => {
                          const key = String(st.enrollment_no || '').trim().toLowerCase();
                          return !presentEnrollments.has(key);
                        });

                        const sessSubject = selectedSessionFolder.subject ||
                          (selectedSessionFolder.logs && selectedSessionFolder.logs.find(l => l.subject)?.subject) ||
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
                                ← Back to Semester {selectedSemFolder} Sessions
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

                            {/* Search Filter */}
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                              <div style={{ position: 'relative', flex: 1 }}>
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
          </div>
        )}

        {/* PANEL 2: STUDENT CRUD MANAGEMENT */}
        {activeTab === 'students' && (
          <div style={{ ...styles.tabPanel, ...styles.studentCrudPanel }} className="glass-panel">
            <div style={styles.crudHeader}>
              <div style={styles.searchContainer}>
                <Search size={18} style={styles.searchIcon} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Search student by Name or Enrollment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
                <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
                  Import CSV / XLSX
                </button>
                <button className="btn btn-primary" onClick={openAddModal}>
                  <Plus size={16} /> Add Student
                </button>
                {students.length > 0 && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => handleBulkDeleteStudents(selectedStudentIds.length > 0 ? selectedStudentIds : filteredStudents.map(s => s.id))}
                    style={{ 
                      gap: '8px', 
                      background: 'linear-gradient(135deg, #ef4444, #b91c1c)', 
                      color: '#ffffff', 
                      border: 'none',
                      padding: '8px 18px',
                      fontWeight: '700',
                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
                    }}
                  >
                    <Trash2 size={16} /> {selectedStudentIds.length > 0 ? `Delete Selected (${selectedStudentIds.length})` : `Delete All Students (${students.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Semester & Division filter dropdowns + Select All Control Bar */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Filter Students:</span>
                <select 
                  className="glass-input" 
                  style={{ width: '160px', padding: '6px 12px', background: '#001b3d', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                  value={stuSemFilter} 
                  onChange={(e) => { setStuSemFilter(e.target.value); setStuDivFilter(''); }}
                >
                  <option value="" style={{ background: '#001b3d', color: '#ffffff' }}>All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={s} style={{ background: '#001b3d', color: '#ffffff' }}>Sem {s}</option>
                  ))}
                </select>
                <select 
                  className="glass-input" 
                  style={{ width: '160px', padding: '6px 12px', background: '#001b3d', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                  value={stuDivFilter} 
                  onChange={(e) => setStuDivFilter(e.target.value)}
                >
                  <option value="" style={{ background: '#001b3d', color: '#ffffff' }}>All Divisions</option>
                  {Array.from(new Set(
                    students
                      .filter(s => !stuSemFilter || String(s.semester) === String(stuSemFilter))
                      .map(s => s.division)
                      .filter(d => d && d.trim() !== '')
                  )).sort().map(div => (
                    <option key={div} value={div} style={{ background: '#001b3d', color: '#ffffff' }}>Div {div}</option>
                  ))}
                  <option value="none" style={{ background: '#001b3d', color: '#ffffff' }}>No Division (Blank)</option>
                </select>
                {(stuSemFilter || stuDivFilter) && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setStuSemFilter(''); setStuDivFilter(''); }}
                    style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Select All Toggle Button */}
              {filteredStudents.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={toggleSelectAllStudents}
                    style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '8px' }}
                  >
                    <input
                      type="checkbox"
                      checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id))}
                      onChange={() => {}}
                      style={{ cursor: 'pointer' }}
                    />
                    {filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id)) ? 'Deselect All' : 'Select All Students'}
                  </button>
                  <span style={{ fontSize: '0.82rem', color: '#c084fc', fontWeight: '600' }}>
                    ({selectedStudentIds.length} Selected)
                  </span>
                </div>
              )}
            </div>

            {/* Paginated Student Table Rendering */}
            {(() => {
              const PAGE_SIZE = 50;
              const totalCount = filteredStudents.length;
              const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
              const currentPage = Math.min(stuPage, totalPages);
              const startIdx = (currentPage - 1) * PAGE_SIZE;
              const paginatedStudents = filteredStudents.slice(startIdx, startIdx + PAGE_SIZE);

              return (
                <>
                  <div className="custom-table-container">
                    {studentsLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px' }}>Loading student lists...</div>
                    ) : filteredStudents.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No students found.</div>
                    ) : (
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id))}
                                onChange={toggleSelectAllStudents}
                                title="Select / Unselect All"
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                            </th>
                            <th>Roll No</th>
                            <th>Enrollment No</th>
                            <th>Name</th>
                            <th>Course</th>
                            <th>Semester</th>
                            <th>Division</th>
                            <th>Mobile</th>
                            <th>Password</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedStudents.map((student) => {
                            const isChecked = selectedStudentIds.includes(student.id);
                            return (
                              <tr key={student.id} style={{ background: isChecked ? 'rgba(147, 51, 234, 0.08)' : 'transparent' }}>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSelectStudent(student.id)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </td>
                                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{student.roll_no || '-'}</td>
                                <td>{student.enrollment_no}</td>
                                <td style={{ fontWeight: 600 }}>{student.name}</td>
                                <td>{student.course}</td>
                                <td>Sem {student.semester}</td>
                                <td style={{ fontWeight: 600 }}>{student.division || '-'}</td>
                                <td>{student.mobile}</td>
                                <td><code>{student.plain_password}</code></td>
                                <td>
                                  <div style={styles.actionButtonContainer}>
                                    <button className="btn btn-secondary" onClick={() => openEditModal(student)} style={styles.actionBtn}>
                                      <Edit size={14} />
                                    </button>
                                    <button className="btn btn-danger" onClick={() => handleDeleteStudent(student.id)} style={styles.actionBtn}>
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination Control Bar */}
                  {totalCount > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Showing <strong>{startIdx + 1}</strong> - <strong>{Math.min(startIdx + PAGE_SIZE, totalCount)}</strong> of <strong>{totalCount}</strong> students
                      </div>
                      
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setStuPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage <= 1}
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            ← Previous
                          </button>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600', padding: '0 8px' }}>
                            Page {currentPage} of {totalPages}
                          </span>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setStuPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            Next →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* PANEL 2b: FACULTY CRUD MANAGEMENT */}
        {activeTab === 'faculty' && (
          <div style={{ ...styles.tabPanel, ...styles.studentCrudPanel }} className="glass-panel">
            <div style={styles.crudHeader}>
              <div style={styles.searchContainer}>
                <Search size={18} style={styles.searchIcon} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Search faculty by Name or Employee No..."
                  value={facultySearchQuery}
                  onChange={(e) => setFacultySearchQuery(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
              </div>
              <div>
                <button className="btn btn-primary" onClick={openAddFacultyModal}>
                  <Plus size={16} /> Add Faculty Member
                </button>
              </div>
            </div>

            <div className="custom-table-container">
              {facultyLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading faculty lists...</div>
              ) : faculties.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No faculty members found.</div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Assigned Subjects & Semesters</th>
                      <th>Mobile</th>
                      <th>Username</th>
                      <th>Password</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculties
                      .filter(f => 
                        f.name.toLowerCase().includes(facultySearchQuery.toLowerCase()) || 
                        f.employee_no.toLowerCase().includes(facultySearchQuery.toLowerCase())
                      )
                      .map((fac) => (
                        <tr key={fac.id}>
                          <td>{fac.employee_no}</td>
                          <td style={{ fontWeight: 600 }}>{fac.name}</td>
                          <td>{fac.department}</td>
                          <td>
                            {(() => {
                              let subs = fac.subjects;
                              if (typeof subs === 'string') {
                                try { subs = JSON.parse(subs); } catch(e) { subs = []; }
                              }
                              if (!Array.isArray(subs) || subs.length === 0) {
                                return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No subjects</span>;
                              }
                              const validSubs = subs.filter(s => s && s.subjectName && String(s.subjectName).trim() !== '');
                              if (validSubs.length === 0) {
                                return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>No subjects</span>;
                              }
                              return (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {validSubs.map((sItem, sIdx) => {
                                    const displayName = (sItem.shortName && String(sItem.shortName).trim() !== '') 
                                      ? String(sItem.shortName).trim() 
                                      : sItem.subjectName;
                                    return (
                                      <span
                                        key={sIdx}
                                        title={sItem.shortName ? `${sItem.subjectName} (${sItem.shortName})` : sItem.subjectName}
                                        style={{
                                          fontSize: '0.74rem',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          background: 'rgba(168, 85, 247, 0.15)',
                                          color: '#c084fc',
                                          border: '1px solid rgba(168, 85, 247, 0.3)',
                                          fontWeight: '600',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {displayName} (Sem {sItem.semester || '1'})
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </td>
                          <td>{fac.mobile}</td>
                          <td><code>{fac.username}</code></td>
                          <td><code>{fac.plain_password}</code></td>
                          <td>
                            <div style={styles.actionButtonContainer}>
                              <button className="btn btn-secondary" onClick={() => openEditFacultyModal(fac)} style={styles.actionBtn} title="Edit Details">
                                <Edit size={14} />
                              </button>
                              <button className="btn btn-secondary" onClick={() => handleResetFacultyPassword(fac.id)} style={styles.actionBtn} title="Reset Password">
                                <KeyRound size={14} />
                              </button>
                              <button className="btn btn-danger" onClick={() => handleDeleteFaculty(fac.id)} style={styles.actionBtn} title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* PANEL 3: QR ATTENDANCE */}
        {activeTab === 'otp' && (() => {
          const currentSessionLogs = liveLogs.filter(log => log.qr_session_id === activeQrSessionDetails?.id);
          return (
            <div style={{ ...styles.tabPanel, ...styles.otpDashboardRow }}>
              {/* Left Box: QR Controller / Smart TV Screen */}
              <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1.2, minWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px' }}>
                <h3 style={{ ...styles.cardTitle, width: '100%', textAlign: 'center' }}>Smart TV QR Display</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
                  {activeQrSessionDetails ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
                      {/* Live Canvas for QR Code */}
                      <div style={{ padding: '16px', background: '#fff', borderRadius: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 10px 40px rgba(147, 51, 234, 0.3)' }}>
                        <canvas ref={qrCanvasRef} />
                      </div>

                      {/* Progress & Countdown Timers */}
                      <div style={{ width: '100%', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          <span>Active QR Code Validity</span>
                          <strong style={{ color: '#a855f7' }}>{qrCodeTimer}s</strong>
                        </div>
                        {/* 15-second progress bar */}
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                          <div style={{ height: '100%', width: `${(qrCodeTimer / 15) * 100}%`, background: 'linear-gradient(90deg, #9333ea, #a855f7)', transition: 'width 1s linear' }}></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={16} className="spin-slow" />
                            Session Remaining
                          </span>
                          <span>{Math.floor(qrSessionTimer / 60)}:{String(qrSessionTimer % 60).padStart(2, '0')}</span>
                        </div>
                        
                        <div style={{ fontSize: '0.9rem', color: '#eab308', marginTop: '14px', textAlign: 'center', fontWeight: '600', padding: '6px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px' }}>
                          Faculty: {activeQrSessionDetails.facultyName || 'Admin'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '10px 0', width: '100%' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: qrGenerationEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <QrCode size={40} color={qrGenerationEnabled ? '#10b981' : '#ef4444'} />
                      </div>
                      <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 600 }}>Faculty QR Permission</h4>
                      <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', background: qrGenerationEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: qrGenerationEnabled ? '#10b981' : '#ef4444', border: qrGenerationEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', marginBottom: '24px' }}>
                        {qrGenerationEnabled ? 'QR GENERATION ENABLED' : 'QR GENERATION DISABLED'}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', lineHeight: 1.5 }}>
                        {qrGenerationEnabled 
                          ? 'Faculty members can start QR attendance sessions from their dashboard. Disable this to block all QR session creation.' 
                          : 'All Faculty QR session generation is blocked. Enable this to allow faculty to start QR attendance.'}
                      </p>
                      <button
                        className={`btn ${qrGenerationEnabled ? 'btn-danger' : 'btn-primary'}`}
                        onClick={handleToggleQrSettings}
                        style={{ padding: '12px 28px', fontSize: '1rem', width: '100%', borderRadius: '10px' }}
                      >
                        {qrGenerationEnabled ? 'Block QR Generation' : 'Allow QR Generation'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Box: Live Scan Feed & Today's History */}
              <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1.8 }}>
                {activeQrSessionDetails ? (
                  <div>
                    <div className="mobile-stack-header" style={{ ...styles.cardHeaderWithAction, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                      <h3 style={styles.cardTitle}>Live Checked-In Students</h3>
                      <span className="status-badge success" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                        {currentSessionLogs.length} Checked In
                      </span>
                    </div>
                    <div className="custom-table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                      {currentSessionLogs.length === 0 ? (
                        <div style={{ ...styles.emptyTableState, padding: '60px 0' }}>
                          Waiting for students to scan the QR code...
                        </div>
                      ) : (
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Enrollment</th>
                              <th>Name</th>
                              <th>Course</th>
                              <th>Time</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentSessionLogs.map((log) => (
                              <tr key={log.id}>
                                <td>{log.enrollment_no}</td>
                                <td style={{ fontWeight: 600 }}>{log.name}</td>
                                <td>{log.course} - Sem {log.semester}</td>
                                <td>{log.time}</td>
                                <td>
                                  <span className={`status-badge ${log.status.toLowerCase()}`}>
                                    {log.status === 'Success' ? 'Present' : 'Rejected'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 style={styles.cardTitle}>Today's QR Sessions History</h3>
                    <div className="custom-table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                      {qrSessionHistory.length === 0 ? (
                        <div style={styles.emptyTableState}>No QR sessions generated today yet.</div>
                      ) : (
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Session ID</th>
                              <th>Faculty Name</th>
                              <th>Date</th>
                              <th>Start Time</th>
                              <th>Expiry Time</th>
                              <th>Present Students</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qrSessionHistory.map((row) => (
                              <tr key={row.id}>
                                <td><strong>Session #{row.id}</strong></td>
                                <td style={{ fontWeight: '600', color: '#eab308' }}>{row.faculty_name || 'Admin'}</td>
                                <td>{row.date}</td>
                                <td>{new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                <td>{new Date(row.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                <td style={{ fontWeight: 'bold', color: '#10b981' }}>{row.presentCount} Present</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* PANEL 4: LOCATION MAP SETUP */}
        {activeTab === 'location' && (
          <div style={{ ...styles.tabPanel, ...styles.locationDashboardRow }}>
            {/* Configuration Form */}
            <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1, minWidth: '320px' }}>
              <h3 style={styles.cardTitle}>Location Configuration</h3>
              
              {locationMessage && (
                <div style={{
                  ...styles.statusAlert,
                  ...(locationMessage.toLowerCase().includes('success') || locationMessage.includes('Found') || locationMessage.includes('Set') ? styles.statusSuccess : styles.statusDanger),
                  marginBottom: '16px'
                }}>
                  {locationMessage}
                </div>
              )}

              {/* 1. Geocoding Search Textbox */}
              <form onSubmit={handleSearchAddress} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <label style={styles.formLabel}>Search Campus Location / Place</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Sardar Patel University, Gujarat"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary" disabled={searchLoading} style={{ padding: '0 16px' }}>
                    {searchLoading ? '...' : 'Search'}
                  </button>
                </div>
              </form>

              {/* 2. Device Live GPS Button */}
              <div style={{ marginBottom: '20px' }}>
                <label style={styles.formLabel}>Device GPS Location</label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGetAdminLiveLocation}
                  style={{ width: '100%', gap: '8px', marginTop: '6px' }}
                >
                  <MapPin size={16} color="#9333ea" />
                  Use My Device Live Location
                </button>
              </div>

              {/* 3. Coordinate Display (Read-only for validation) & Save form */}
              <form onSubmit={handleSaveLocation} style={styles.locationForm}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Latitude</span>
                    <strong style={{ fontSize: '0.85rem' }}>{locationForm.latitude.toFixed(6)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Longitude</span>
                    <strong style={{ fontSize: '0.85rem' }}>{locationForm.longitude.toFixed(6)}</strong>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Radius (in Meters)</label>
                  <input
                    type="number"
                    className="glass-input"
                    value={locationForm.radius}
                    onChange={(e) => handleLocationInputChange('radius', e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                  Save Location Coordinates
                </button>
              </form>

              <div style={styles.mapTip}>
                <strong>Tip:</strong> Drag the map marker or click anywhere on the map to automatically adjust the campus coordinates.
              </div>
            </div>

            {/* Leaflet Map Viewer */}
            <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 2, minWidth: '350px' }}>
              <h3 style={styles.cardTitle}>College Campus Radius Map</h3>
              <div 
                ref={mapContainerRef} 
                style={{ width: '100%', height: '380px', minHeight: '380px', borderRadius: '12px', zIndex: 0 }}
              >
                {!window.L && <div style={{ textAlign: 'center', padding: '100px 0' }}>Loading Leaflet Map Library...</div>}
              </div>
            </div>
          </div>
        )}

        {/* PANEL 5: REPORTS & PDF DOWNLOADS */}
        {activeTab === 'reports' && (
          <div style={{ ...styles.tabPanel, ...styles.reportsPanel }} className="glass-panel">
            <div style={styles.reportsFilterHeader}>
              <div style={styles.filterGroup}>
                <label style={styles.formLabel}>Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="glass-input"
                  style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                >
                  <option value="today">Today's Attendance</option>
                  <option value="monthly">Monthly Attendance</option>
                  <option value="yearly">Yearly Attendance</option>
                  <option value="student_wise">Student Specific Report</option>
                  <option value="custom_date">Choose Date (Custom Date)</option>
                </select>
              </div>

              {/* Monthly picker */}
              {reportType === 'monthly' && (
                <div style={styles.filterGroup}>
                  <label style={styles.formLabel}>Select Month</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="glass-input"
                    style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px', minWidth: '160px' }}
                  />
                </div>
              )}

              {/* Yearly picker */}
              {reportType === 'yearly' && (
                <div style={styles.filterGroup}>
                  <label style={styles.formLabel}>Select Year</label>
                  <select
                    value={reportYear}
                    onChange={(e) => setReportYear(e.target.value)}
                    className="glass-input"
                    style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px' }}
                  >
                    {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i)).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              )}

              {reportType === 'student_wise' && (
                <div style={styles.filterGroup}>
                  <label style={styles.formLabel}>Select Student</label>
                  <select
                    value={reportStudentId}
                    onChange={(e) => setReportStudentId(e.target.value)}
                    className="glass-input"
                    style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.enrollment_no})</option>
                    ))}
                  </select>
                </div>
              )}

              {reportType === 'custom_date' && (
                <div style={styles.filterGroup}>
                  <label style={styles.formLabel}>Select Specific Date</label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="glass-input"
                    style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px', minWidth: '160px' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <button 
                  className="btn btn-success" 
                  onClick={handleDownloadPDF}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId) || (reportType === 'custom_date' && !reportDate)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> PDF
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleExportExcel}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId) || (reportType === 'custom_date' && !reportDate)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> Excel
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleExportCSV}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId) || (reportType === 'custom_date' && !reportDate)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> CSV
                </button>
              </div>
            </div>

            {/* Semester Folder Navigation (Sem 1 to Sem 8) */}
            <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Folder size={18} color="#a855f7" /> Semester Folders (Sem 1 to Sem 8):
              </div>
              <div className="semester-folder-grid" style={{ gap: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className={`btn ${reportFilterSem === '' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReportFilterSem('')}
                  style={{ fontSize: '0.85rem', padding: '8px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                >
                  <Folder size={14} /> All Folders
                </button>
                {(availableSemesters.length > 0 ? availableSemesters : [1, 2, 3, 4, 5, 6, 7, 8]).map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`btn ${reportFilterSem === String(s) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setReportFilterSem(String(s))}
                    style={{ fontSize: '0.85rem', padding: '8px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                  >
                    <Folder size={14} /> Sem {s}
                  </button>
                ))}
              </div>

              {/* Quick Filters */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={styles.inputGroup}>
                  <label style={styles.formLabel}>Filter by Name</label>
                  <input 
                    type="text" 
                    placeholder="Search name..." 
                    className="glass-input" 
                    value={reportFilterName} 
                    onChange={e => setReportFilterName(e.target.value)} 
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.formLabel}>Filter by Enrollment No.</label>
                  <input 
                    type="text" 
                    placeholder="Search enrollment..." 
                    className="glass-input" 
                    value={reportFilterEnroll} 
                    onChange={e => setReportFilterEnroll(e.target.value)} 
                  />
                </div>
              </div>
            </div>

            <div className="custom-table-container">
              {filteredReportData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No attendance records matched the selected query filters.
                </div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Enrollment No</th>
                      <th>Name</th>
                      <th>Course</th>
                      <th>Semester</th>
                      <th>Faculty</th>
                      <th>Session/OTP</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Distance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportData.map((row) => (
                      <tr key={row.id}>
                        <td>{row.enrollment_no}</td>
                        <td style={{ fontWeight: 600 }}>{row.name}</td>
                        <td>{row.course}</td>
                        <td>Sem {row.semester}</td>
                        <td style={{ fontWeight: 500, color: 'var(--primary)' }}>{row.faculty_name || 'Admin'}</td>
                        <td>
                          {row.qr_session_id ? (
                            <span className="status-badge success" style={{ fontSize: '0.75rem', background: 'rgba(147,51,234,0.15)', color: '#a855f7', border: '1px solid rgba(147,51,234,0.3)' }}>
                              QR Session #{row.qr_session_id}
                            </span>
                          ) : (
                            <code>{row.otp || 'N/A'} (OTP)</code>
                          )}
                        </td>
                        <td>{row.date}</td>
                        <td>{row.time}</td>
                        <td>{row.distance}m</td>
                        <td>
                          <span className={`status-badge ${row.status.toLowerCase()}`}>
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
        )}

        {/* PANEL 6: ADMIN PROFILE & SETTINGS */}
        {activeTab === 'settings' && (
          <div style={styles.tabPanel}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
              
              {/* CARD 1: UPDATE PROFILE DETAILS */}
              <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={24} color="#3b82f6" />
                  </div>
                  <div>
                    <h3 style={{ ...styles.cardTitle, margin: 0 }}>Admin Profile</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>Update account identity and details</p>
                  </div>
                </div>

                {profileMessage.text && (
                  <div style={{
                    ...styles.statusAlert,
                    ...(profileMessage.type === 'success' ? styles.statusSuccess : styles.statusDanger),
                    marginBottom: '5px'
                  }}>
                    {profileMessage.text}
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Role & Status</label>
                    <div>
                      <span className="status-badge success" style={{ fontSize: '0.85rem', padding: '6px 12px', display: 'inline-block', fontWeight: 'bold' }}>
                        Administrator (Active)
                      </span>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Full Name</label>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Enter Admin Name"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Email Address</label>
                    <input
                      type="email"
                      className="glass-input"
                      placeholder="Enter Admin Email Address"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={profileLoading}>
                    {profileLoading ? 'Saving Changes...' : 'Save Profile Details'}
                  </button>
                </form>
              </div>

              {/* CARD 2: CHANGE PASSWORD */}
              <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                  <div style={{ background: 'rgba(147, 51, 234, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound size={24} color="#9333ea" />
                  </div>
                  <div>
                    <h3 style={{ ...styles.cardTitle, margin: 0 }}>Change Password</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>Manage security and credentials</p>
                  </div>
                </div>
                
                {settingsMessage.text && (
                  <div style={{
                    ...styles.statusAlert,
                    ...(settingsMessage.type === 'success' ? styles.statusSuccess : styles.statusDanger),
                    marginBottom: '5px'
                  }}>
                    {settingsMessage.text}
                  </div>
                )}

                <form onSubmit={handleChangeAdminPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Current Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      placeholder="Enter current password"
                      value={changePasswordForm.currentPassword}
                      onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })}
                      required
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>New Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      placeholder="Enter new password"
                      value={changePasswordForm.newPassword}
                      onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })}
                      required
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Confirm New Password</label>
                    <input
                      type="password"
                      className="glass-input"
                      placeholder="Confirm new password"
                      value={changePasswordForm.confirmPassword}
                      onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={settingsLoading}>
                    {settingsLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* STUDENT CRUD modal */}
      {showStudentModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.modalContent}>
            <h3 style={styles.modalTitle}>
              {modalMode === 'add' ? 'Add New Student' : 'Edit Student Details'}
            </h3>

            {createdStudentCredentials ? (
              <div style={styles.credentialsSuccessCard}>
                <CheckCircle size={32} color="#10b981" style={{ marginBottom: '10px' }} />
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Student Added Successfully!</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Please share these generated credentials with the student. They will not be shown again.
                </p>
                <div style={styles.credentialsFields}>
                  <div style={styles.credentialRow}>
                    <span>Username:</span>
                    <code>{createdStudentCredentials.username}</code>
                  </div>
                  <div style={styles.credentialRow}>
                    <span>Password:</span>
                    <code>{createdStudentCredentials.password}</code>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowStudentModal(false)} style={{ width: '100%', marginTop: '20px' }}>
                  Close and Continue
                </button>
              </div>
            ) : (
              <form onSubmit={handleStudentSubmit} style={styles.modalForm}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Enrollment Number</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. 2100201190"
                    value={studentForm.enrollment_no}
                    onChange={(e) => setStudentForm({ ...studentForm, enrollment_no: e.target.value.trim() })}
                    onBlur={() => setEnrollmentTouched(true)}
                    required
                    pattern="^\d{10}$"
                    title="Please enter valid enrollment number"
                    disabled={modalMode === 'edit'}
                    style={enrollmentTouched && studentForm.enrollment_no && !/^\d{10}$/.test(studentForm.enrollment_no) ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                  />
                  {enrollmentTouched && studentForm.enrollment_no && !/^\d{10}$/.test(studentForm.enrollment_no) && (
                    <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                      ⚠️ Please enter valid enrollment number
                    </div>
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Roll Number (Optional)</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. 101"
                    value={studentForm.roll_no || ''}
                    onChange={(e) => setStudentForm({ ...studentForm, roll_no: e.target.value })}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Student Full Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Amit Patel"
                    value={studentForm.name}
                    onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Course / Department</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. B.E. Computer"
                    value={studentForm.course}
                    onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Semester</label>
                  <input
                    type="number"
                    className="glass-input"
                    placeholder="e.g. 5"
                    min="1"
                    max="10"
                    value={studentForm.semester}
                    onChange={(e) => setStudentForm({ ...studentForm, semester: e.target.value })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Division / Section (Optional)</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. A, B, Div-1 (Leave blank if no division)"
                    value={studentForm.division || ''}
                    onChange={(e) => setStudentForm({ ...studentForm, division: e.target.value })}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Mobile Number</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. 9876543210"
                    value={studentForm.mobile}
                    onChange={(e) => setStudentForm({ ...studentForm, mobile: e.target.value.trim() })}
                    onBlur={() => setMobileTouched(true)}
                    required
                    pattern="^\d{10}$"
                    title="Please enter valid mobile number"
                    style={mobileTouched && studentForm.mobile && !/^\d{10}$/.test(studentForm.mobile) ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                  />
                  {mobileTouched && studentForm.mobile && !/^\d{10}$/.test(studentForm.mobile) && (
                    <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                      ⚠️ Please enter valid mobile number
                    </div>
                  )}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Password {modalMode === 'add' ? '(Optional - Auto-generated if blank)' : '(Optional - Set custom)'}
                  </label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder={modalMode === 'add' ? 'Set custom password' : 'Keep current or set new'}
                    value={studentForm.password || ''}
                    onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                  />
                </div>

                {modalMode === 'edit' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                    <input
                      type="checkbox"
                      id="resetPass"
                      checked={studentForm.resetPassword || false}
                      onChange={(e) => setStudentForm({ ...studentForm, resetPassword: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="resetPass" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      Regenerate password for this student
                    </label>
                  </div>
                )}

                <div style={styles.modalActions}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowStudentModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {modalMode === 'add' ? 'Generate Credentials & Save' : 'Update Student'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* FACULTY CRUD modal */}
      {showFacultyModal && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.modalContent}>
            <h3 style={styles.modalTitle}>
              {facultyModalMode === 'add' ? 'Add New Faculty Member' : 'Edit Faculty Details'}
            </h3>

            {createdFacultyCredentials ? (
              <div style={styles.credentialsSuccessCard}>
                <CheckCircle size={32} color="#10b981" style={{ marginBottom: '10px' }} />
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Faculty Added Successfully!</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Please share these generated credentials with the faculty member. They will not be shown again.
                </p>
                <div style={styles.credentialsFields}>
                  <div style={styles.credentialRow}>
                    <span>Username:</span>
                    <code>{createdFacultyCredentials.username}</code>
                  </div>
                  <div style={styles.credentialRow}>
                    <span>Password:</span>
                    <code>{createdFacultyCredentials.password}</code>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => { setCreatedFacultyCredentials(null); setShowFacultyModal(false); }}
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveFaculty} style={styles.modalForm}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Employee ID / Code</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. FAC101"
                    value={facultyForm.employee_no}
                    onChange={(e) => setFacultyForm({ ...facultyForm, employee_no: e.target.value.trim() })}
                    required
                    disabled={facultyModalMode === 'edit'}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Faculty Full Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Dr. Sarah Connor"
                    value={facultyForm.name}
                    onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Department</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Computer Science"
                    value={facultyForm.department}
                    onChange={(e) => setFacultyForm({ ...facultyForm, department: e.target.value })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Mobile Number</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. 9876543210"
                    value={facultyForm.mobile}
                    onChange={(e) => setFacultyForm({ ...facultyForm, mobile: e.target.value.trim() })}
                    required
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    Password {facultyModalMode === 'add' ? '(Optional - Auto-generated if blank)' : '(Optional - Set custom)'}
                  </label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder={facultyModalMode === 'add' ? 'Set custom password' : 'Keep current or set new'}
                    value={facultyForm.password || ''}
                    onChange={(e) => setFacultyForm({ ...facultyForm, password: e.target.value })}
                  />
                </div>

                {/* Teaching Subjects & Semesters Section */}
                <div style={{ marginTop: '10px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ ...styles.formLabel, margin: 0, fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📚 Teaching Subjects & Semesters
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentSubs = facultyForm.subjects || [];
                        setFacultyForm({
                          ...facultyForm,
                          subjects: [...currentSubs, { subjectName: '', semester: '1' }]
                        });
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', background: 'rgba(147,51,234,0.15)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.3)' }}
                    >
                      ➕ Add Subject
                    </button>
                  </div>

                  {((facultyForm.subjects && facultyForm.subjects.length > 0) ? facultyForm.subjects : [{ subjectName: '', shortName: '', semester: '1' }]).map((subItem, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Full Subject Name */}
                      <div style={{ flex: '1.8', minWidth: '140px' }}>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder={`Subject ${idx + 1} Name`}
                          value={subItem.subjectName || ''}
                          onChange={(e) => {
                            const updated = [...(facultyForm.subjects || [{ subjectName: '', shortName: '', semester: '1' }])];
                            updated[idx] = { ...updated[idx], subjectName: e.target.value };
                            setFacultyForm({ ...facultyForm, subjects: updated });
                          }}
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* Optional Short Name */}
                      <div style={{ flex: '1.4', minWidth: '130px' }}>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Short Name"
                          value={subItem.shortName || ''}
                          onChange={(e) => {
                            const updated = [...(facultyForm.subjects || [{ subjectName: '', shortName: '', semester: '1' }])];
                            updated[idx] = { ...updated[idx], shortName: e.target.value };
                            setFacultyForm({ ...facultyForm, subjects: updated });
                          }}
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* Semester Select */}
                      <div style={{ flex: '1', minWidth: '90px' }}>
                        <select
                          className="glass-input"
                          value={subItem.semester || '1'}
                          onChange={(e) => {
                            const updated = [...(facultyForm.subjects || [{ subjectName: '', shortName: '', semester: '1' }])];
                            updated[idx] = { ...updated[idx], semester: e.target.value };
                            setFacultyForm({ ...facultyForm, subjects: updated });
                          }}
                          style={{ padding: '8px 10px', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(semNum => (
                            <option key={semNum} value={semNum} style={{ background: '#1e1b4b', color: '#fff' }}>
                              Sem {semNum}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(facultyForm.subjects && facultyForm.subjects.length > 1) && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = facultyForm.subjects.filter((_, i) => i !== idx);
                            setFacultyForm({ ...facultyForm, subjects: updated.length > 0 ? updated : [{ subjectName: '', semester: '1' }] });
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}
                          title="Remove Subject"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={styles.modalActions}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowFacultyModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {facultyModalMode === 'add' ? 'Generate Credentials & Save' : 'Update Faculty'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM REACT DELETE CONFIRMATION MODAL (0ms response, No Browser Thread Blocking) */}
      {deleteConfirmState.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '420px',
            maxWidth: '100%',
            padding: '28px',
            borderRadius: '20px',
            border: '1.5px solid rgba(239, 68, 68, 0.4)',
            background: 'linear-gradient(145deg, #0b172a 0%, #001b3d 100%)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Trash2 size={26} color="#f87171" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ffffff', fontWeight: '700' }}>
                  Confirm Student Deletion
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: '600' }}>
                  ⚠️ Permanent System Action
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deleteConfirmState.studentName}</strong>? All associated attendance history will also be permanently deleted.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmState({ isOpen: false, type: 'single', studentId: null, studentName: '', targetIds: [] })}
                style={{ padding: '9px 20px', fontSize: '0.88rem', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={executeConfirmedDelete}
                style={{
                  padding: '9px 22px',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
                  cursor: 'pointer'
                }}
              >
                Yes, Delete Now
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxSizing: 'border-box',
    overflowX: 'hidden',
    width: '100%'
  },
  header: {
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px'
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '1.25rem',
    color: 'var(--text-primary)',
    letterSpacing: '0.02em'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  },
  welcomeText: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)'
  },
  logoutBtn: {
    padding: '8px 14px',
    fontSize: '0.85rem'
  },
  tabNavbar: {
    display: 'flex',
    flexWrap: 'wrap',
    padding: '6px',
    gap: '6px'
  },
  navTab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '10px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    transition: 'all 0.2s ease'
  },
  navTabActive: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#001b3d',
    fontWeight: '700',
    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
  },
  mainContent: {
    width: '100%'
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  dashboardRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap'
  },
  dashboardPanelCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column'
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.15rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '20px'
  },
  cardHeaderWithAction: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px'
  },
  activeOtpContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '180px'
  },
  otpGlowDisplay: {
    fontSize: '3rem',
    fontWeight: '800',
    letterSpacing: '5px',
    color: '#c084fc',
    textShadow: '0 0 20px rgba(168, 85, 247, 0.6)',
    fontFamily: 'var(--font-display)',
    marginBottom: '10px'
  },
  otpTimerText: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px'
  },
  emptyTableState: {
    textAlign: 'center',
    padding: '60px 0',
    color: 'var(--text-muted)',
    fontSize: '0.9rem'
  },
  studentCrudPanel: {
    padding: '24px'
  },
  crudHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px'
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '400px'
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-muted)'
  },
  actionButtonContainer: {
    display: 'flex',
    gap: '6px'
  },
  actionBtn: {
    padding: '6px',
    borderRadius: '6px'
  },
  otpDashboardRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap'
  },
  otpGeneratorSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px'
  },
  circularTimerSection: {
    display: 'flex',
    justifyContent: 'center',
    margin: '10px 0'
  },
  timerCircle: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '4px solid rgba(147, 51, 234, 0.2)',
    borderTopColor: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    boxShadow: '0 0 15px rgba(147, 51, 234, 0.15)'
  },
  timerValue: {
    fontSize: '1.8rem',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)'
  },
  otpGlowLarge: {
    fontSize: '2.5rem',
    fontWeight: '800',
    letterSpacing: '4px',
    color: '#c084fc',
    textShadow: '0 0 15px rgba(168, 85, 247, 0.5)',
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    marginBottom: '4px'
  },
  activeOtpHighlightCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '14px 20px',
    width: '100%',
    textAlign: 'center'
  },
  limitTracker: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    fontSize: '0.88rem',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.04)'
  },
  locationDashboardRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap'
  },
  locationForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  formLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  statusAlert: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '0.85rem',
    textAlign: 'center'
  },
  statusSuccess: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399'
  },
  statusDanger: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171'
  },
  mapTip: {
    marginTop: '16px',
    padding: '10px 12px',
    background: 'rgba(147, 51, 234, 0.05)',
    border: '1px solid rgba(147, 51, 234, 0.15)',
    borderRadius: '8px',
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.4'
  },
  reportsPanel: {
    padding: '24px'
  },
  reportsFilterHeader: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px',
    alignItems: 'flex-end'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '200px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '16px'
  },
  modalContent: {
    width: '100%',
    maxWidth: '500px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    borderRadius: '16px',
    overflow: 'hidden'
  },
  modalTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '16px',
    textAlign: 'center',
    flexShrink: 0
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    paddingRight: '6px',
    flex: 1
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '16px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0
  },
  credentialsSuccessCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '10px 0'
  },
  credentialsFields: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
    padding: '14px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  credentialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.9rem'
  }
};
