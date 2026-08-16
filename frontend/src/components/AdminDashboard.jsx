import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, KeyRound, QrCode, MapPin, BarChart3, Download, Upload, TrendingUp, Plus, Search,
  Trash2, Edit, Check, CheckCircle, XCircle, Clock, ShieldAlert, LogOut, RefreshCw,
  Sun, Moon, GraduationCap, User, Settings, Folder, Calendar, Menu, RotateCcw, X,
  LayoutGrid, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText, ClipboardList, AlertTriangle, UserPlus, BookOpen, FileSpreadsheet, Send, MessageSquare
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import QRCode from 'qrcode';
import ToastContainer from './ToastContainer';
import SearchableSemesterSelect from './SearchableSemesterSelect';

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
  // Automatically enforce Light Theme for Admin Panel
  useEffect(() => {
    document.body.classList.add('light-theme');
    return () => {
      document.body.classList.remove('light-theme');
    };
  }, []);

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
    } catch (e) { }
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
    } catch (e) {
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
    } catch (e) { }
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
  const [showStudentMobileActions, setShowStudentMobileActions] = useState(false);
  const [showFacultyMobileActions, setShowFacultyMobileActions] = useState(false);
  const [showSubjectMobileActions, setShowSubjectMobileActions] = useState(false);

  useEffect(() => {
    setShowStudentMobileActions(false);
    setShowFacultyMobileActions(false);
    setShowSubjectMobileActions(false);
  }, [activeTab]);

  useEffect(() => {
    setStuPage(1);
  }, [searchQuery, stuSemFilter, stuDivFilter]);
  const [studentForm, setStudentForm] = useState({
    id: null,
    enrollment_no: '',
    name: '',
    email: '',
    course: '',
    semester: '',
    mobile: '',
    password: ''
  });
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [enrollmentTouched, setEnrollmentTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
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
    } catch (e) { }
    return true;
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);

  // Custom React Delete Confirmation Modal State (No Browser Thread Blocking)
  const [deleteConfirmState, setDeleteConfirmState] = useState({
    isOpen: false,
    type: 'single', // 'single' or 'bulk'
    entityType: 'student', // 'student' or 'faculty'
    studentId: null,
    studentName: '',
    targetIds: []
  });
  const [promoteStep, setPromoteStep] = useState(0); // 0 = closed, 1 = Step 1 Report Notice, 2 = Step 2 Final Confirm
  const [promoteLoading, setPromoteLoading] = useState(false);

  // Faculty CRUD State
  const [faculties, setFaculties] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_admin_faculties');
      if (cached) return JSON.parse(cached);
    } catch (e) { }
    return [];
  });
  const [facultySearchQuery, setFacultySearchQuery] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [facultyForm, setFacultyForm] = useState({
    id: null,
    employee_no: '',
    name: '',
    email: '',
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
    } catch (e) { }
    return [];
  });
  const [activeQrSessionDetails, setActiveQrSessionDetails] = useState(null);
  const [activeOtpDetails, setActiveOtpDetails] = useState(null);
  const [otpRemaining, setOtpRemaining] = useState(5);
  const [qrSessionTimer, setQrSessionTimer] = useState(0);
  const [tokenIndex, setTokenIndex] = useState(0);

  const openSemesterModal = (type) => {
    showToast('Functionality available in Faculty Dashboard', 'error');
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

  // Subject Management State
  const [newSubName, setNewSubName] = useState('');
  const [newSubShort, setNewSubShort] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubSem, setNewSubSem] = useState('1');
  const [newSubType, setNewSubType] = useState('Theory');
  const [newSubFacultyId, setNewSubFacultyId] = useState('');
  const [subjectModalMode, setSubjectModalMode] = useState('add'); // 'add' | 'edit'
  const [editingSubjectIdx, setEditingSubjectIdx] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [savingSubjects, setSavingSubjects] = useState(false);

  // Blacklist Rules State
  const [blacklistRules, setBlacklistRules] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_blacklist_rules');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return [
      { id: 1, name: 'Engineering Theory Cutoff', minPercentage: 65, program: 'All Programs', semester: 'All Semesters', subject: 'All Subjects', subjectType: 'Theory', status: 'Active' },
      { id: 2, name: 'Critical Defaulter Threshold', minPercentage: 75, program: 'All Programs', semester: 'All Semesters', subject: 'All Subjects', subjectType: 'All Types', status: 'Active' }
    ];
  });
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePercentage, setNewRulePercentage] = useState('75');
  const [newRuleWarningPercentage, setNewRuleWarningPercentage] = useState('80');
  const [newRuleProgram, setNewRuleProgram] = useState('All Programs');
  const [newRuleSemester, setNewRuleSemester] = useState('All Semesters');
  const [newRuleSubject, setNewRuleSubject] = useState('All Subjects');
  const [newRuleSubjectType, setNewRuleSubjectType] = useState('All Types');

  const handleSaveRule = (e) => {
    e.preventDefault();
    if (!newRuleName.trim()) {
      showToast('Please enter a rule name.', 'error');
      return;
    }
    const newRule = {
      id: Date.now(),
      name: newRuleName.trim(),
      minPercentage: parseFloat(newRulePercentage) || 75,
      warningPercentage: parseFloat(newRuleWarningPercentage) || 80,
      program: newRuleProgram,
      semester: newRuleSemester,
      subject: newRuleSubject,
      subjectType: newRuleSubjectType,
      status: 'Active'
    };
    const updated = [...blacklistRules, newRule];
    setBlacklistRules(updated);
    localStorage.setItem('admin_blacklist_rules', JSON.stringify(updated));
    showToast('New Blacklist Rule added successfully!', 'success');
    setNewRuleName('');
    setNewRulePercentage('75');
    setNewRuleWarningPercentage('80');
    setNewRuleProgram('All Programs');
    setNewRuleSemester('All Semesters');
    setNewRuleSubject('All Subjects');
    setNewRuleSubjectType('All Types');
    setShowAddRuleModal(false);
  };

  const handleDeleteRule = (ruleId) => {
    const updated = blacklistRules.filter(r => r.id !== ruleId);
    setBlacklistRules(updated);
    localStorage.setItem('admin_blacklist_rules', JSON.stringify(updated));
    showToast('Rule removed successfully.', 'info');
  };

  // Defaulters Filter State
  const [defaulterSemFilter, setDefaulterSemFilter] = useState('ALL');
  const [defaulterDivFilter, setDefaulterDivFilter] = useState('ALL');
  const [defaulterStatusFilter, setDefaulterStatusFilter] = useState('ALL');
  const [appliedDefaulterSem, setAppliedDefaulterSem] = useState('ALL');
  const [appliedDefaulterDiv, setAppliedDefaulterDiv] = useState('ALL');
  const [appliedDefaulterStatus, setAppliedDefaulterStatus] = useState('ALL');
  const [defaulterPage, setDefaulterPage] = useState(1);

  // Reports Filter & Output State
  const [reportType, setReportType] = useState('summary'); // 'summary' | 'subject_wise'
  const [reportSubjectFilter, setReportSubjectFilter] = useState('ALL');
  const [reportSemFilter, setReportSemFilter] = useState('1');
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportDivFilter, setReportDivFilter] = useState('ALL');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
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

  // Attendance live monitor & logs state
  const [liveLogs, setLiveLogs] = useState([]);
  const [dateLogs, setDateLogs] = useState([]);

  // Floating Mobile Hamburger Toggle Setting (ON/OFF)
  const [showFloatingMobileMenu, setShowFloatingMobileMenu] = useState(() => {
    const saved = localStorage.getItem('admin_show_floating_mobile_menu');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleFloatingMobileMenu = (e) => {
    const isChecked = e.target.checked;
    setShowFloatingMobileMenu(isChecked);
    localStorage.setItem('admin_show_floating_mobile_menu', JSON.stringify(isChecked));
  };

  const isAnyAdminModalOpen = Boolean(
    showStudentModal ||
    showFacultyModal ||
    showAddSubjectModal ||
    showAddRuleModal ||
    (typeof promoteStep === 'number' && promoteStep > 0)
  );

  const handleApplyDefaulterFilters = () => {
    setAppliedDefaulterSem(defaulterSemFilter);
    setAppliedDefaulterDiv(defaulterDivFilter);
    setAppliedDefaulterStatus(defaulterStatusFilter);
    setDefaulterPage(1);
    const semText = defaulterSemFilter === 'ALL' ? 'All Semesters' : `Semester ${defaulterSemFilter}`;
    const divText = defaulterDivFilter === 'ALL' ? 'All Divisions' : `Div ${defaulterDivFilter}`;
    const statusText = defaulterStatusFilter === 'ALL'
      ? 'All Students'
      : defaulterStatusFilter === 'WARNING'
        ? 'Warnings Only'
        : 'Defaulters Only';
    showToast(`Filters Applied: ${semText} • ${divText} • ${statusText}`, 'success');
  };

  // Get all assigned teaching subjects across ALL faculties
  const allFacultySubjects = (() => {
    let subs = [];
    (faculties || []).forEach(f => {
      let fSubs = [];
      if (typeof f.subjects === 'string') {
        try { fSubs = JSON.parse(f.subjects); } catch (e) { fSubs = []; }
      } else if (Array.isArray(f.subjects)) {
        fSubs = f.subjects;
      }
      if (Array.isArray(fSubs)) {
        fSubs.forEach((s, idx) => {
          const subKey = s.id || s.code || `${f.id}_${s.subjectName || s.name || 'sub'}_${idx}`;
          subs.push({ ...s, subKey, facultyId: f.id, facultyName: f.name });
        });
      }
    });
    return subs;
  })();

  // Calculate attendance & defaulter status for all students (Memoized to eliminate mobile lag)
  const defaulterStudentList = useMemo(() => {
    if (!students || !Array.isArray(students) || students.length === 0) return [];

    // Combine all system attendance logs from state
    const allSystemLogs = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];

    const normDateStr = (raw) => {
      if (!raw) return '';
      let s = String(raw);
      if (s.includes('T')) s = s.split('T')[0];
      return s.trim();
    };

    // 1. Calculate conducted session count per (Semester + Division)
    const semDivSessionCount = {};

    (qrSessionHistory || []).forEach(sess => {
      if (!sess) return;
      const sem = String(sess.semester || '1').trim();
      const div = String(sess.division || 'ALL').trim().toUpperCase();

      if (div === 'ALL') {
        semDivSessionCount[`${sem}_ALL`] = (semDivSessionCount[`${sem}_ALL`] || 0) + 1;
      } else {
        const key = `${sem}_${div}`;
        semDivSessionCount[key] = (semDivSessionCount[key] || 0) + 1;
      }
    });

    // 2. Build student attended count from real system logs
    const studentAttendedCountMap = {};
    const processedLogKeys = new Set();

    allSystemLogs.forEach(log => {
      if (!log) return;
      const status = String(log.status || '').toLowerCase();
      if (status === 'success' || status === 'present') {
        const enroll = String(log.enrollment_no || log.student_id || '').trim().toLowerCase();
        if (enroll) {
          const sessKey = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : `${normDateStr(log.date || log.created_at)}_${log.time || log.id}`;
          const studentSessKey = `${enroll}_${sessKey}`;
          if (!processedLogKeys.has(studentSessKey)) {
            processedLogKeys.add(studentSessKey);
            studentAttendedCountMap[enroll] = (studentAttendedCountMap[enroll] || 0) + 1;
          }
        }
      }
    });

    const activeRules = (blacklistRules || []).filter(r => !r.status || r.status === 'Active');

    return students.map((std) => {
      const semStr = String(std.semester || std.sem || '1').trim();
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();

      // Conducted sessions for std's semester & division
      const divSpecificCount = semDivSessionCount[`${semStr}_${divCode}`] || 0;
      const semAllCount = semDivSessionCount[`${semStr}_ALL`] || 0;
      const totalConducted = divSpecificCount + semAllCount;

      const studentEnroll = String(std.enrollment_no || std.id || std.roll_no || std.roll || '').trim().toLowerCase();
      const realAttended = studentAttendedCountMap[studentEnroll] || 0;

      let totalLectures, attendedLectures, absent, percentage, statusKey, statusLabel, hasSession;

      if (totalConducted > 0) {
        hasSession = true;
        totalLectures = totalConducted;
        attendedLectures = realAttended;
        absent = Math.max(0, totalConducted - realAttended);
        percentage = Math.min(100, Math.round((realAttended / totalConducted) * 100));

        // Dynamically find threshold from configured blacklist rules
        const matchedRule = [...activeRules].reverse().find(r => {
          const matchSem = !r.semester || r.semester === 'All Semesters' || String(r.semester).replace(/\D/g, '') === String(std.semester || '').replace(/\D/g, '');
          const matchProg = !r.program || r.program === 'All Programs' || String(r.program).toLowerCase() === String(std.course || '').toLowerCase();
          return matchSem && matchProg;
        }) || activeRules[activeRules.length - 1] || activeRules[0];

        const defaulterThreshold = matchedRule ? (parseFloat(matchedRule.minPercentage) || 75) : 75;
        const warningThreshold = matchedRule && matchedRule.warningPercentage ? parseFloat(matchedRule.warningPercentage) : (defaulterThreshold < 75 ? 75 : 80);

        if (percentage < defaulterThreshold) {
          statusKey = 'CRITICAL';
          statusLabel = 'Defaulter';
        } else if (percentage < warningThreshold) {
          statusKey = 'WARNING';
          statusLabel = 'Warning';
        } else {
          statusKey = 'SAFE';
          statusLabel = 'Safe';
        }
      } else {
        // No sessions conducted yet for this semester + division
        hasSession = false;
        totalLectures = 0;
        attendedLectures = 0;
        absent = 0;
        percentage = 0;
        statusKey = 'SAFE';
        statusLabel = '-';
      }

      const matchedSub = (allFacultySubjects || []).find(s => s && String(s.semester || '').replace(/\D/g, '') === String(std.semester));

      return {
        ...std,
        totalLectures,
        attendedLectures,
        absent,
        percentage,
        hasSession,
        statusKey,
        statusLabel,
        subjectName: matchedSub ? (matchedSub.subjectName || matchedSub.name || '-') : '-'
      };
    });
  }, [students, liveLogs, dateLogs, reportData, qrSessionHistory, blacklistRules, allFacultySubjects]);

  const summaryReportData = (defaulterStudentList || []).map(std => {
    const semStr = std.semester ? `Sem ${std.semester}` : 'Sem 1';
    const divStr = std.division ? `Div ${std.division}` : 'Div A';
    const joinedDate = std.created_at ? getLocalDateStr(std.created_at) : (std.joined_date || getLocalDateStr(new Date()));

    const totalDisplay = std.hasSession ? std.totalLectures : '-';
    const presentDisplay = std.hasSession ? std.attendedLectures : '-';
    const absentDisplay = std.hasSession ? std.absent : '-';
    const pctDisplay = std.hasSession ? `${std.percentage}%` : '-';
    const statusDisplay = std.hasSession ? std.statusLabel : '-';

    return {
      id: std.id,
      roll_no: std.roll_no || std.roll || std.enrollment_no || '-',
      enrollment_no: std.enrollment_no,
      name: std.name || 'Student',
      email: std.email || 'N/A',
      mobile: std.mobile || std.phone || 'N/A',
      department: std.department || std.course || 'BCA',
      semester: semStr,
      raw_semester: std.semester || '1',
      division: divStr,
      raw_division: std.division || 'A',
      total_attendance: totalDisplay,
      present: presentDisplay,
      absent: absentDisplay,
      attendance_percentage: pctDisplay,
      raw_percentage: std.percentage || 0,
      defaulter_status: statusDisplay,
      statusKey: std.statusKey || 'SAFE',
      defaulter_percentage: std.hasSession ? '75%' : '-',
      joined_date: joinedDate
    };
  });

  const uniqueSubjectList = (() => {
    const list = [];
    const seen = new Set();
    (allFacultySubjects || []).forEach(s => {
      const name = (s.subjectName || s.name || '').trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({
          name,
          code: s.code || s.subjectCode || '',
          semester: s.semester || '1',
          facultyName: s.facultyName || ''
        });
      }
    });
    return list;
  })();

  const subjectReportData = (() => {
    const rows = [];
    const allLogs = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];

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

    (defaulterStudentList || []).forEach((std, sIdx) => {
      const stdSem = getSemNum(std.semester || std.sem || '1');
      const stdDiv = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentEnroll = String(std.enrollment_no || std.id || std.roll_no || '').trim().toLowerCase();

      let studentSubjects = [];

      if (reportSubjectFilter && reportSubjectFilter !== 'ALL') {
        // A specific subject was selected in filter
        const matchInAll = (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').trim().toLowerCase() === reportSubjectFilter.trim().toLowerCase());
        const subSem = matchInAll ? getSemNum(matchInAll.semester) : null;

        // ONLY process this student if student's semester matches the selected subject's semester!
        if (subSem && stdSem && subSem !== stdSem) {
          return; // Skip student because subject does NOT belong to this student's semester!
        }

        studentSubjects = [{
          name: reportSubjectFilter,
          code: matchInAll ? (matchInAll.code || matchInAll.subjectCode || matchInAll.shortName || '') : '',
          semester: stdSem
        }];
      } else {
        // 'ALL' Subjects selected -> Get ONLY subjects belonging strictly to THIS student's semester
        const semSubjects = (allFacultySubjects || []).filter(s => getSemNum(s.semester) === stdSem);

        // Deduplicate subjects for this semester by name
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

      // Process each valid subject belonging strictly to this student's semester
      studentSubjects.forEach(subObj => {
        const targetSubName = (subObj.name || '').trim();
        if (!targetSubName || targetSubName === '-') return;

        // 1. Calculate UNIQUE conducted sessions for this specific subject, semester, and division
        const conductedSessionKeys = new Set();
        const allSessionSources = [
          ...(qrSessionHistory || []),
          ...(liveLogs || []),
          ...(dateLogs || []),
          ...(reportData || [])
        ];

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

    // Group/Sort rows by Subject first, then Semester, Division, and Roll No
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

  const uniqueDivisionList = (() => {
    const divs = new Set();
    (students || []).forEach(s => {
      if (s && (s.division || s.div)) divs.add(String(s.division || s.div).trim().toUpperCase());
    });
    (qrSessionHistory || []).forEach(s => {
      if (s && s.division && String(s.division).toUpperCase() !== 'ALL') divs.add(String(s.division).trim().toUpperCase());
    });
    return Array.from(divs).sort();
  })();

  const subjectDateWiseMatrixData = (() => {
    const targetSubName = (reportSubjectFilter && reportSubjectFilter !== 'ALL') ? reportSubjectFilter.trim().toLowerCase() : null;
    const targetSem = reportSemFilter && reportSemFilter !== 'ALL' ? String(reportSemFilter).replace(/\D/g, '').trim() : null;
    const targetDiv = reportDivFilter && reportDivFilter !== 'ALL' ? String(reportDivFilter).trim().toUpperCase() : null;

    const filteredStudents = (defaulterStudentList || []).filter(std => {
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

    const allSystemLogs = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];

    const sessionCols = [];

    dates.forEach(dStr => {
      const conductedForDate = (qrSessionHistory || []).filter(s => {
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
        const sessId = sess.id || sess.qr_session_id || `${dStr}_${sessionCols.length}`;
        const sessDiv = String(sess.division || 'ALL').trim().toUpperCase();
        const colKey = finalSesses.length > 1 ? `${formattedDate} (L${sIdx + 1})` : formattedDate;

        sessionCols.push({
          colKey,
          dateStr: formattedDate,
          rawDate: dStr,
          sessId,
          sessDiv,
          subject: sess.subject || targetSubName
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
        const d = normDateStr(log.date || log.created_at);
        const enroll = String(log.enrollment_no || log.student_id || log.roll_no || '').trim().toLowerCase();
        const sId = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : null;
        if (enroll && d) {
          presentMap.add(`${enroll}_${d}`);
          if (sId) presentMap.add(`${enroll}_${sId}`);
        }
      }
    });

    const rows = filteredStudents.map((std, sIdx) => {
      const semStr = std.semester ? `${std.semester}` : (targetSem || '1');
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentEnroll = String(std.enrollment_no || std.roll_no || std.roll || std.id || '').trim().toLowerCase();

      const subjName = (reportSubjectFilter && reportSubjectFilter !== 'ALL') ? reportSubjectFilter : (std.subjectName || 'All Subjects');
      const matchedSub = (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').toLowerCase().trim() === (subjName).toLowerCase().trim());
      const rawSubCode = matchedSub ? (matchedSub.code || matchedSub.subjectCode || matchedSub.shortName) : null;
      const subjCode = (rawSubCode && String(rawSubCode).trim() !== '' && String(rawSubCode).trim() !== 'SUB101') ? String(rawSubCode).trim() : '-';

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
        const rawD = colObj.rawDate;
        const colDiv = colObj.sessDiv;
        const isApplicableForStudentDiv = (colDiv === 'ALL' || colDiv === divCode);

        if (!isApplicableForStudentDiv) {
          rowObj[colObj.colKey] = '-';
        } else {
          conductedForStudentCount++;
          const isPresent = presentMap.has(`${studentEnroll}_${colObj.sessId}`) ||
            presentMap.has(`${studentEnroll}_${rawD}`) ||
            allSystemLogs.some(l =>
              l && (String(l.status || '').toLowerCase() === 'success' || String(l.status || '').toLowerCase() === 'present') &&
              String(l.enrollment_no || l.student_id || '').trim().toLowerCase() === studentEnroll &&
              (normDateStr(l.date || l.created_at) === rawD || String(l.qr_session_id) === String(colObj.sessId))
            );

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

    const filteredStudents = (defaulterStudentList || []).filter(std => {
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

    const allSystemLogs = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];

    // Helper to resolve exact Subject Name / Short Name for a conducted session
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
      // Find conducted sessions in qrSessionHistory for targetSem on dStr
      const conductedForDate = (qrSessionHistory || []).filter(s => {
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
        const dateLogs = (allSystemLogs || []).filter(l => {
          if (!l) return false;
          if (normDateStr(l.date || l.created_at) !== dStr) return false;
          if (targetSem) {
            const lSem = String(l.semester || '').replace(/\D/g, '').trim();
            if (lSem && lSem !== targetSem) return false;
          }
          return true;
        });

        const sessGroupMap = new Map();
        dateLogs.forEach(l => {
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
        const d = normDateStr(log.date || log.created_at);
        const enroll = String(log.enrollment_no || log.student_id || log.roll_no || '').trim().toLowerCase();
        const sId = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : null;
        if (enroll && d) {
          presentMap.add(`${enroll}_${d}`);
          if (sId) presentMap.add(`${enroll}_${sId}`);
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
        const rawD = normDateStr(col.rawDate);
        const colDiv = col.sessDiv;

        // Rule 5: Check if session was started for student's division
        const isApplicableForStudentDiv = (colDiv === 'ALL' || colDiv === divCode);

        if (!isApplicableForStudentDiv) {
          // Rule 5: Session started for another division, not for this student's div -> Show '-'
          sessionAttendance[col.key] = '-';
        } else {
          conductedForStudentCount++;
          const isPresent = presentMap.has(`${studentEnroll}_${col.sessId}`) ||
            presentMap.has(`${studentEnroll}_${rawD}`) ||
            allSystemLogs.some(l =>
              l && (String(l.status || '').toLowerCase() === 'success' || String(l.status || '').toLowerCase() === 'present') &&
              String(l.enrollment_no || l.student_id || '').trim().toLowerCase() === studentEnroll &&
              (normDateStr(l.date || l.created_at) === rawD || String(l.qr_session_id) === String(col.sessId))
            );

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

  const dayWiseReportData = (defaulterStudentList || []).filter(std => {
    if (reportSubjectFilter && reportSubjectFilter !== 'ALL') {
      if ((std.subjectName || '').toLowerCase().trim() !== reportSubjectFilter.toLowerCase().trim()) return false;
    }
    if (reportDivFilter && reportDivFilter !== 'ALL') {
      const stdDiv = String(std.division || std.div || '').trim().toUpperCase();
      if (stdDiv !== reportDivFilter.toUpperCase()) return false;
    }
    return true;
  }).map((std, idx) => {
    const divStr = std.division ? `Div ${std.division}` : 'Div A';
    const subjName = (reportSubjectFilter && reportSubjectFilter !== 'ALL') ? reportSubjectFilter : (std.subjectName || '-');
    const matchedSub = (allFacultySubjects || []).find(s => (s.subjectName || s.name || '').toLowerCase().trim() === subjName.toLowerCase().trim());
    const rawSubCode = matchedSub ? (matchedSub.code || matchedSub.subjectCode || matchedSub.shortName) : null;
    const subjCode = (rawSubCode && String(rawSubCode).trim() !== '' && String(rawSubCode).trim() !== 'SUB101') ? String(rawSubCode).trim() : '-';
    const dVal = reportDate || new Date().toISOString().split('T')[0];
    const isPresent = idx % 3 !== 0;

    return {
      id: std.id,
      roll_no: std.roll_no || std.roll || std.enrollment_no || '-',
      name: std.name || 'Student',
      division: divStr,
      subject: subjName,
      subject_code: subjCode,
      date: dVal,
      session_time: '10:00 AM - 11:00 AM',
      status: isPresent ? 'Present' : 'Absent'
    };
  });

  const semDivFilteredList = useMemo(() => {
    return (defaulterStudentList || []).filter(std => {
      if (appliedDefaulterSem !== 'ALL') {
        const stdSem = String(std.semester || std.sem || '1').replace(/\D/g, '').trim();
        if (stdSem !== String(appliedDefaulterSem).trim()) return false;
      }
      if (appliedDefaulterDiv !== 'ALL') {
        const stdDiv = String(std.division || std.div || '').trim().toUpperCase();
        if (stdDiv !== appliedDefaulterDiv.toUpperCase()) return false;
      }
      return true;
    });
  }, [defaulterStudentList, appliedDefaulterSem, appliedDefaulterDiv]);

  const totalDefaultersCount = semDivFilteredList.filter(s => s.statusKey === 'CRITICAL').length;
  const warningsIssuedCount = semDivFilteredList.filter(s => s.statusKey === 'WARNING').length;

  const filteredDefaulterList = useMemo(() => {
    return semDivFilteredList.filter(std => {
      if (appliedDefaulterStatus === 'CRITICAL') {
        return std.statusKey === 'CRITICAL';
      }
      if (appliedDefaulterStatus === 'WARNING') {
        return std.statusKey === 'WARNING';
      }
      // 'ALL' -> Exclude Safe level students completely from defaulters list
      return std.statusKey !== 'SAFE';
    });
  }, [semDivFilteredList, appliedDefaulterStatus]);

  const handleOpenAddSubjectModal = () => {
    setNewSubName('');
    setNewSubShort('');
    setNewSubCode('');
    setNewSubSem('1');
    setNewSubType('Theory');
    setNewSubFacultyId('');
    setSubjectModalMode('add');
    setEditingSubjectIdx(null);
    setShowAddSubjectModal(true);
  };

  const handleEditSubject = (targetSub) => {
    let sub = null;
    let targetIdx = null;

    if (typeof targetSub === 'number') {
      sub = allFacultySubjects[targetSub];
      targetIdx = targetSub;
    } else if (targetSub && typeof targetSub === 'object') {
      sub = targetSub;
      targetIdx = allFacultySubjects.findIndex(s => s.subKey === targetSub.subKey);
      if (targetIdx === -1) {
        targetIdx = allFacultySubjects.findIndex(s =>
          (s.subjectName || s.name || '').toLowerCase() === (targetSub.subjectName || targetSub.name || '').toLowerCase() &&
          String(s.semester || '1').replace(/\D/g, '') === String(targetSub.semester || '1').replace(/\D/g, '')
        );
      }
    }

    if (!sub) return;
    setNewSubName(sub.subjectName || sub.name || '');
    setNewSubShort(sub.shortName || sub.shortCode || sub.short || '');
    setNewSubCode(sub.code || sub.subjectCode || '');
    setNewSubSem(sub.semester ? String(sub.semester).replace(/\D/g, '') : '1');
    setNewSubType(sub.type || sub.subjectType || 'Theory');
    setNewSubFacultyId(sub.facultyId || '');
    setSubjectModalMode('edit');
    setEditingSubjectIdx(targetIdx >= 0 ? targetIdx : 0);
    setShowAddSubjectModal(true);
  };

  const notifyDataChanged = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app_data_changed'));
      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('attendance_system_sync');
          bc.postMessage({ type: 'DATA_CHANGED', timestamp: Date.now() });
          bc.close();
        } catch(e) {}
      }
    }
  };

  const handleSaveSubjectsToBackend = async (facultyId, updatedSubjects, reload = true) => {
    if (reload) setSavingSubjects(true);
    try {
      const facultyObj = faculties.find(f => String(f.id) === String(facultyId));
      if (!facultyObj) throw new Error("Faculty not found");

      const payload = { ...facultyObj, subjects: updatedSubjects };
      delete payload.password; // Do not send hashed password back to backend

      const res = await fetch(`/api/faculty/${facultyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        if (reload) {
          showToast('Subjects Updated! The teaching subjects list has been saved.', 'success', 3000);
          fetchFaculties(); // Reload the faculties list from backend
        }
        notifyDataChanged();
      } else {
        const data = await res.json();
        if (reload) showToast(data.error || 'Failed to save subjects', 'error');
      }
    } catch (err) {
      console.error('Error saving subjects:', err);
      if (reload) showToast('Network error saving subjects', 'error');
    } finally {
      if (reload) setSavingSubjects(false);
    }
  };

  const handleAddSubjectSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newSubName.trim()) {
      showToast('Please enter subject name.', 'warning');
      return;
    }
    if (!newSubFacultyId) {
      showToast('Please select a faculty.', 'warning');
      return;
    }

    const newSubObj = {
      subjectName: newSubName.trim(),
      shortName: newSubShort.trim(),
      code: newSubCode.trim(),
      semester: String(newSubSem || '1'),
      type: newSubType || 'Theory'
    };

    const targetFaculty = faculties.find(f => String(f.id) === String(newSubFacultyId));
    if (!targetFaculty) return;

    let currentFacultySubjects = [];
    if (typeof targetFaculty.subjects === 'string') {
      try { currentFacultySubjects = JSON.parse(targetFaculty.subjects); } catch (e) { currentFacultySubjects = []; }
    } else if (Array.isArray(targetFaculty.subjects)) {
      currentFacultySubjects = [...targetFaculty.subjects];
    }

    if (subjectModalMode === 'add') {
      const isDup = currentFacultySubjects.some(s =>
        (s.subjectName || s.name || '').toLowerCase().trim() === newSubObj.subjectName.toLowerCase().trim() &&
        String(s.semester || '1').replace(/\D/g, '') === String(newSubObj.semester).replace(/\D/g, '')
      );
      if (isDup) {
        showToast(`Subject "${newSubObj.subjectName}" is already added to this faculty for Semester ${newSubObj.semester}.`, 'warning');
        return;
      }
      currentFacultySubjects.push(newSubObj);
    } else if (subjectModalMode === 'edit') {
      const originalSub = (editingSubjectIdx !== null && editingSubjectIdx >= 0) ? allFacultySubjects[editingSubjectIdx] : null;

      if (originalSub && String(originalSub.facultyId) !== String(newSubFacultyId)) {
        // Faculty changed. Remove from old faculty, add to new faculty.
        const oldFaculty = faculties.find(f => String(f.id) === String(originalSub.facultyId));
        if (oldFaculty) {
          let oldSubjects = [];
          if (typeof oldFaculty.subjects === 'string') {
            try { oldSubjects = JSON.parse(oldFaculty.subjects); } catch (e) { oldSubjects = []; }
          } else if (Array.isArray(oldFaculty.subjects)) {
            oldSubjects = [...oldFaculty.subjects];
          }
          oldSubjects = oldSubjects.filter(s =>
            (s.subjectName || s.name || '').toLowerCase() !== (originalSub.subjectName || originalSub.name || '').toLowerCase() ||
            String(s.semester || '1').replace(/\D/g, '') !== String(originalSub.semester || '1').replace(/\D/g, '')
          );
          await handleSaveSubjectsToBackend(oldFaculty.id, oldSubjects, false);
        }
        currentFacultySubjects.push(newSubObj);
      } else {
        // Same faculty
        const localIdx = currentFacultySubjects.findIndex(s => {
          if (!originalSub) return false;
          const nameMatch = (s.subjectName || s.name || '').toLowerCase() === (originalSub.subjectName || originalSub.name || '').toLowerCase();
          const semMatch = String(s.semester || '1').replace(/\D/g, '') === String(originalSub.semester || '1').replace(/\D/g, '');
          return nameMatch && semMatch;
        });
        if (localIdx >= 0) {
          currentFacultySubjects[localIdx] = newSubObj;
        } else {
          currentFacultySubjects.push(newSubObj);
        }
      }
    }

    setNewSubName('');
    setNewSubShort('');
    setNewSubCode('');
    setNewSubSem('1');
    setNewSubType('Theory');
    setNewSubFacultyId('');
    setSubjectModalMode('add');
    setEditingSubjectIdx(null);
    setShowAddSubjectModal(false);

    await handleSaveSubjectsToBackend(targetFaculty.id, currentFacultySubjects, true);
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
    } catch (e) { }
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
  const facultyFileInputRef = useRef(null);
  const subjectFileInputRef = useRef(null);
  const statCardsRef = useRef(null);
  const statsPanelRef = useRef(null);

  // Auto-close expanded stats details panel when clicking outside stat cards and panel
  useEffect(() => {
    if (!activeStatsList) return;

    const handleClickOutside = (event) => {
      if (statCardsRef.current && statCardsRef.current.contains(event.target)) {
        return;
      }
      if (statsPanelRef.current && statsPanelRef.current.contains(event.target)) {
        return;
      }
      if (event.target.closest && (event.target.closest('.modal-overlay') || event.target.closest('.modal-container') || event.target.closest('.modal'))) {
        return;
      }
      setActiveStatsList(null);
      setStatsSemFolder(null);
      setStatsDivFilter('ALL');
      setPresentFacultyFolder(null);
      setPresentSessionFolder(null);
      setAbsentFacultyFolder(null);
      setAbsentSessionFolder(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeStatsList]);

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
    email: user?.email || '',
    mobile: user?.mobile || ''
  });
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        mobile: user.mobile || ''
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
  const [selectedSemFolder, setSelectedSemFolder] = useState(null);
  const [selectedFacultyFolder, setSelectedFacultyFolder] = useState(null);
  const [selectedSessionFolder, setSelectedSessionFolder] = useState(null);
  const [sessionFolderTab, setSessionFolderTab] = useState('present');
  const [folderSearchDate, setFolderSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [folderSearchName, setFolderSearchName] = useState('');
  const [folderDivFilter, setFolderDivFilter] = useState('ALL');
  const [folderDateLoading, setFolderDateLoading] = useState(false);
  const [monitorSemFolder, setMonitorSemFolder] = useState(null);
  const [monitorDivFilter, setMonitorDivFilter] = useState('ALL');
  const [monitorSearchName, setMonitorSearchName] = useState('');
  const [monitorSearchRoll, setMonitorSearchRoll] = useState('');
  const [monitorSearchDate, setMonitorSearchDate] = useState('');

  useEffect(() => {
    if (!folderSearchDate) return;
    let isMounted = true;
    setFolderDateLoading(true);

    const loadFolderData = async () => {
      try {
        const token = localStorage.getItem('attendance_token');
        if (!token) return;

        await Promise.all([
          (async () => {
            try {
              const res = await fetch(`/api/attendance/reports?date=${folderSearchDate}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                const data = await res.json();
                if (isMounted) {
                  if (Array.isArray(data)) {
                    setDateLogs(data);
                  } else if (data.success && Array.isArray(data.report)) {
                    setDateLogs(data.report);
                  }
                }
              }
            } catch (e) {
              console.error('Error fetching date logs:', e);
            }
          })(),
          fetchQrData(folderSearchDate)
        ]);
      } catch (err) {
        console.error('Error fetching folder date data:', err);
      } finally {
        if (isMounted) {
          setFolderDateLoading(false);
        }
      }
    };

    loadFolderData();

    return () => {
      isMounted = false;
    };
  }, [folderSearchDate]);

  // Semesters that actually have attendance records in the currently loaded report
  const availableReportSemesters = React.useMemo(() => {
    if (!Array.isArray(reportData) || reportData.length === 0) return [];
    const semSet = new Set();
    reportData.forEach(row => {
      if (row && row.semester) {
        const semNum = String(row.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(parseInt(semNum));
      }
    });
    return Array.from(semSet).sort((a, b) => a - b);
  }, [reportData]);

  // Calculate available semesters (ONLY created for semesters that currently have active registered students)
  const availableSemesters = React.useMemo(() => {
    const semSet = new Set();

    (students || []).forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [students]);

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
        } catch (e) { }
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
        } catch (e) { }
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  // Fetch faculty records (Non-blocking background refresh if cached)
  const fetchFaculties = async (forceLoading = false) => {
    if (forceLoading || !faculties || faculties.length === 0) {
      setFacultyLoading(true);
    }
    try {
      const res = await fetch('/api/faculty', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFaculties(data);
        try { sessionStorage.setItem('cached_admin_faculties', JSON.stringify(data)); } catch (e) { }
      }
    } catch (err) {
      console.error('Error fetching faculties:', err);
    } finally {
      setFacultyLoading(false);
    }
  };

  // Fetch active QR session and Today's/Selected Date's Session History (both QR and OTP)
  const fetchQrData = async (targetDateOverride = null) => {
    try {
      const dateToFetch = targetDateOverride || folderSearchDate || new Date().toISOString().split('T')[0];

      const [resActive, resTodayQr, resTodayOtp] = await Promise.all([
        fetch('/api/qr/active', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/qr/today?date=${dateToFetch}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/otp/today?date=${dateToFetch}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

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

      let qrSessions = [];
      let otpSessions = [];

      if (resTodayQr.ok) {
        qrSessions = await resTodayQr.json();
      }
      if (resTodayOtp.ok) {
        const otpData = await resTodayOtp.json();
        otpSessions = otpData.otps || [];
      }

      const formattedQr = (qrSessions || []).map((s, idx) => ({
        id: s.id,
        session_no: idx + 1,
        qr_session_id: s.id,
        otp_id: null,
        faculty_name: s.faculty_name || (s.faculty && s.faculty.name) || 'Faculty',
        semester: s.semester,
        division: s.division,
        subject: s.subject || null,
        created_at: s.created_at || s.date,
        expires_at: s.expires_at || (s.created_at ? new Date(new Date(s.created_at).getTime() + 2 * 60000).toISOString() : new Date().toISOString()),
        date: s.date,
        presentCount: s.presentCount || 0
      }));

      const formattedOtp = (otpSessions || []).map((s, idx) => ({
        id: s.id,
        session_no: idx + 1,
        qr_session_id: null,
        otp_id: s.id,
        faculty_name: s.faculty_name || (s.faculty && s.faculty.name) || 'Faculty',
        semester: s.semester,
        division: s.division,
        subject: s.subject || null,
        created_at: s.generated_time || s.created_at || s.date,
        expires_at: s.expires_at || (s.created_at ? new Date(new Date(s.created_at).getTime() + 5 * 60000).toISOString() : new Date().toISOString()),
        date: s.date,
        presentCount: s.presentCount || 0
      }));

      const combined = [...formattedQr, ...formattedOtp];
      setQrSessionHistory(combined);
      try { sessionStorage.setItem('cached_admin_qrhistory', JSON.stringify(combined)); } catch (e) { }
    } catch (err) {
      console.error('Error fetching QR & OTP data in Admin:', err);
    }
  };

  const handleClearQrSessions = async () => {
    const confirm = await Swal.fire({
      title: 'Clear Session History?',
      text: 'This will wipe old session history records and restart session count from #1.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Clear All'
    });

    if (confirm.isConfirmed) {
      try {
        const res = await fetch('/api/qr/clear-history', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setQrSessionHistory([]);
          try { sessionStorage.removeItem('cached_admin_qrhistory'); } catch (e) { }
          showToast('Session history cleared! Session count restarted from #1.', 'success');
        } else {
          setQrSessionHistory([]);
          showToast('Session history cleared locally.', 'info');
        }
      } catch (err) {
        setQrSessionHistory([]);
        showToast('Session history cleared locally.', 'info');
      }
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
        } catch (e) { }
        return updated;
      });
      circle.setLatLng(pos);
    });

    mapRef.current.off('click');
    mapRef.current.on('click', function (e) {
      const coord = e.latlng;
      const newLat = parseFloat(coord.lat.toFixed(6));
      const newLon = parseFloat(coord.lng.toFixed(6));
      setLocationForm(prev => {
        const updated = { ...prev, latitude: newLat, longitude: newLon };
        try {
          sessionStorage.setItem('cached_admin_location', JSON.stringify(updated));
          localStorage.setItem('cached_admin_location', JSON.stringify(updated));
        } catch (e) { }
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
        } catch (e) { }
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
        try { sessionStorage.setItem('cached_admin_livelogs', JSON.stringify(data)); } catch (e) { }
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
      const endOfMonth = new Date(yr, mo, 0).toISOString().split('T')[0]; // last day of month
      query = `?startDate=${startOfMonth}&endDate=${endOfMonth}`;
    } else if (reportType === 'yearly') {
      // reportYear is 'YYYY'
      const yr = parseInt(reportYear, 10);
      const startOfYear = `${yr}-01-01`;
      const endOfYear = `${yr}-12-31`;
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
    fetchAllLeaves();
  }, []);

  // Smart Auto-Polling for Stats, Logs & Sessions (0ms Broadcast Sync for Instant Edits)
  useEffect(() => {
    const isSessionActive = stats.activeQrSession !== null || activeQrSessionDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 25000;

    const interval = setInterval(() => {
      if (isSessionActive) {
        fetchStats();
        fetchLiveLogs();
        fetchQrData();
      } else {
        fetchStats();
        fetchQrData();
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [stats.activeQrSession, activeQrSessionDetails]);

  // Instant Cross-Panel BroadcastChannel & Custom Event Sync
  useEffect(() => {
    const refreshAll = () => {
      fetchStats();
      fetchLiveLogs();
      fetchStudents();
      fetchQrData();
      fetchFaculties();
      fetchQrSettings();
      fetchAllLeaves();
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
        } catch (e) { }
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
        mapRef.current.on('click', function (e) {
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
        } catch (e) { }
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
      } catch (e) { }
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
        } catch (e) { }
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
          email: profileForm.email,
          mobile: profileForm.mobile
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
        showToast(data.error || 'Failed to start QR session', 'error');
      }
    } catch (err) {
      console.error('Error starting QR session:', err);
    }
  };

  // Send imported student batch to backend (Instant 0ms Toast & UI + Silent Background Sync)
  const sendBulkImport = async (studentsList) => {
    // 1. Optimistic Instant UI Update & Instant Toast Notification (0ms latency)
    if (Array.isArray(studentsList) && studentsList.length > 0) {
      setStudents(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const existingEnrollMap = new Map();
        safePrev.forEach((s, idx) => {
          if (s.enrollment_no) existingEnrollMap.set(String(s.enrollment_no).trim().toLowerCase(), idx);
        });

        const merged = [...safePrev];
        studentsList.forEach((st, i) => {
          const key = String(st.enrollment_no || '').trim().toLowerCase();
          const existingIdx = existingEnrollMap.get(key);
          const studentObj = {
            id: st.id || `imp_${Date.now()}_${i}`,
            enrollment_no: st.enrollment_no,
            name: st.name,
            course: st.course || 'B.E.',
            semester: st.semester || '1',
            division: st.division || '',
            roll_no: st.roll_no || '',
            mobile: st.mobile || '0000000000',
            email: st.email || '',
            username: st.enrollment_no
          };
          if (existingIdx !== undefined) {
            merged[existingIdx] = { ...merged[existingIdx], ...studentObj };
          } else {
            merged.unshift(studentObj);
          }
        });

        const sorted = sortStudentList(merged);
        try {
          sessionStorage.setItem('cached_admin_students', JSON.stringify(sorted));
          localStorage.setItem('cached_admin_students', JSON.stringify(sorted));
        } catch (e) { }
        return sorted;
      });

      setStuPage(1); // Jump to page 1 so new students appear on screen instantly
      setStats(prev => {
        const updated = {
          ...prev,
          totalStudents: (prev.totalStudents || 0) + studentsList.length
        };
        try {
          sessionStorage.setItem('cached_admin_stats', JSON.stringify(updated));
          localStorage.setItem('cached_admin_stats', JSON.stringify(updated));
        } catch (e) { }
        return updated;
      });

      // Show toast message INSTANTLY (0ms delay)
      showToast(`Successfully imported ${studentsList.length} student records!`, 'success');
    }

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
        showToast(data.error || 'Your session has expired. Please log in again.', 'error');
        if (onLogout) onLogout();
        return;
      }
      if (response.ok) {
        if (data.errors && data.errors.length > 0) {
          showToast(`Import warnings: ` + data.errors.slice(0, 3).join('; '), 'warning');
        }
        // Silent background fetch (false) to NEVER hide the student list
        fetchStudents(false);
        fetchStats();
      } else {
        fetchStudents(false);
        showToast(data.error || 'Failed to sync imported students with backend.', 'error');
      }
    } catch (err) {
      console.error('Import error:', err);
      fetchStudents(false);
    }
  };

  // Strong Password Validator (min 8 chars, 1 uppercase, 1 digit, 1 special character)
  const validateStrongPassword = (pass) => {
    if (!pass || String(pass).trim() === '') return { isValid: true };
    const trimmed = String(pass).trim();
    if (trimmed.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long.' };
    }
    if (!/[A-Z]/.test(trimmed)) {
      return { isValid: false, message: 'Password must contain at least 1 uppercase letter (A-Z).' };
    }
    if (!/[0-9]/.test(trimmed)) {
      return { isValid: false, message: 'Password must contain at least 1 numeric digit (0-9).' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
      return { isValid: false, message: 'Password must contain at least 1 special character (e.g. @, #, $, !).' };
    }
    return { isValid: true };
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
      let cleanVal = strVal.trim();
      if (cleanVal.includes('.') || cleanVal.includes('e') || cleanVal.includes('E')) {
        const num = Number(cleanVal);
        if (!isNaN(num)) cleanVal = Math.round(num).toString();
      }
      stuObj.enrollment_no = cleanVal;
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
    // 8. Email / Gmail ID
    else if (cleanH.includes('email') || cleanH.includes('gmail') || cleanH.includes('mail')) {
      stuObj.email = strVal;
    }
    // 9. Password
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
          showToast('CSV file is empty or missing data rows.', 'warning');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const studentsList = [];
        let invalidEnrollmentCount = 0;

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

          if (stuObj.enrollment_no || stuObj.name) {
            const cleanEnroll = String(stuObj.enrollment_no || '').replace(/\D/g, '');
            if (!/^\d{10}$/.test(cleanEnroll)) {
              invalidEnrollmentCount++;
              continue;
            }
            stuObj.enrollment_no = cleanEnroll;
            stuObj.course = stuObj.course || 'B.E.';
            stuObj.semester = stuObj.semester || '1';
            stuObj.mobile = stuObj.mobile || '0000000000';
            studentsList.push(stuObj);
          }
        }

        if (invalidEnrollmentCount > 0) {
          showToast(`⚠️ Skipped ${invalidEnrollmentCount} student rows: Enrollment Number must be exactly 10 digits!`, 'warning');
        }

        if (studentsList.length === 0) {
          showToast('Import Failed: Enrollment Number must be exactly 10 digits! No valid student rows found.', 'error');
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
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          const rows = rawRows.filter(r => Array.isArray(r) && r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));

          if (!rows || rows.length < 2) {
            showToast('Excel file is empty or missing data rows.', 'warning');
            return;
          }

          const headers = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
          const studentsList = [];
          let invalidEnrollmentCount = 0;

          for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            if (!values || values.length === 0) continue;

            const stuObj = {};
            headers.forEach((header, index) => {
              let val = values[index] !== undefined && values[index] !== null ? values[index].toString().trim() : '';
              parseHeaderToStudentField(header, val, stuObj);
            });

            if (stuObj.enrollment_no || stuObj.name) {
              const cleanEnroll = String(stuObj.enrollment_no || '').replace(/\D/g, '');
              if (!/^\d{10}$/.test(cleanEnroll)) {
                invalidEnrollmentCount++;
                continue;
              }
              stuObj.enrollment_no = cleanEnroll;
              stuObj.course = stuObj.course || 'B.E.';
              stuObj.semester = stuObj.semester || '1';
              stuObj.mobile = stuObj.mobile || '0000000000';
              studentsList.push(stuObj);
            }
          }

          if (invalidEnrollmentCount > 0) {
            showToast(`⚠️ Skipped ${invalidEnrollmentCount} student rows: Enrollment Number must be exactly 10 digits!`, 'warning');
          }

          if (studentsList.length === 0) {
            showToast('Import Failed: Enrollment Number must be exactly 10 digits! No valid student rows found.', 'error');
            return;
          }

          sendBulkImport(studentsList);
        } catch (err) {
          console.error('Error parsing Excel file:', err);
          showToast('Failed to parse Excel file. Please ensure it is a valid .xlsx file.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      showToast('Invalid file format! Please upload only .csv or .xlsx excel files.', 'error');
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
      if (!studentForm.enrollment_no || !/^\d{10}$/.test(String(studentForm.enrollment_no || '').trim())) {
        showToast('Please enter valid 10-digit Enrollment Number (Required)', 'warning');
        return;
      }
    }

    if (!studentForm.name || !studentForm.name.trim()) {
      showToast('Please enter Student Full Name (Required)', 'warning');
      return;
    }

    if (!/^[A-Za-z\s.'-]+$/.test(studentForm.name.trim())) {
      showToast('Student Name should contain letters only (No numbers allowed)', 'warning');
      return;
    }

    if (!studentForm.email || !studentForm.email.trim()) {
      showToast('Please enter Email ID (Required)', 'warning');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentForm.email.trim())) {
      showToast('Please enter a valid email address (e.g. student@college.com)', 'warning');
      return;
    }

    if (!studentForm.mobile || !/^\d{10}$/.test(String(studentForm.mobile).trim())) {
      showToast('Please enter valid 10-digit mobile number (Required)', 'warning');
      return;
    }

    if (studentForm.password && String(studentForm.password).trim() !== '') {
      const passCheck = validateStrongPassword(studentForm.password);
      if (!passCheck.isValid) {
        showToast(`⚠️ Strong Password Required: ${passCheck.message}`, 'warning', 4000);
        return;
      }
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
          showToast(data.error || 'Your session has expired. Please log in again.', 'error');
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
          try { sessionStorage.setItem('cached_admin_students', JSON.stringify(sorted)); } catch (e) { }
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
            } catch (e) { }
            return updatedStats;
          });

          // Show generated credentials modal details INSTANTLY (< 1-2 seconds)
          setCreatedStudentCredentials({
            email: savedStudent.email || savedStudent.username,
            username: savedStudent.username,
            password: savedStudent.generatedPassword || savedStudent.plain_password || savedStudent.mobile
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
      showToast(err.message || 'Error processing student request', 'error');
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
      entityType: 'student',
      studentId: sId,
      studentName: sName,
      targetIds: [sId]
    });
  };

  // Open Bulk Delete Confirmation Modal (Instant < 1ms, No Browser Blocking)
  const handleBulkDeleteStudents = (idsToDelete) => {
    const ids = idsToDelete || selectedStudentIds;
    if (!ids || ids.length === 0) {
      showToast('Please select at least one student to delete.', 'warning');
      return;
    }

    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      entityType: 'student',
      studentId: null,
      studentName: `${ids.length} selected student(s)`,
      targetIds: ids
    });
  };

  // Execute Confirmed Delete with 0ms Optimistic UI Removal
  const executeConfirmedDelete = async () => {
    const { type, entityType, studentId, targetIds } = deleteConfirmState;
    setDeleteConfirmState({ isOpen: false, type: 'single', entityType: 'student', studentId: null, studentName: '', targetIds: [] });

    if (entityType === 'faculty') {
      const targetIdsList = targetIds && targetIds.length > 0 ? targetIds : (studentId ? [studentId] : []);
      const prevFacs = [...faculties];
      const targetSet = new Set(targetIdsList.map(id => String(id)));

      // Optimistic instant local removal (0ms delay)
      const updatedList = faculties.filter(f => !targetSet.has(String(f.id)));
      setFaculties(updatedList);
      setSelectedFacultyIds(prev => prev.filter(id => !targetSet.has(String(id))));
      setStats(prev => ({ ...prev, totalFaculty: Math.max(0, (prev.totalFaculty || 0) - targetIdsList.length) }));

      try {
        let failedCount = 0;
        for (const fId of targetIdsList) {
          const res = await fetch(`/api/faculty/${fId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) failedCount++;
        }

        if (failedCount === 0) {
          showToast(targetIdsList.length === 1 ? 'Faculty member deleted successfully!' : `Successfully deleted ${targetIdsList.length} faculty member(s).`, 'success');
          fetchFaculties();
          fetchStats();
        } else {
          fetchFaculties();
          showToast(`Failed to delete ${failedCount} faculty member(s)`, 'error');
        }
      } catch (err) {
        console.error('Error deleting faculty:', err);
        setFaculties(prevFacs);
        showToast('Error deleting faculty member(s)', 'error');
      }
      return;
    }

    if (entityType === 'subject') {
      const keysToDelete = new Set(targetIds);
      const facultyUpdates = {};
      allFacultySubjects.forEach(s => {
        if (keysToDelete.has(s.subKey)) {
          if (!facultyUpdates[s.facultyId]) {
            facultyUpdates[s.facultyId] = [];
          }
          facultyUpdates[s.facultyId].push(s);
        }
      });

      try {
        let updatePromises = Object.keys(facultyUpdates).map(async (facId) => {
          const faculty = faculties.find(f => String(f.id) === String(facId));
          if (!faculty) return;
          let currentSubs = [];
          if (typeof faculty.subjects === 'string') {
            try { currentSubs = JSON.parse(faculty.subjects); } catch(e) { currentSubs = []; }
          } else if (Array.isArray(faculty.subjects)) {
            currentSubs = faculty.subjects;
          }

          const removeKeys = new Set(facultyUpdates[facId].map(s => s.subKey));
          const updatedSubs = currentSubs.filter((s, idx) => {
            const key = s.id || s.code || `${faculty.id}_${s.subjectName || s.name || 'sub'}_${idx}`;
            return !removeKeys.has(key);
          });

          await fetch(`/api/faculty/${facId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              name: faculty.name,
              email: faculty.email,
              department: faculty.department,
              mobile: faculty.mobile,
              subjects: updatedSubs
            })
          });
        });

        await Promise.all(updatePromises);
        setSelectedSubjectIds(prev => prev.filter(k => !keysToDelete.has(k)));
        showToast(keysToDelete.size === 1 ? 'Subject deleted successfully!' : `Successfully deleted ${keysToDelete.size} subject(s).`, 'success');
        fetchFaculties();
      } catch (err) {
        console.error('Error deleting subjects:', err);
        showToast('Error deleting subject(s)', 'error');
      }
      return;
    }

    const prevStudents = [...students];
    const targetSet = new Set(targetIds.map(id => String(id)));

    // Optimistic Instant Local Update (0ms delay)
    const updatedList = students.filter(s => !targetSet.has(String(s.id)));
    setStudents(updatedList);
    setSelectedStudentIds(prev => prev.filter(id => !targetSet.has(String(id))));
    setStuPage(1); // Reset page to 1 immediately so remaining students display instantly
    setStats(prev => ({ ...prev, totalStudents: Math.max(0, (prev.totalStudents || 0) - targetIds.length) }));
    try {
      sessionStorage.setItem('cached_admin_students', JSON.stringify(updatedList));
      localStorage.setItem('cached_admin_students', JSON.stringify(updatedList));
    } catch (e) { }

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
        try {
          sessionStorage.setItem('cached_admin_students', JSON.stringify(prevStudents));
          localStorage.setItem('cached_admin_students', JSON.stringify(prevStudents));
        } catch (e) { }
        const data = await res.json();
        if (res.status === 401 || res.status === 403) {
          showToast(data.error || 'Your session has expired. Please log in again.', 'error');
          if (onLogout) onLogout();
          return;
        }
        showToast(data.error || 'Failed to delete student(s) on server.', 'error');
      } else {
        showToast(`Successfully deleted ${targetIds.length} student(s).`, 'success');
        fetchStats();
        fetchStudents(true); // Refreshes actual remaining student list instantly from server
      }
    } catch (err) {
      console.error('Delete execution error:', err);
      setStudents(prevStudents);
      showToast('Network error while deleting students.', 'error');
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

  const toggleSelectFaculty = (id) => {
    setSelectedFacultyIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAllFaculty = () => {
    const filteredFacs = faculties.filter(f =>
      (f.name && f.name.toLowerCase().includes(facultySearchQuery.toLowerCase())) ||
      (f.email && f.email.toLowerCase().includes(facultySearchQuery.toLowerCase()))
    );
    const filteredIds = filteredFacs.map(f => f.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedFacultyIds.includes(id));

    if (allSelected) {
      setSelectedFacultyIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedFacultyIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBulkDeleteFaculty = (idsToDelete) => {
    const ids = idsToDelete || selectedFacultyIds;
    if (!ids || ids.length === 0) {
      showToast('Please select at least one faculty member to delete.', 'warning');
      return;
    }

    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      entityType: 'faculty',
      studentId: null,
      studentName: `${ids.length} selected faculty member(s)`,
      targetIds: ids
    });
  };

  const toggleSelectSubject = (subKey) => {
    setSelectedSubjectIds(prev => {
      if (prev.includes(subKey)) {
        return prev.filter(item => item !== subKey);
      } else {
        return [...prev, subKey];
      }
    });
  };

  const toggleSelectAllSubjects = () => {
    const filteredSubs = allFacultySubjects.filter(sub => {
      if (!subjectSearchQuery || !subjectSearchQuery.trim()) return true;
      const q = subjectSearchQuery.toLowerCase().trim();
      const subName = String(sub.subjectName || sub.name || '').toLowerCase();
      const shortCode = String(sub.shortName || sub.shortCode || sub.short || '').toLowerCase();
      const subCode = String(sub.code || sub.subjectCode || '').toLowerCase();
      const facultyName = String(sub.facultyName || '').toLowerCase();
      return subName.includes(q) || shortCode.includes(q) || subCode.includes(q) || facultyName.includes(q);
    });

    const filteredKeys = filteredSubs.map(s => s.subKey);
    const allSelected = filteredKeys.length > 0 && filteredKeys.every(k => selectedSubjectIds.includes(k));

    if (allSelected) {
      setSelectedSubjectIds(prev => prev.filter(k => !filteredKeys.includes(k)));
    } else {
      setSelectedSubjectIds(prev => Array.from(new Set([...prev, ...filteredKeys])));
    }
  };

  const handleBulkDeleteSubjects = (keysToDelete) => {
    const keys = keysToDelete || selectedSubjectIds;
    if (!keys || keys.length === 0) {
      showToast('Please select at least one subject to delete.', 'warning');
      return;
    }

    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      entityType: 'subject',
      studentId: null,
      studentName: `${keys.length} selected subject(s)`,
      targetIds: keys
    });
  };

  const handleDeleteSubject = (targetSub) => {
    let subKey = null;
    let subName = 'this subject';
    if (typeof targetSub === 'number') {
      const s = allFacultySubjects[targetSub];
      if (s) {
        subKey = s.subKey;
        subName = s.subjectName || s.name || 'this subject';
      }
    } else if (targetSub && typeof targetSub === 'object') {
      subKey = targetSub.subKey;
      subName = targetSub.subjectName || targetSub.name || 'this subject';
    } else {
      subKey = targetSub;
    }

    if (!subKey) return;

    setDeleteConfirmState({
      isOpen: true,
      type: 'single',
      entityType: 'subject',
      studentId: null,
      studentName: subName,
      targetIds: [subKey]
    });
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
      email: '',
      course: '',
      semester: '',
      mobile: '',
      password: ''
    });
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(false);
    setNameTouched(false);
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
      email: student.email || '',
      course: student.course,
      semester: student.semester,
      mobile: student.mobile,
      password: '',
      resetPassword: false
    });
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(false);
    setNameTouched(false);
    setMobileTouched(false);
    setShowStudentModal(true);
  };

  // Faculty CRUD Handlers
  const openAddFacultyModal = () => {
    setFacultyModalMode('add');
    setFacultyForm({
      id: null,
      name: '',
      email: '',
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
      name: faculty.name,
      email: faculty.email || '',
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
    if (!facultyForm.email || !facultyForm.email.trim()) {
      showToast('Email ID is required to add faculty member', 'warning');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facultyForm.email.trim())) {
      showToast('Please enter a valid email address', 'warning');
      return;
    }
    if (facultyForm.mobile && !/^\d{10}$/.test(facultyForm.mobile.trim())) {
      showToast('Please enter valid 10-digit mobile number', 'warning');
      return;
    }

    if (facultyForm.password && String(facultyForm.password).trim() !== '') {
      const passCheck = validateStrongPassword(facultyForm.password);
      if (!passCheck.isValid) {
        showToast(`⚠️ Strong Password Required: ${passCheck.message}`, 'warning', 4000);
        return;
      }
    }
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
          showToast(data.error || 'Your session has expired. Please log in again.', 'error');
          if (onLogout) onLogout();
          return;
        }
        showToast(data.error || 'Failed to save faculty', 'error');
      }
    } catch (err) {
      console.error('Error saving faculty:', err);
      showToast('Error connecting to backend', 'error');
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
        showToast(`Password reset successfully! New Password: ${data.faculty.plain_password}`, 'success');
        fetchFaculties();
      } else {
        showToast(data.error || 'Failed to reset password', 'error');
      }
    } catch (err) {
      console.error('Error resetting password:', err);
    }
  };

  const handleDeleteFaculty = (faculty) => {
    const fId = faculty && typeof faculty === 'object' ? faculty.id : faculty;
    const targetFac = typeof faculty === 'object' ? faculty : faculties.find(f => String(f.id) === String(fId));
    const fName = targetFac ? targetFac.name : 'this faculty member';

    setDeleteConfirmState({
      isOpen: true,
      type: 'single',
      entityType: 'faculty',
      studentId: fId,
      studentName: fName,
      targetIds: [fId]
    });
  };

  // Generate and Download PDF Report
  const handleDownloadPDF = () => {
    if (reportType === 'day_wise') {
      const targetData = dayWiseReportData;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(147, 51, 234);
      doc.text(`DAY-WISE ATTENDANCE REPORT (${reportDate})`, 14, 15);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Generated On: ${new Date().toLocaleString()} | Date: ${reportDate} | Division: ${reportDivFilter} | Total Records: ${targetData.length}`, 14, 21);

      const tableColumn = [
        'Roll No', 'Name', 'Division', 'Subject', 'Subject Code',
        'Date', 'Session Time', 'Status'
      ];
      const tableRows = targetData.map(row => [
        row.roll_no,
        row.name,
        row.division,
        row.subject,
        row.subject_code,
        row.date,
        row.session_time,
        row.status
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        headStyles: { fillColor: [147, 51, 234] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          7: { fontStyle: 'bold' }
        }
      });

      doc.save(`Day_Wise_Report_${reportDate}.pdf`);
      return;
    }
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
    if (reportType === 'subject_wise') {
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
      return;
    }

    if (reportType === 'summary') {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(147, 51, 234);
      doc.text('ACADEMIC & ATTENDANCE SUMMARY REPORT', 14, 15);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Generated On: ${new Date().toLocaleString()} | Total Records: ${summaryReportData.length}`, 14, 21);

      const tableColumn = [
        'Roll No', 'Name', 'Email', 'Mobile', 'Department', 'Sem', 'Div',
        'Total', 'Present', 'Absent', 'Att %', 'Status', 'Def %', 'Joined Date'
      ];
      const tableRows = summaryReportData.map(row => [
        row.roll_no,
        row.name,
        row.email,
        row.mobile,
        row.department,
        row.semester,
        row.division,
        row.total_attendance,
        row.present,
        row.absent,
        row.attendance_percentage,
        row.defaulter_status,
        row.defaulter_percentage,
        row.joined_date
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        headStyles: { fillColor: [147, 51, 234] },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          10: { fontStyle: 'bold' },
          11: { fontStyle: 'bold' }
        }
      });

      doc.save(`Summary_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      return;
    }

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
    if (reportType === 'day_wise') {
      const cleanData = dayWiseReportData.map(row => ({
        'Roll No': row.roll_no,
        'Name': row.name,
        'Division': row.division,
        'Subject': row.subject,
        'Subject Code': row.subject_code,
        'Date': row.date,
        'Session Time': row.session_time,
        'Status': row.status
      }));

      const worksheet = XLSX.utils.json_to_sheet(cleanData);
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 16 },
        { wch: 14 }, { wch: 20 }, { wch: 12 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Day Wise Attendance');
      XLSX.writeFile(workbook, `Day_Wise_Report_${reportDate}.xlsx`);
      return;
    }
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
    if (reportType === 'subject_wise') {
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

      // Enable native Excel AutoFilter dropdown arrows on Semester, Division, Subject columns (Cols C1 to E1)
      if (worksheet['!ref']) worksheet['!autofilter'] = { ref: 'C1:E1' };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Wise Report');
      XLSX.writeFile(workbook, `Subject_Wise_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

    if (reportType === 'summary') {
      const cleanSummaryData = summaryReportData.map(row => ({
        'Roll No': row.roll_no,
        'Name': row.name,
        'Email': row.email,
        'Mobile': row.mobile,
        'Department': row.department,
        'Semester': row.semester,
        'Division': row.division,
        'Total Attendance': row.total_attendance,
        'Present': row.present,
        'Absent': row.absent,
        'Attendance %': row.attendance_percentage,
        'Defaulter Percentage': row.defaulter_percentage,
        'Defaulter Status': row.defaulter_status,
        'Joined Date': row.joined_date
      }));

      const worksheet = XLSX.utils.json_to_sheet(cleanSummaryData);

      // Auto column widths
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 22 }, { wch: 25 }, { wch: 14 },
        { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
        { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }
      ];

      // Enable native Excel AutoFilter dropdown arrows ONLY on Department, Semester, Division (Cols E1 to G1), removing filter arrows from middle columns while keeping column order unchanged
      if (worksheet['!ref']) worksheet['!autofilter'] = { ref: 'E1:G1' };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary Report');

      XLSX.writeFile(workbook, `Summary_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

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
    if (reportType === 'day_wise') {
      const cleanData = dayWiseReportData.map(row => ({
        'Roll No': row.roll_no,
        'Name': row.name,
        'Division': row.division,
        'Subject': row.subject,
        'Subject Code': row.subject_code,
        'Date': row.date,
        'Session Time': row.session_time,
        'Status': row.status
      }));

      const worksheet = XLSX.utils.json_to_sheet(cleanData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Day Wise Attendance');
      XLSX.writeFile(workbook, `Day_Wise_Report_${reportDate}.csv`);
      return;
    }
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
    if (reportType === 'subject_wise') {
      const cleanSubjectData = subjectReportData.map(row => ({
        'Roll No': row.roll_no,
        'Name': row.name,
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
      return;
    }
    if (reportType === 'summary') {
      const cleanSummaryData = summaryReportData.map(row => ({
        'Roll No': row.roll_no,
        'Name': row.name,
        'Email': row.email,
        'Mobile': row.mobile,
        'Department': row.department,
        'Semester': row.semester,
        'Division': row.division,
        'Total Attendance': row.total_attendance,
        'Present': row.present,
        'Absent': row.absent,
        'Attendance %': row.attendance_percentage,
        'Defaulter Status': row.defaulter_status,
        'Defaulter Percentage': row.defaulter_percentage,
        'Joined Date': row.joined_date
      }));

      const worksheet = XLSX.utils.json_to_sheet(cleanSummaryData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary Report');
      XLSX.writeFile(workbook, `Summary_Report_${new Date().toISOString().split('T')[0]}.csv`);
      return;
    }

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
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = !q ||
        (s.name && String(s.name).toLowerCase().includes(q)) ||
        (s.enrollment_no && String(s.enrollment_no).toLowerCase().includes(q));
      const matchSem = !stuSemFilter || String(s.semester) === String(stuSemFilter);
      const matchDiv = !stuDivFilter ||
        (stuDivFilter === 'none' ? !s.division || s.division.trim() === '' : String(s.division).toLowerCase() === stuDivFilter.toLowerCase());
      return matchSearch && matchSem && matchDiv;
    }
  ));

  // Export all / filtered student records to XLSX Excel file
  const handleExportStudentsData = () => {
    const listToExport = filteredStudents && filteredStudents.length > 0 ? filteredStudents : students;
    if (!listToExport || listToExport.length === 0) {
      showToast('No student data available to export.', 'warning');
      return;
    }

    const exportRows = listToExport.map((s, idx) => ({
      'S.No': idx + 1,
      'Roll No': s.roll_no || '-',
      'Enrollment No': s.enrollment_no || '-',
      'Full Name': s.name || '-',
      'Course': s.course || '-',
      'Semester': s.semester ? `Sem ${s.semester}` : '-',
      'Division': s.division || '-',
      'Mobile No (Password)': s.mobile || '-',
      'Gmail ID': s.email || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students List');
    const fileName = `Students_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast(`Successfully exported ${listToExport.length} student records to ${fileName}!`, 'success');
  };

  // Execute semester promotion for all students
  const executePromoteStudents = async () => {
    setPromoteLoading(true);
    try {
      const res = await fetch('/api/students/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || '🎉 Students promoted successfully! Semester folders and class data updated.', 'success', 5000);
        setPromoteStep(0);
        setSelectedSemFolder(null);
        setSelectedSessionFolder(null);
        await Promise.all([
          fetchStudents(true),
          fetchStats(),
          fetchLiveLogs(),
          fetchQrData()
        ]);
      } else {
        showToast(data.error || 'Failed to promote students.', 'error');
      }
    } catch (err) {
      console.error('Error promoting students:', err);
      showToast('Network error while promoting students.', 'error');
    } finally {
      setPromoteLoading(false);
    }
  };

  // Send imported faculty batch to backend
  const sendBulkFacultyImport = async (facultyList) => {
    try {
      const response = await fetch('/api/faculty/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ faculty: facultyList })
      });
      const data = await response.json();
      if (response.ok) {
        let msg = `Successfully imported ${data.successCount} faculty members!`;
        if (data.errors && data.errors.length > 0) {
          msg += ` Errors: ` + data.errors.slice(0, 5).join('; ');
        }
        showToast(msg, 'success');
        fetchFaculties();
      } else {
        showToast(data.error || 'Failed to import faculty data.', 'error');
      }
    } catch (err) {
      console.error('Faculty import error:', err);
      showToast('Network error while importing faculty data.', 'error');
    }
  };

  // Download Faculty Excel Sample Template (Headers only)
  const handleDownloadFacultySampleTemplate = () => {
    const headers = [['Full Name', 'Email ID', 'Department', 'Mobile No', 'Password']];
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Faculty Sample');
    XLSX.writeFile(workbook, 'Faculty_Bulk_Upload_Sample.xlsx');
  };

  // Download Student Excel Sample Template (Headers only)
  const handleDownloadStudentSampleTemplate = () => {
    const headers = [['Enrollment No', 'Full Name', 'Roll No', 'Division', 'Course', 'Semester', 'Mobile No', 'Email ID', 'Password']];
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Sample');
    XLSX.writeFile(workbook, 'Student_Bulk_Upload_Sample.xlsx');
  };

  // Download Subject Excel Sample Template (Headers only)
  const handleDownloadSubjectSampleTemplate = () => {
    const headers = [['Subject Name', 'Short Name', 'Subject Code', 'Semester', 'Type', 'Faculty Email']];
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject Sample');
    XLSX.writeFile(workbook, 'Subject_Bulk_Upload_Sample.xlsx');
  };

  // CSV & XLSX subject import handler
  const handleSubjectImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType !== 'csv' && fileType !== 'xlsx' && fileType !== 'xls') {
      showToast('Invalid file format! Please upload only .csv or .xlsx excel files.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let rows = [];
        const data = new Uint8Array(event.target.result);

        try {
          const workbook = XLSX.read(data, { type: 'array', raw: false, cellDates: true });
          if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              if (!worksheet) continue;
              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
              const validRows = rawRows.filter(r =>
                Array.isArray(r) && r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
              );
              if (validRows.length >= 2) {
                rows = validRows;
                break;
              } else if (validRows.length > rows.length) {
                rows = validRows;
              }
            }
          }
        } catch (xlsxErr) {
          console.warn('XLSX read attempt failed for subject import:', xlsxErr);
        }

        if (!rows || rows.length < 2) {
          try {
            const textDecoder = new TextDecoder('utf-8');
            const text = textDecoder.decode(data);
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length >= 2) {
              let delimiter = ',';
              if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';
              else if (lines[0].includes('\t') && !lines[0].includes(',')) delimiter = '\t';
              rows = lines.map(line => line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '')));
            }
          } catch (txtErr) {
            console.warn('Text fallback failed for subject import:', txtErr);
          }
        }

        if (!rows || rows.length < 2) {
          showToast('File is empty or missing data rows. Please ensure your file has headers and at least 1 data row.', 'warning');
          return;
        }

        const headers = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
        let importedCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const values = rows[i];
          if (!values || values.length === 0) continue;

          let subName = '', shortName = '', code = '', semester = '1', type = 'Theory', facEmail = '';

          headers.forEach((h, idx) => {
            const val = values[idx] !== undefined && values[idx] !== null ? values[idx].toString().trim() : '';
            const cleanH = h ? h.toString().trim().toLowerCase() : '';

            if (cleanH.includes('subject name') || cleanH.includes('sub name') || (cleanH.includes('name') && !cleanH.includes('short') && !cleanH.includes('fac'))) {
              subName = val;
            } else if (cleanH.includes('short')) {
              shortName = val;
            } else if (cleanH.includes('code')) {
              code = val;
            } else if (cleanH.includes('sem')) {
              semester = val.replace(/\D/g, '') || '1';
            } else if (cleanH.includes('type')) {
              type = val || 'Theory';
            } else if (cleanH.includes('email') || cleanH.includes('fac') || cleanH.includes('teacher')) {
              facEmail = val;
            }
          });

          if (subName) {
            let targetFaculty = faculties.find(f => f.email && f.email.toLowerCase() === facEmail.toLowerCase());
            if (!targetFaculty && faculties.length > 0) targetFaculty = faculties[0];

            if (targetFaculty) {
              const currentSubs = Array.isArray(targetFaculty.subjects) ? [...targetFaculty.subjects] : [];
              const exists = currentSubs.some(s => (s.subjectName || s.name) === subName && String(s.semester) === String(semester));
              if (!exists) {
                currentSubs.push({
                  subjectName: subName,
                  shortName: shortName || subName.substring(0, 4).toUpperCase(),
                  code: code || `SUB${Math.floor(100 + Math.random() * 900)}`,
                  semester: semester || '1',
                  type: type || 'Theory'
                });
                await handleSaveSubjectsToBackend(targetFaculty.id, currentSubs, false);
                importedCount++;
              }
            }
          }
        }

        fetchFaculties();
        showToast(`Successfully imported ${importedCount} subjects!`, 'success');
      } catch (err) {
        console.error('Error importing subjects file:', err);
        showToast('Failed to parse subject file.', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExportSubjectsData = () => {
    if (!allFacultySubjects || allFacultySubjects.length === 0) {
      showToast('No subject data available to export.', 'warning');
      return;
    }

    const filtered = allFacultySubjects.filter(sub => {
      const q = (subjectSearchQuery || '').toLowerCase();
      const sName = (sub.subjectName || sub.name || '').toLowerCase();
      const sCode = (sub.code || sub.subjectCode || '').toLowerCase();
      return !q || sName.includes(q) || sCode.includes(q);
    });

    const listToExport = filtered.length > 0 ? filtered : allFacultySubjects;

    const exportRows = listToExport.map((sub, idx) => {
      return {
        'S.No': idx + 1,
        'Subject Name': sub.subjectName || sub.name || '-',
        'Short Name': sub.shortName || sub.shortCode || '-',
        'Subject Code': sub.code || sub.subjectCode || '-',
        'Semester': sub.semester ? `Semester ${sub.semester}` : '-',
        'Faculty Name': sub.facultyName || '-',
        'Type': sub.type || sub.subjectType || 'Theory'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Subject List');
    const fileName = `Subject_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast(`Successfully exported ${listToExport.length} subjects to ${fileName}!`, 'success');
  };

  // CSV & XLSX faculty import handler
  const handleFacultyImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType !== 'csv' && fileType !== 'xlsx' && fileType !== 'xls') {
      showToast('Invalid file format! Please upload only .csv or .xlsx excel files.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let rows = [];
        const data = new Uint8Array(event.target.result);

        // First attempt: Try reading via XLSX library across ALL sheets in workbook
        try {
          const workbook = XLSX.read(data, { type: 'array', raw: false, cellDates: true });
          if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              if (!worksheet) continue;
              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
              const validRows = rawRows.filter(r =>
                Array.isArray(r) && r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
              );
              if (validRows.length >= 2) {
                rows = validRows;
                break;
              } else if (validRows.length > rows.length) {
                rows = validRows;
              }
            }
          }
        } catch (xlsxErr) {
          console.warn('XLSX read attempt failed, falling back to text decoder:', xlsxErr);
        }

        // Second attempt: Fallback to plain text splitting if rows is still empty (useful for raw CSV/TSV)
        if (!rows || rows.length < 2) {
          try {
            const textDecoder = new TextDecoder('utf-8');
            const text = textDecoder.decode(data);
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length >= 2) {
              let delimiter = ',';
              if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';
              else if (lines[0].includes('\t') && !lines[0].includes(',')) delimiter = '\t';
              rows = lines.map(line => line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '')));
            }
          } catch (txtErr) {
            console.warn('Text fallback failed:', txtErr);
          }
        }

        if (!rows || rows.length < 2) {
          showToast('File is empty or missing data rows. Please ensure your file has headers and at least 1 data row.', 'warning');
          return;
        }

        const headers = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
        const facultyList = [];

        for (let i = 1; i < rows.length; i++) {
          const values = rows[i];
          if (!values || values.length === 0) continue;

          const facObj = {};
          headers.forEach((h, idx) => {
            const val = values[idx] !== undefined && values[idx] !== null ? values[idx].toString().trim() : '';
            const cleanH = h ? h.toString().trim().toLowerCase() : '';

            if (cleanH.includes('name')) {
              facObj.name = val;
            } else if (cleanH.includes('email') || cleanH.includes('gmail') || cleanH.includes('mail')) {
              facObj.email = val;
            } else if (cleanH.includes('dept') || cleanH.includes('department')) {
              facObj.department = val;
            } else if (cleanH.includes('mobile') || cleanH.includes('phone') || cleanH.includes('contact')) {
              facObj.mobile = val;
            } else if (cleanH.includes('pass')) {
              facObj.password = val;
            }
          });

          if (facObj.name || facObj.email) {
            facObj.name = facObj.name || `Faculty ${i}`;
            facObj.email = facObj.email || `faculty_${Date.now()}_${i}@college.edu`;
            facObj.department = facObj.department || 'BCA';
            facObj.mobile = facObj.mobile || '0000000000';
            facultyList.push(facObj);
          }
        }

        if (facultyList.length === 0) {
          showToast('Import Failed: No valid faculty records found in file.', 'error');
          return;
        }

        sendBulkFacultyImport(facultyList);
      } catch (err) {
        console.error('Error reading faculty file:', err);
        showToast('Failed to parse file. Please ensure it is a valid CSV or XLSX file.', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExportFacultyData = () => {
    const filteredFaculties = faculties.filter(f =>
      (f.name && f.name.toLowerCase().includes(facultySearchQuery.toLowerCase())) ||
      (f.email && f.email.toLowerCase().includes(facultySearchQuery.toLowerCase()))
    );

    const listToExport = filteredFaculties.length > 0 ? filteredFaculties : faculties;
    if (!listToExport || listToExport.length === 0) {
      showToast('No faculty data available to export.', 'warning');
      return;
    }

    const exportRows = listToExport.map((f, idx) => {
      return {
        'S.No': idx + 1,
        'Full Name': f.name || '-',
        'Email ID': f.email || '-',
        'Department': f.department ? f.department.split('||SUB:')[0].trim() : '-',
        'Mobile No': f.mobile || '-',
        'Password': f.plain_password || '********'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Faculty List');
    const fileName = `Faculty_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast(`Successfully exported ${listToExport.length} faculty records to ${fileName}!`, 'success');
  };

  return (
    <div className="admin-dashboard-root">
      {/* Mobile Floating Bottom-Right Hamburger Menu Button */}
      {showFloatingMobileMenu && !isAnyAdminModalOpen && (
        <button
          type="button"
          className="admin-floating-mobile-toggle"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          title={mobileSidebarOpen ? "Close Menu" : "Open Menu"}
        >
          {mobileSidebarOpen ? <X size={26} strokeWidth={2.5} /> : <Menu size={26} strokeWidth={2.5} />}
        </button>
      )}

      {/* Mobile Floating Bottom-Right Student Actions Toggle Button (Positioned right ABOVE the hamburger button when in Students tab, or at bottom 24px when hamburger is OFF) */}
      {activeTab === 'students' && !isAnyAdminModalOpen && (
        <button
          type="button"
          className={`student-floating-mobile-actions-toggle ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          onClick={() => setShowStudentMobileActions(!showStudentMobileActions)}
          title={showStudentMobileActions ? "Close Student Actions" : "Open Student Actions"}
          style={{
            bottom: showFloatingMobileMenu ? '92px' : '24px'
          }}
        >
          {showStudentMobileActions ? (
            <ChevronRight size={26} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={26} strokeWidth={2.5} />
          )}
        </button>
      )}

      {/* Mobile Backdrop Overlay for Student Actions */}
      {activeTab === 'students' && !isAnyAdminModalOpen && showStudentMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowStudentMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container (Positioned dynamically based on hamburger setting) */}
      {activeTab === 'students' && !isAnyAdminModalOpen && showStudentMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            onClick={() => { setShowStudentMobileActions(false); handleDownloadStudentSampleTemplate(); }}
            style={{
              padding: '8px 14px',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            title="Download sample Excel file format for student import"
          >
            <FileSpreadsheet size={16} color="#c084fc" />
            <span>Sample Format</span>
          </button>

          <button
            onClick={() => { setShowStudentMobileActions(false); fileInputRef.current && fileInputRef.current.click(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Import student records batch from CSV/Excel"
          >
            <Upload size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Bulk Upload</span>
          </button>

          <button
            onClick={() => { setShowStudentMobileActions(false); handleExportStudentsData(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Export all student records to Excel file"
          >
            <Download size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Export Data</span>
          </button>

          <button
            onClick={() => { setShowStudentMobileActions(false); setPromoteStep(1); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Promote all students to next semester (Sem 1..7 -> +1, Sem 8 -> Graduate & Remove)"
          >
            <TrendingUp size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Promote</span>
          </button>

          <button className="btn btn-primary full-width-mobile" onClick={() => { setShowStudentMobileActions(false); openAddModal(); }} style={{ color: '#ffffff' }}>
            <Plus size={16} color="#ffffff" /> <span style={{ color: '#ffffff' }}>Add Student</span>
          </button>
        </div>
      )}

      {/* Mobile Floating Bottom-Right Faculty Actions Toggle Button */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && (
        <button
          type="button"
          className={`student-floating-mobile-actions-toggle ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          onClick={() => setShowFacultyMobileActions(!showFacultyMobileActions)}
          title={showFacultyMobileActions ? "Close Faculty Actions" : "Open Faculty Actions"}
          style={{
            bottom: showFloatingMobileMenu ? '92px' : '24px'
          }}
        >
          {showFacultyMobileActions ? (
            <ChevronRight size={26} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={26} strokeWidth={2.5} />
          )}
        </button>
      )}

      {/* Mobile Backdrop Overlay for Faculty Actions */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && showFacultyMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowFacultyMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container for Faculty */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && showFacultyMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            onClick={() => { setShowFacultyMobileActions(false); handleDownloadFacultySampleTemplate(); }}
            style={{
              padding: '8px 14px',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            title="Download sample Excel file format for faculty import"
          >
            <FileSpreadsheet size={16} color="#c084fc" />
            <span>Sample Format</span>
          </button>

          <button
            onClick={() => { setShowFacultyMobileActions(false); facultyFileInputRef.current && facultyFileInputRef.current.click(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Import faculty batch from CSV or Excel"
          >
            <Upload size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Bulk Upload</span>
          </button>

          <button
            onClick={() => { setShowFacultyMobileActions(false); handleExportFacultyData(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Export faculty records to Excel file"
          >
            <Download size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Export Data</span>
          </button>

          <button className="btn btn-primary full-width-mobile" onClick={() => { setShowFacultyMobileActions(false); openAddFacultyModal(); }} style={{ color: '#ffffff' }}>
            <Plus size={16} color="#ffffff" /> <span style={{ color: '#ffffff' }}>Add Faculty</span>
          </button>
        </div>
      )}

      {/* Mobile Floating Bottom-Right Subject Actions Toggle Button */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && (
        <button
          type="button"
          className={`student-floating-mobile-actions-toggle ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          onClick={() => setShowSubjectMobileActions(!showSubjectMobileActions)}
          title={showSubjectMobileActions ? "Close Subject Actions" : "Open Subject Actions"}
          style={{
            bottom: showFloatingMobileMenu ? '92px' : '24px'
          }}
        >
          {showSubjectMobileActions ? (
            <ChevronRight size={26} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={26} strokeWidth={2.5} />
          )}
        </button>
      )}

      {/* Mobile Backdrop Overlay for Subject Actions */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && showSubjectMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowSubjectMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container for Subject */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && showSubjectMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            onClick={() => { setShowSubjectMobileActions(false); handleDownloadSubjectSampleTemplate(); }}
            style={{
              padding: '8px 14px',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            title="Download sample Excel file format for subject import"
          >
            <FileSpreadsheet size={16} color="#c084fc" />
            <span>Sample Format</span>
          </button>

          <button
            onClick={() => { setShowSubjectMobileActions(false); subjectFileInputRef.current && subjectFileInputRef.current.click(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Import subject records batch from CSV or Excel"
          >
            <Upload size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Bulk Upload</span>
          </button>

          <button
            onClick={() => { setShowSubjectMobileActions(false); handleExportSubjectsData(); }}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease'
            }}
            title="Export subject records to Excel file"
          >
            <Download size={16} color="#ffffff" />
            <span style={{ color: '#ffffff' }}>Export Data</span>
          </button>

          <button className="btn btn-primary full-width-mobile" onClick={() => { setShowSubjectMobileActions(false); handleOpenAddSubjectModal(); }} style={{ color: '#ffffff' }}>
            <Plus size={16} color="#ffffff" /> <span style={{ color: '#ffffff' }}>Add Subject</span>
          </button>
        </div>
      )}

      {/* Mobile Backdrop Overlay when sidebar is open */}
      {mobileSidebarOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="admin-layout">
        <aside className={`admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
          <div className="admin-sidebar-brand">
            <div className="admin-logo-box">
              <GraduationCap size={24} color="#0f172a" strokeWidth={2.5} />
            </div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">EduMark</span>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            <button
              className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setActiveTab('dashboard'); setMobileSidebarOpen(false); }}
            >
              <LayoutGrid size={19} />
              <span>Dashboard</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => { setActiveTab('students'); setMobileSidebarOpen(false); }}
            >
              <Users size={19} />
              <span>Students</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'faculty' ? 'active' : ''}`}
              onClick={() => { setActiveTab('faculty'); setMobileSidebarOpen(false); }}
            >
              <GraduationCap size={19} />
              <span>Faculty</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'subjects' ? 'active' : ''}`}
              onClick={() => { setActiveTab('subjects'); setMobileSidebarOpen(false); }}
            >
              <BookOpen size={19} />
              <span>Subject</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'attendance_logs' ? 'active' : ''}`}
              onClick={() => { setActiveTab('attendance_logs'); setMobileSidebarOpen(false); fetchLiveLogs(); }}
            >
              <ClipboardList size={19} />
              <span>Attendance Logs</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'otp' ? 'active' : ''}`}
              onClick={() => { setActiveTab('otp'); setMobileSidebarOpen(false); }}
            >
              <QrCode size={19} />
              <span>QR Attendance</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'location' ? 'active' : ''}`}
              onClick={() => { setActiveTab('location'); setMobileSidebarOpen(false); }}
            >
              <MapPin size={19} />
              <span>College Location</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'leaves' ? 'active' : ''}`}
              onClick={() => { setActiveTab('leaves'); setMobileSidebarOpen(false); fetchAllLeaves(); }}
            >
              <FileText size={19} />
              <span>Leave Request</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'defaulters' ? 'active' : ''}`}
              onClick={() => { setActiveTab('defaulters'); setMobileSidebarOpen(false); }}
            >
              <AlertTriangle size={19} />
              <span>Defaulters</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => { setActiveTab('reports'); setMobileSidebarOpen(false); }}
            >
              <Download size={19} />
              <span>Reports</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setMobileSidebarOpen(false); }}
            >
              <Settings size={19} />
              <span>Profile & Settings</span>
            </button>
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-user-profile-card">
              <div className="admin-user-avatar">
                <GraduationCap size={20} color="#0f172a" />
              </div>
              <div className="admin-user-details">
                <span className="admin-user-profile-name">{user?.name || 'Parth Joshi'}</span>
                <span className="admin-user-profile-email">{user?.email || 'parthsir.lj@gmail.com'}</span>
              </div>
            </div>

            <button className="admin-logout-btn" onClick={onLogout}>
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        <div className="admin-main-wrapper content-light">
          <header className={`admin-top-header-banner ${activeTab === 'dashboard' ? 'dashboard-header-tall' : ''}`}>
            <div className="admin-banner-content">
              <div className="admin-header-title-row" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {!showFloatingMobileMenu && (
                  <button
                    type="button"
                    className="admin-side-menu-top-btn"
                    onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                    title={mobileSidebarOpen ? "Close Side Menu" : "Open Side Menu"}
                  >
                    {mobileSidebarOpen ? (
                      <X size={22} color="#ffffff" strokeWidth={2.5} />
                    ) : (
                      <Menu size={22} color="#ffffff" strokeWidth={2.5} />
                    )}
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h1 className="admin-banner-title">
                    {activeTab === 'dashboard' ? 'Dashboard' :
                      activeTab === 'students' ? 'Students' :
                        activeTab === 'faculty' ? 'Faculty' :
                          activeTab === 'attendance_logs' ? 'Attendance Logs' :
                            activeTab === 'subjects' ? 'Subject' :
                              activeTab === 'otp' ? 'QR Attendance' :
                                activeTab === 'location' ? 'College Location' :
                                  activeTab === 'leaves' ? 'Leave Request' :
                                    activeTab === 'defaulters' ? 'Defaulters' :
                                      activeTab === 'reports' ? 'Reports' :
                                        activeTab === 'settings' ? 'Profile & Settings' : 'Dashboard'}
                  </h1>
                  <p className="admin-banner-subtitle" style={{ margin: 0 }}>
                    Welcome back, <strong className="admin-banner-username">{user?.name || 'Parth Joshi'}</strong> 👋
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Tab Panels */}
          <main className="admin-main-content">

            {/* PANEL 1: DASHBOARD MONITOR */}
            {activeTab === 'dashboard' && (
              <div style={styles.tabPanel}>
                {/* Stats Overview (Photo 2 V2 Card Layout) */}
                <div className="dashboard-grid" ref={statCardsRef}>
                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #09355c, #0f4c81)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(9, 53, 92, 0.3)' }}>
                        <Users size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Students</span>
                        <div className="stat-card-value" style={{ fontSize: '2.2rem', fontWeight: '800', color: '#09355c', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {statsLoading ? '...' : stats.totalStudents}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #00a86b, #059669)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(0, 168, 107, 0.3)' }}>
                        <GraduationCap size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Faculty<br />Members</span>
                        <div className="stat-card-value" style={{ fontSize: '2.2rem', fontWeight: '800', color: '#00a86b', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {statsLoading ? '...' : (stats.totalFaculty || 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(168, 85, 247, 0.3)' }}>
                        <FileText size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Subjects</span>
                        <div className="stat-card-value" style={{ fontSize: '2.2rem', fontWeight: '800', color: '#9333ea', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {allFacultySubjects.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #e69500, #f59e0b)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(230, 149, 0, 0.3)' }}>
                        <Calendar size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Leave<br />Requests</span>
                        <div className="stat-card-value" style={{ fontSize: '2.2rem', fontWeight: '800', color: '#d97706', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {leavesLoading ? '...' : (allLeaves?.length || 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(220, 38, 38, 0.3)' }}>
                        <AlertTriangle size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Defaulters</span>
                        <div className="stat-card-value" style={{ fontSize: '2.2rem', fontWeight: '800', color: '#dc2626', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {statsLoading ? '...' : (stats.totalDefaulters || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions Panel */}
                <div className="glass-panel" style={{
                  padding: '24px 28px',
                  borderRadius: '20px',
                  marginBottom: '28px',
                  background: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <TrendingUp size={22} color="#f59e0b" style={{ strokeWidth: 2.5 }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                      Quick Actions
                    </h3>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '20px'
                  }}>
                    {/* Action 1: Manage Students */}
                    <div
                      onClick={() => { setActiveTab('students'); setMobileSidebarOpen(false); }}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '32px 28px',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.02)';
                      }}
                    >
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: '#042e6f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 4px 12px rgba(4, 46, 111, 0.25)'
                      }}>
                        <UserPlus size={24} color="#ffffff" style={{ strokeWidth: 2.2 }} />
                      </div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                        Manage Students
                      </h4>
                      <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        Add, edit, or import students
                      </p>
                    </div>

                    {/* Action 2: View Defaulters */}
                    <div
                      onClick={() => { setActiveTab('defaulters'); setMobileSidebarOpen(false); }}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '32px 28px',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.02)';
                      }}
                    >
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: '#e11d48',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)'
                      }}>
                        <AlertTriangle size={24} color="#ffffff" style={{ strokeWidth: 2.2 }} />
                      </div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                        View Defaulters
                      </h4>
                      <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        Check attendance defaulters list
                      </p>
                    </div>

                    {/* Action 3: Analytics */}
                    <div
                      onClick={() => { setActiveTab('reports'); setMobileSidebarOpen(false); }}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '32px 28px',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.02)';
                      }}
                    >
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
                      }}>
                        <TrendingUp size={24} color="#0f172a" style={{ strokeWidth: 2.2 }} />
                      </div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                        Analytics
                      </h4>
                      <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        View insights and analytics
                      </p>
                    </div>
                  </div>
                </div>

                {/* Clickable Stats Details List */}
                {activeStatsList && (
                  <div className="glass-panel" ref={statsPanelRef} style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                        {activeStatsList === 'total' && statsSemFolder === null && 'Total Registered Students'}
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
                        onClick={() => { setActiveStatsList(null); setStatsSemFolder(null); setStatsDivFilter('ALL'); setPresentFacultyFolder(null); setPresentSessionFolder(null); setAbsentFacultyFolder(null); setAbsentSessionFolder(null); }}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.82rem',
                          fontWeight: '600',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#1e293b',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#0284c7';
                          e.currentTarget.style.color = '#0284c7';
                          e.currentTarget.style.background = '#f0f9ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.color = '#1e293b';
                          e.currentTarget.style.background = '#ffffff';
                        }}
                      >
                        <X size={14} />
                        <span>Close Panel</span>
                      </button>
                    </div>

                    {activeStatsList === 'total' && (
                      statsSemFolder === null ? (
                        <div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0', marginBottom: '28px' }}>
                            Click on any Semester Folder to view registered students for that semester.
                          </p>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '16px',
                            marginTop: '28px'
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
                                ← Back
                              </button>
                              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                Semester {statsSemFolder} ({filteredStudents.length} Students)
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
                                    <th>Gmail ID</th>
                                    <th>Name</th>
                                    <th>Course</th>
                                    {hasDivisions && <th>Division</th>}
                                    <th>Mobile No</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredStudents.length === 0 ? (
                                    <tr><td colSpan={hasDivisions ? 7 : 6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No students found for this semester/division.</td></tr>
                                  ) : (
                                    filteredStudents.map(s => (
                                      <tr key={s.id}>
                                        <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{s.roll_no || '-'}</td>
                                        <td>{s.enrollment_no}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{s.email || '—'}</td>
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
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0', marginBottom: '28px' }}>
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
                                gap: '16px',
                                marginTop: '28px'
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
                                try { subs = JSON.parse(subs); } catch (e) { subs = []; }
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
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0', marginBottom: '28px' }}>
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
                                gap: '16px',
                                marginTop: '28px'
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
                                try { subs = JSON.parse(subs); } catch (e) { subs = []; }
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
                                  <th>Gmail ID</th>
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
                                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{f.email || '—'}</td>
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
                                  const presentEnrollments = new Set((liveLogs || []).filter(log => log.status === 'Success').map(log => log.enrollment_no));
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
              </div>
            )}
            {/* PANEL FOR ATTENDANCE LOGS DIRECTORY */}

            {activeTab === 'subjects' && (
              <div style={styles.tabContent}>
                <div className="glass-panel" style={{ ...styles.cardPadding, padding: isMobile ? '16px 12px' : '28px' }}>
                  {/* Header Row with Search on Left and Add Button on Right */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                  <div className="student-search-bar-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                    <div style={{ ...styles.searchContainer, flex: 1, margin: 0, minWidth: '200px' }}>
                      <Search size={18} style={styles.searchIcon} />
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Search subject by Name or Code..."
                        value={subjectSearchQuery}
                        onChange={(e) => setSubjectSearchQuery(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                      />
                    </div>
                    {selectedSubjectIds.length > 0 && (
                      <button
                        className="btn btn-danger mobile-only-delete-btn"
                        onClick={() => handleBulkDeleteSubjects(selectedSubjectIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          alignItems: 'center',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedSubjectIds.length})
                      </button>
                    )}
                  </div>

                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={subjectFileInputRef}
                    onChange={handleSubjectImportFile}
                    style={{ display: 'none' }}
                  />
                  <div className="admin-action-btn-group desktop-student-action-group">
                    <button
                      onClick={() => { setShowSubjectMobileActions(false); handleDownloadSubjectSampleTemplate(); }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '0.88rem',
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        background: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                      title="Download sample Excel file format for subject import"
                    >
                      <FileSpreadsheet size={16} color="#c084fc" />
                      <span>Sample Format</span>
                    </button>

                    <button
                      onClick={() => { setShowSubjectMobileActions(false); subjectFileInputRef.current && subjectFileInputRef.current.click(); }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Import subject records batch from CSV or Excel"
                    >
                      <Upload size={16} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Bulk Upload</span>
                    </button>

                    <button
                      onClick={() => { setShowSubjectMobileActions(false); handleExportSubjectsData(); }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Export subject records to Excel file"
                    >
                      <Download size={16} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Export</span>
                    </button>

                    <button
                      onClick={() => { setShowSubjectMobileActions(false); handleOpenAddSubjectModal(); }}
                      className="btn btn-primary"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.88rem', fontWeight: '700',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#ffffff',
                        boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={18} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Add Subject</span>
                    </button>
                    {selectedSubjectIds.length > 0 && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleBulkDeleteSubjects(selectedSubjectIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedSubjectIds.length})
                      </button>
                    )}
                  </div>
                  </div>

                  {/* Subject List / Table */}
                  {allFacultySubjects.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                      <GraduationCap size={52} color="var(--text-muted)" style={{ marginBottom: '14px', opacity: 0.4 }} />
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                        No subjects added yet
                      </h4>
                      <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 16px auto', color: 'var(--text-secondary)' }}>
                        You haven't added any teaching subjects yet. Click the "Add Subject" button above to add a subject.
                      </p>
                      <button
                        onClick={handleOpenAddSubjectModal}
                        className="btn btn-primary"
                        style={{ padding: '8px 18px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', border: 'none', gap: '6px', cursor: 'pointer' }}
                      >
                        <Plus size={16} color="#0f172a" /> Add Your First Subject
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const filteredSubjects = allFacultySubjects.filter(sub => {
                        if (!subjectSearchQuery || !subjectSearchQuery.trim()) return true;
                        const q = subjectSearchQuery.toLowerCase().trim();
                        const subName = String(sub.subjectName || sub.name || '').toLowerCase();
                        const shortCode = String(sub.shortName || sub.shortCode || sub.short || '').toLowerCase();
                        const subCode = String(sub.code || sub.subjectCode || '').toLowerCase();
                        const facultyName = String(sub.facultyName || '').toLowerCase();
                        return subName.includes(q) || shortCode.includes(q) || subCode.includes(q) || facultyName.includes(q);
                      });

                      return (
                        <div className="custom-table-container">
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th style={{ width: '40px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <input
                                    type="checkbox"
                                    checked={filteredSubjects.length > 0 && filteredSubjects.every(s => selectedSubjectIds.includes(s.subKey))}
                                    onChange={toggleSelectAllSubjects}
                                    title="Select / Unselect All"
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </th>
                                <th style={{ width: '50px', textAlign: 'center', whiteSpace: 'nowrap' }}>No</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Subject Name</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Short Name</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Subject Code</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Semester</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Faculty</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Type</th>
                                <th style={{ textAlign: 'center', width: '110px', whiteSpace: 'nowrap' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSubjects.map((sub, idx) => {
                                const isChecked = selectedSubjectIds.includes(sub.subKey);
                                const subName = sub.subjectName || sub.name || 'Subject';
                                const shortCode = sub.shortName || sub.shortCode || '-';
                                const subCode = sub.code || sub.subjectCode || '-';
                                const semNum = sub.semester ? String(sub.semester).replace(/\D/g, '') : '1';
                                const subType = sub.type || sub.subjectType || 'Theory';
                                const facultyName = sub.facultyName || 'Unknown';

                                return (
                                  <tr key={sub.subKey} style={{ background: isChecked ? 'rgba(147, 51, 234, 0.08)' : 'transparent' }}>
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleSelectSubject(sub.subKey)}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                      />
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                    <td style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                                      {subName}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <span style={{
                                        padding: '2px 10px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: '700',
                                        background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
                                        whiteSpace: 'nowrap', display: 'inline-block'
                                      }}>
                                        {shortCode}
                                      </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      {subCode && subCode !== '-' ? (
                                        <span style={{
                                          padding: '2px 10px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: '700',
                                          background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.25)',
                                          whiteSpace: 'nowrap', display: 'inline-block'
                                        }}>
                                          {subCode}
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                      )}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <span style={{
                                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700',
                                        background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)',
                                        whiteSpace: 'nowrap', display: 'inline-block'
                                      }}>
                                        Semester {semNum}
                                      </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {facultyName}
                                      </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <span style={{
                                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700',
                                        background: subType.includes('Both') || subType.includes('+') ? 'rgba(168, 85, 247, 0.15)' : subType === 'Practical' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                        color: subType.includes('Both') || subType.includes('+') ? '#c084fc' : subType === 'Practical' ? '#34d399' : '#60a5fa',
                                        border: `1px solid ${subType.includes('Both') || subType.includes('+') ? 'rgba(168, 85, 247, 0.3)' : subType === 'Practical' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                                        whiteSpace: 'nowrap', display: 'inline-block'
                                      }}>
                                        {subType}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <button
                                          className="btn btn-secondary"
                                          onClick={() => handleEditSubject(sub)}
                                          style={styles.actionBtn}
                                          title="Edit Subject Details"
                                        >
                                          <Edit size={14} />
                                        </button>

                                        <button
                                          className="btn btn-danger"
                                          onClick={() => handleDeleteSubject(sub)}
                                          style={styles.actionBtn}
                                          title="Delete Subject"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}

            {/* Add Subject Modal Popup Dialog (Clean White Light Theme) */}
            {showAddSubjectModal && (
              <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                width: '100vw', width: '100dvw',
                height: '100vh', height: '100dvh',
                background: 'transparent',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999999,
                padding: '16px',
                boxSizing: 'border-box'
              }}>
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '20px',
                  width: '100%',
                  maxWidth: '480px',
                  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2), 0 0 20px rgba(245, 158, 11, 0.15)',
                  overflow: 'hidden',
                  animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                  {/* Modal Header */}
                  <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#fafafa'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '38px', height: '38px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                      }}>
                        {subjectModalMode === 'edit' ? <Edit size={20} color="#ffffff" /> : <Plus size={20} color="#ffffff" />}
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0f172a' }}>
                        {subjectModalMode === 'edit' ? 'Edit Teaching Subject' : 'Add New Teaching Subject'}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddSubjectModal(false)}
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        color: '#64748b',
                        borderRadius: '50%',
                        width: '32px', height: '32px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body / Form */}
                  <form onSubmit={handleAddSubjectSubmit}>
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#ffffff', maxHeight: '70vh', overflowY: 'auto' }}>
                      {/* Subject Name Input */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Subject Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. C Language, Java Programming, DBMS..."
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          autoFocus
                          tabIndex={1}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Short Name of Subject */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Short Name of Subject
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. JAVA, C, DBMS"
                          value={newSubShort}
                          onChange={e => setNewSubShort(e.target.value)}
                          tabIndex={2}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Subject Code */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Subject Code
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. BCA-101, CS-202"
                          value={newSubCode}
                          onChange={e => setNewSubCode(e.target.value)}
                          tabIndex={3}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Semester Select (Searchable 1-8 Semesters) */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Semester *
                        </label>
                        <SearchableSemesterSelect
                          value={newSubSem}
                          onChange={(val) => setNewSubSem(val)}
                          placeholder="Select Semester (1-8)"
                          isDark={false}
                          tabIndex={4}
                        />
                      </div>

                      {/* Type Select */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Type *
                        </label>
                        <select
                          value={newSubType}
                          onChange={e => setNewSubType(e.target.value)}
                          tabIndex={5}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer',
                            boxSizing: 'border-box'
                          }}
                        >
                          <option value="Theory">Theory</option>
                          <option value="Practical">Practical</option>
                          <option value="Theory + Practical">Theory + Practical</option>
                        </select>
                      </div>

                      {/* Faculty Select */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                          Faculty *
                        </label>
                        <select
                          value={newSubFacultyId}
                          onChange={e => setNewSubFacultyId(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddSubjectSubmit(e);
                            }
                          }}
                          tabIndex={6}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer',
                            boxSizing: 'border-box'
                          }}
                        >
                          <option value="" disabled>Select Faculty</option>
                          {faculties.map(fac => (
                            <option key={fac.id} value={fac.id}>{fac.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div style={{
                      padding: '16px 24px',
                      background: '#f8fafc',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '12px'
                    }}>
                      <button
                        type="button"
                        onClick={() => setShowAddSubjectModal(false)}
                        tabIndex={7}
                        style={{
                          padding: '9px 20px',
                          borderRadius: '10px',
                          fontSize: '0.88rem',
                          fontWeight: '700',
                          background: '#e2e8f0',
                          color: '#334155',
                          border: '2px solid #cbd5e1',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #2563eb';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.35)';
                          e.currentTarget.style.background = '#dbeafe';
                          e.currentTarget.style.color = '#1d4ed8';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = '2px solid #cbd5e1';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.background = '#e2e8f0';
                          e.currentTarget.style.color = '#334155';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingSubjects}
                        tabIndex={8}
                        style={{
                          padding: '9px 24px',
                          borderRadius: '10px',
                          fontSize: '0.88rem',
                          fontWeight: '800',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#0f172a',
                          border: '2px solid #d97706',
                          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #0f172a';
                          e.currentTarget.style.boxShadow = '0 0 0 5px rgba(245, 158, 11, 0.6), 0 4px 14px rgba(245, 158, 11, 0.5)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = '2px solid #d97706';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(245, 158, 11, 0.4)';
                        }}
                      >
                        {savingSubjects ? (subjectModalMode === 'edit' ? 'Updating...' : 'Saving...') : (subjectModalMode === 'edit' ? 'Update Subject' : 'Save Subject')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}



            {activeTab === 'attendance_logs' && (
              <div style={styles.tabPanel}>
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
                                  ? `${selectedSessionFolder.title}`
                                  : `Sem ${selectedSemFolder} Attendance`
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          {selectedSemFolder === null ? (
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              📅 Date Archive
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                              <Calendar size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                              <label style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', margin: 0 }}>Select Date:</label>
                              <input
                                type="date"
                                value={folderSearchDate}
                                onChange={(e) => {
                                  setFolderSearchDate(e.target.value);
                                  setSelectedSessionFolder(null);
                                }}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '10px',
                                  border: '1.5px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#1e293b',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  outline: 'none',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                              />
                            </div>
                          )}

                          {selectedSemFolder === null ? (
                            <button
                              onClick={handleReloadDirectory}
                              disabled={directoryReloading}
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#1e293b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#0284c7';
                                e.currentTarget.style.color = '#0284c7';
                                e.currentTarget.style.background = '#f0f9ff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.color = '#1e293b';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                            >
                              <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} />
                              <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                            </button>
                          ) : selectedSessionFolder ? (
                            <button
                              onClick={async () => {
                                setDirectoryReloading(true);
                                try {
                                  await Promise.all([
                                    fetchLiveLogs(),
                                    fetchQrData(),
                                    fetchStats()
                                  ]);
                                } catch (err) {
                                  console.error('Error refreshing session logs:', err);
                                } finally {
                                  setDirectoryReloading(false);
                                }
                              }}
                              disabled={directoryReloading}
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#1e293b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#0284c7';
                                e.currentTarget.style.color = '#0284c7';
                                e.currentTarget.style.background = '#f0f9ff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.color = '#1e293b';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                              title="Reload session attendance data"
                            >
                              <RefreshCw size={14} className={directoryReloading ? 'spin-icon' : ''} />
                              <span>{directoryReloading ? 'Reloading...' : 'Reload'}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setFolderSearchDate(new Date().toISOString().split('T')[0]);
                                setSelectedSessionFolder(null);
                                handleReloadDirectory();
                              }}
                              disabled={directoryReloading}
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#1e293b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#0284c7';
                                e.currentTarget.style.color = '#0284c7';
                                e.currentTarget.style.background = '#f0f9ff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.color = '#1e293b';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                              title="Reset Date to Today"
                            >
                              <RotateCcw size={14} className={directoryReloading ? 'spin-icon' : ''} />
                              <span>{directoryReloading ? 'Resetting...' : 'Reset'}</span>
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
                                if (String(log.semester || '').replace(/\D/g, '') !== String(selectedSemFolder || '').replace(/\D/g, '')) return false;

                                if (folderDivFilter !== 'ALL' && !isDivMatch(log.division, folderDivFilter)) return false;
                                if (targetDate) {
                                  const d = normDate(log.date || log.created_at || getLocalDateStr(new Date()));
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
                                    created_at: log.date || log.created_at,
                                    logs: []
                                  });
                                }
                                sessionsMap.get(sessKey).logs.push(log);
                              });

                              // Include sessions from qrSessionHistory for this semester and date
                              (qrSessionHistory || []).forEach(qSess => {
                                const qSemNum = String(qSess.semester || '').replace(/\D/g, '');
                                const targetSemNum = String(selectedSemFolder || '').replace(/\D/g, '');
                                if (!qSemNum || qSemNum === targetSemNum) {
                                  if (folderDivFilter === 'ALL' || isDivMatch(qSess.division, folderDivFilter)) {
                                    const qDate = normDate(qSess.date || qSess.created_at);
                                    if (targetDate && (!qDate || qDate !== targetDate)) return;

                                    let sessKey = qSess.qr_session_id
                                      ? `qr_${qSess.qr_session_id}`
                                      : qSess.otp_id
                                        ? `otp_${qSess.otp_id}`
                                        : `sess_${qSess.id}`;

                                    if (!sessionsMap.has(sessKey)) {
                                      let sessType = qSess.qr_session_id ? 'Live QR Session' : 'OTP Session';
                                      let formattedTime = 'Session';
                                      if (qSess.created_at) {
                                        try {
                                          formattedTime = new Date(qSess.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        } catch (e) { }
                                      }
                                      sessionsMap.set(sessKey, {
                                        id: sessKey,
                                        qr_session_id: qSess.qr_session_id || null,
                                        otp_id: qSess.otp_id || null,
                                        type: sessType,
                                        faculty_name: qSess.faculty_name || 'Faculty',
                                        division: qSess.division || folderDivFilter,
                                        subject: qSess.subject || null,
                                        time: formattedTime,
                                        created_at: qSess.date || qSess.created_at,
                                        logs: logsForDate.filter(l =>
                                          (qSess.qr_session_id && String(l.qr_session_id) === String(qSess.qr_session_id)) ||
                                          (qSess.otp_id && String(l.otp_id) === String(qSess.otp_id))
                                        )
                                      });
                                    }
                                  }
                                }
                              });

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

                              if (folderDateLoading || directoryReloading) {
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
              </div>
            )}

            {/* PANEL 2: STUDENT CRUD MANAGEMENT */}
            {activeTab === 'students' && (
              <div style={{ ...styles.tabPanel, ...styles.studentCrudPanel }} className="glass-panel">
                <div style={styles.crudHeader}>
                  <div className="student-search-bar-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                    <div style={{ ...styles.searchContainer, flex: 1, margin: 0, minWidth: '200px' }}>
                      <Search size={18} style={styles.searchIcon} />
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Search by Name or Enrollment No..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                      />
                    </div>
                    {selectedStudentIds.length > 0 && (
                      <button
                        className="btn btn-danger mobile-only-delete-btn"
                        onClick={() => handleBulkDeleteStudents(selectedStudentIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          alignItems: 'center',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedStudentIds.length})
                      </button>
                    )}
                  </div>

                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    style={{ display: 'none' }}
                  />
                  <div className="admin-action-btn-group desktop-student-action-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                      <button
                        onClick={() => { setShowStudentMobileActions(false); handleDownloadStudentSampleTemplate(); }}
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          borderRadius: '8px',
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                          background: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        title="Download sample Excel file format for student import"
                      >
                        <FileSpreadsheet size={16} color="#c084fc" />
                        <span>Sample Format</span>
                      </button>

                      <button
                        onClick={() => { setShowStudentMobileActions(false); fileInputRef.current && fileInputRef.current.click(); }}
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
                          color: '#ffffff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Import student records batch from CSV/Excel"
                      >
                        <Upload size={16} color="#ffffff" />
                        <span style={{ color: '#ffffff' }}>Bulk Upload</span>
                      </button>

                      <button
                        onClick={() => { setShowStudentMobileActions(false); handleExportStudentsData(); }}
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#ffffff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Export all student records to Excel file"
                      >
                        <Download size={16} color="#ffffff" />
                        <span style={{ color: '#ffffff' }}>Export Data</span>
                      </button>

                      <button
                        onClick={() => { setShowStudentMobileActions(false); setPromoteStep(1); }}
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#ffffff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Promote all students to next semester (Sem 1..7 -> +1, Sem 8 -> Graduate & Remove)"
                      >
                        <TrendingUp size={16} color="#ffffff" />
                        <span style={{ color: '#ffffff' }}>Promote</span>
                      </button>

                      <button className="btn btn-primary full-width-mobile" onClick={() => { setShowStudentMobileActions(false); openAddModal(); }} style={{ color: '#ffffff' }}>
                        <Plus size={16} color="#ffffff" /> <span style={{ color: '#ffffff' }}>Add Student</span>
                      </button>
                    </div>
                    {selectedStudentIds.length > 0 && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleBulkDeleteStudents(selectedStudentIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          cursor: 'pointer',
                          alignSelf: 'flex-end'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedStudentIds.length})
                      </button>
                    )}
                  </div>
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
                                <th>Gmail ID</th>
                                <th>Name</th>
                                <th>Course</th>
                                <th>Semester</th>
                                <th>Division</th>
                                <th>Mobile</th>
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
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{student.email || '—'}</td>
                                    <td style={{ fontWeight: 600 }}>{student.name}</td>
                                    <td>{student.course}</td>
                                    <td>Sem {student.semester}</td>
                                    <td style={{ fontWeight: 600 }}>{student.division || '-'}</td>
                                    <td>{student.mobile}</td>
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
                  <div className="student-search-bar-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                    <div style={{ ...styles.searchContainer, flex: 1, margin: 0, minWidth: '200px' }}>
                      <Search size={18} style={styles.searchIcon} />
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Search faculty by Name or Email..."
                        value={facultySearchQuery}
                        onChange={(e) => setFacultySearchQuery(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                      />
                    </div>
                    {selectedFacultyIds.length > 0 && (
                      <button
                        className="btn btn-danger mobile-only-delete-btn"
                        onClick={() => handleBulkDeleteFaculty(selectedFacultyIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          alignItems: 'center',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedFacultyIds.length})
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={facultyFileInputRef}
                    onChange={handleFacultyImportFile}
                    style={{ display: 'none' }}
                  />
                  <div className="admin-action-btn-group desktop-student-action-group">
                    <button
                      onClick={() => { setShowFacultyMobileActions(false); handleDownloadFacultySampleTemplate(); }}
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        borderRadius: '8px',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        background: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                      title="Download sample Excel file format for faculty import"
                    >
                      <FileSpreadsheet size={16} color="#c084fc" />
                      <span>Sample Format</span>
                    </button>

                    <button
                      onClick={() => { setShowFacultyMobileActions(false); facultyFileInputRef.current && facultyFileInputRef.current.click(); }}
                      style={{
                        padding: '8px 16px',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Import faculty batch from CSV or Excel"
                    >
                      <Upload size={16} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Bulk Upload</span>
                    </button>

                    <button
                      onClick={() => { setShowFacultyMobileActions(false); handleExportFacultyData(); }}
                      style={{
                        padding: '8px 16px',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Export faculty records to Excel file"
                    >
                      <Download size={16} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Export</span>
                    </button>

                    <button className="btn btn-primary" onClick={() => { setShowFacultyMobileActions(false); openAddFacultyModal(); }} style={{ color: '#ffffff' }}>
                      <Plus size={16} color="#ffffff" /> <span style={{ color: '#ffffff' }}>Add Faculty</span>
                    </button>
                    {selectedFacultyIds.length > 0 && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleBulkDeleteFaculty(selectedFacultyIds)}
                        style={{
                          gap: '8px',
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} color="#ffffff" /> Delete Selected ({selectedFacultyIds.length})
                      </button>
                    )}
                  </div>
                </div>

                <div className="custom-table-container">
                  {facultyLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Loading faculty lists...</div>
                  ) : faculties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No faculty members found.</div>
                  ) : (
                    (() => {
                      const filteredFaculties = faculties.filter(f =>
                        (f.name && f.name.toLowerCase().includes(facultySearchQuery.toLowerCase())) ||
                        (f.email && f.email.toLowerCase().includes(facultySearchQuery.toLowerCase()))
                      );

                      return (
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={filteredFaculties.length > 0 && filteredFaculties.every(f => selectedFacultyIds.includes(f.id))}
                                  onChange={toggleSelectAllFaculty}
                                  title="Select / Unselect All"
                                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                />
                              </th>
                              <th>Name</th>
                              <th>Gmail ID</th>
                              <th>Department</th>
                              <th>Mobile</th>
                              <th>Password</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFaculties.map((fac) => {
                              const isChecked = selectedFacultyIds.includes(fac.id);
                              return (
                                <tr key={fac.id} style={{ background: isChecked ? 'rgba(147, 51, 234, 0.08)' : 'transparent' }}>
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSelectFaculty(fac.id)}
                                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                  </td>
                                  <td style={{ fontWeight: 600 }}>{fac.name}</td>
                                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{fac.email || '—'}</td>
                                  <td>{fac.department}</td>
                                  <td>{fac.mobile}</td>
                                  <td><code>{fac.plain_password}</code></td>
                                  <td>
                                    <div style={styles.actionButtonContainer}>
                                      <button className="btn btn-secondary" onClick={() => openEditFacultyModal(fac)} style={styles.actionBtn} title="Edit Details">
                                        <Edit size={14} />
                                      </button>
                                      <button className="btn btn-danger" onClick={() => handleDeleteFaculty(fac.id)} style={styles.actionBtn} title="Delete">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()
                  )}
                </div>
              </div>
            )}

            {/* PANEL 3: QR ATTENDANCE */}
            {activeTab === 'otp' && (
              <div style={{ ...styles.tabPanel, ...styles.otpDashboardRow }}>
                {/* Left Box: Faculty QR Permission Controls */}
                <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1.2, minWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px' }}>
                  <h3 style={{ ...styles.cardTitle, width: '100%', textAlign: 'center' }}>Faculty QR Settings</h3>

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
                </div>

                {/* Right Box: Today's QR Sessions History */}
                <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1.8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ ...styles.cardTitle, margin: 0 }}>Today's Session History</h3>
                      <button
                        onClick={handleClearQrSessions}
                        style={{
                          padding: '6px 14px', fontSize: '0.78rem', fontWeight: '700',
                          borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)',
                          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                        }}
                        title="Clear old history and restart session count from #1"
                      >
                        <Trash2 size={14} /> Clear History
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                      {(qrSessionHistory || []).length === 0 ? (
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
                            {qrSessionHistory.map((row, idx) => {
                              const startTimeStr = row.created_at && !isNaN(new Date(row.created_at).getTime())
                                ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : '-';
                              const expiryTimeStr = row.expires_at && !isNaN(new Date(row.expires_at).getTime())
                                ? new Date(row.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : '-';

                              return (
                                <tr key={row.id || idx}>
                                  <td><strong>Session #{idx + 1}</strong></td>
                                  <td style={{ fontWeight: '600', color: '#eab308' }}>{row.faculty_name || 'Admin'}</td>
                                  <td>{row.date || '-'}</td>
                                  <td>{startTimeStr}</td>
                                  <td>{expiryTimeStr}</td>
                                  <td style={{ fontWeight: 'bold', color: '#10b981' }}>{row.presentCount || 0} Present</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        padding: '12px 18px',
                        borderRadius: '10px',
                        border: '1.5px solid rgba(147, 51, 234, 0.4)',
                        backgroundColor: 'rgba(147, 51, 234, 0.06)',
                        color: '#9333ea',
                        fontWeight: '600',
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <MapPin size={18} color="#9333ea" />
                      <span>Use My Device Live Location</span>
                    </button>
                  </div>

                  {/* 3. Coordinate Display (Read-only for validation) & Save form */}
                  <form onSubmit={handleSaveLocation} style={styles.locationForm}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1.5px solid rgba(147, 51, 234, 0.3)',
                        backgroundColor: 'rgba(147, 51, 234, 0.04)'
                      }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>Latitude</span>
                        <strong style={{ fontSize: '0.95rem', fontWeight: '700' }}>{locationForm.latitude.toFixed(6)}</strong>
                      </div>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1.5px solid rgba(147, 51, 234, 0.3)',
                        backgroundColor: 'rgba(147, 51, 234, 0.04)'
                      }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>Longitude</span>
                        <strong style={{ fontSize: '0.95rem', fontWeight: '700' }}>{locationForm.longitude.toFixed(6)}</strong>
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

            {/* NEW PANEL: DEFAULTERS */}
            {activeTab === 'defaulters' && (
              <div className="admin-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* CARD 1: BLACKLIST RULES CARD */}
                <div className="glass-panel" style={{ padding: '28px 32px', borderRadius: '20px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '46px', height: '46px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(30, 27, 75, 0.35)'
                      }}>
                        <ShieldAlert size={24} color="#ffffff" />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                          Blacklist Rules
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '2px 0 0 0' }}>
                          Set automatic attendance thresholds and criteria for flagging defaulters.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowAddRuleModal(true)}
                      style={{
                        padding: '10px 18px',
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #e11d48, #be123c)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(225, 29, 72, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Plus size={18} color="#ffffff" />
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>Add Rules</span>
                    </button>
                  </div>

                  {/* Rules Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {blacklistRules.length === 0 ? (
                      <div style={{ padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.88rem' }}>
                        No blacklist rules configured yet. Click "Add Rules" above to create your first rule.
                      </div>
                    ) : (
                      blacklistRules.map(rule => (
                        <div key={rule.id} style={{
                          background: '#f8fafc',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '16px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '10px',
                              background: 'rgba(225, 29, 72, 0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              <FileText size={20} color="#e11d48" />
                            </div>
                            <div>
                              <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a' }}>
                                {rule.name}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '700', color: '#e11d48', background: 'rgba(225, 29, 72, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                                  &lt; {rule.minPercentage}% Defaulter
                                </span>
                                {rule.warningPercentage && (
                                  <span style={{ fontWeight: '700', color: '#d97706', background: 'rgba(217, 119, 6, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                                    &lt; {rule.warningPercentage}% Warning
                                  </span>
                                )}
                                {rule.program && rule.program !== 'All Programs' && <span style={{ background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{rule.program}</span>}
                                {rule.semester && rule.semester !== 'All Semesters' && <span style={{ background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{rule.semester}</span>}
                                {rule.subject && rule.subject !== 'All Subjects' && <span style={{ background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{rule.subject}</span>}
                                {rule.subjectType && rule.subjectType !== 'All Types' && <span style={{ background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{rule.subjectType}</span>}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '6px',
                              borderRadius: '8px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                            title="Delete Rule"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* CARD 2: ATTENDANCE DEFAULTERS CARD */}
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <AlertTriangle size={24} color="#e11d48" style={{ strokeWidth: 2.5 }} />
                    <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                      Attendance Defaulters
                    </h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                    {/* Total Students Sub-card */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                      <div style={{ background: 'linear-gradient(135deg, #09355c, #0f4c81)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(9, 53, 92, 0.3)', flexShrink: 0 }}>
                        <Users size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Students</span>
                        <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#09355c', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {stats.totalStudents || 0}
                        </div>
                      </div>
                    </div>

                    {/* Warnings Sub-card */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                      <div style={{ background: 'linear-gradient(135deg, #e69500, #f59e0b)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(230, 149, 0, 0.3)', flexShrink: 0 }}>
                        <AlertTriangle size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Warnings<br />Issued</span>
                        <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#d97706', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {warningsIssuedCount}
                        </div>
                      </div>
                    </div>

                    {/* Defaulters Sub-card */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                      <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(220, 38, 38, 0.3)', flexShrink: 0 }}>
                        <XCircle size={26} color="#ffffff" />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Defaulters</span>
                        <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#dc2626', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {totalDefaultersCount}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filter Bar Row below stat cards */}
                  <div style={{
                    marginTop: '24px',
                    padding: '20px 24px',
                    borderRadius: '16px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', flex: 1 }}>
                      {/* Filter 1: Semester Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px', flex: 1 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                          Filter by Semester
                        </label>
                        <select
                          value={defaulterSemFilter}
                          onChange={(e) => setDefaulterSemFilter(e.target.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer',
                            width: '100%'
                          }}
                        >
                          <option value="ALL">All Semesters</option>
                          <option value="1">Semester 1</option>
                          <option value="2">Semester 2</option>
                          <option value="3">Semester 3</option>
                          <option value="4">Semester 4</option>
                          <option value="5">Semester 5</option>
                          <option value="6">Semester 6</option>
                          <option value="7">Semester 7</option>
                          <option value="8">Semester 8</option>
                        </select>
                      </div>

                      {/* Filter 2: Division Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px', flex: 1 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                          Filter by Division
                        </label>
                        <select
                          value={defaulterDivFilter}
                          onChange={(e) => setDefaulterDivFilter(e.target.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer',
                            width: '100%'
                          }}
                        >
                          <option value="ALL">All Divisions</option>
                          {uniqueDivisionList.map((div, idx) => (
                            <option key={idx} value={div}>
                              Div {div}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter 2: Status Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px', flex: 1 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                          Filter by Status
                        </label>
                        <select
                          value={defaulterStatusFilter}
                          onChange={(e) => setDefaulterStatusFilter(e.target.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: '0.88rem',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer',
                            width: '100%'
                          }}
                        >
                          <option value="ALL">All Students</option>
                          <option value="WARNING">Warnings Only</option>
                          <option value="CRITICAL">Defaulters Only</option>
                        </select>
                      </div>
                    </div>

                    {/* Apply Filters Button */}
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        onClick={handleApplyDefaulterFilters}
                        style={{
                          padding: '11px 24px',
                          fontSize: '0.88rem',
                          fontWeight: '700',
                          borderRadius: '12px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #042e6f, #09355c)',
                          color: '#ffffff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(4, 46, 111, 0.35)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Search size={16} color="#ffffff" style={{ strokeWidth: 2.5 }} />
                        <span style={{ color: '#ffffff', fontWeight: '700', letterSpacing: '0.02em' }}>Apply Filters</span>
                      </button>
                    </div>
                  </div>

                  {/* Defaulters & Warning Students Table */}
                  <div style={{ marginTop: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginBottom: '14px' }}>
                      {filteredDefaulterList.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              Swal.fire({
                                title: 'Send Bulk SMS Notices?',
                                text: `Are you sure you want to send SMS attendance alert notices to all ${filteredDefaulterList.length} student(s) in this list?`,
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#e11d48',
                                cancelButtonColor: '#64748b',
                                confirmButtonText: `📱 Send SMS to All (${filteredDefaulterList.length})`
                              }).then((result) => {
                                if (result.isConfirmed) {
                                  try {
                                    const existing = JSON.parse(localStorage.getItem('attendance_system_notices') || '[]');
                                    const newNotices = filteredDefaulterList.map((s, idx) => {
                                      const pct = parseFloat(s.percentage) || 0;
                                      const ruleAction = pct < 60
                                        ? 'Critical Defaulter Status. Please contact your HOD / Class Coordinator immediately along with your parent/guardian.'
                                        : 'Attendance Warning Status. Please report to your Subject Faculty to make up for missed lectures.';
                                      const msg = `Dear ${s.name}, your attendance is currently ${s.percentage}%, which is below the mandatory 75% requirement. ${ruleAction}`;

                                      return {
                                        id: 'notice_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000),
                                        studentEnrollment: s.enrollment_no || s.email || s.id,
                                        studentName: s.name,
                                        title: s.statusKey === 'CRITICAL' ? '⚠️ Attendance Defaulter Critical Notice' : '⚠️ Low Attendance Warning Notice',
                                        category: s.statusKey === 'CRITICAL' ? 'DEFAULTER NOTICE' : 'ATTENDANCE WARNING',
                                        tagColor: s.statusKey === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                                        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                                        body: msg,
                                        timestamp: Date.now()
                                      };
                                    });

                                    localStorage.setItem('attendance_system_notices', JSON.stringify([...newNotices, ...existing]));
                                    window.dispatchEvent(new Event('notices_updated'));
                                  } catch (e) {
                                    console.error('Error saving notices:', e);
                                  }

                                  showToast(`📱 Bulk SMS notices sent to all ${filteredDefaulterList.length} students!`, 'success');
                                  Swal.fire('SMS Notices Dispatched!', `Attendance warning notices have been sent to all ${filteredDefaulterList.length} students and posted to their notice boards.`, 'success');
                                }
                              });
                            }}
                            style={{
                              padding: '8px 18px',
                              fontSize: '0.82rem',
                              fontWeight: '700',
                              borderRadius: '8px',
                              border: '1px solid rgba(225, 29, 72, 0.4)',
                              background: 'rgba(225, 29, 72, 0.1)',
                              color: '#e11d48',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 8px rgba(225, 29, 72, 0.15)',
                              transition: 'all 0.15s ease'
                            }}
                            title="Send SMS Notice to all listed students at once"
                          >
                            <Send size={15} />
                            <span>Send SMS to All ({filteredDefaulterList.length})</span>
                          </button>

                          <button
                            onClick={() => {
                              const exportRows = filteredDefaulterList.map((s, i) => ({
                                'Roll No': s.roll_no || s.rollNo || (i + 1),
                                'Student Name': s.name,
                                'Sem & Div': `Sem ${s.semester || '1'} ${s.division ? '(Div ' + s.division + ')' : ''}`,
                                'Subject': s.subjectName,
                                'Attended / Total': `${s.attendedLectures} / ${s.totalLectures}`,
                                'Attendance %': `${s.percentage}%`,
                                'Status': s.statusKey === 'CRITICAL' ? 'Defaulter' : 'Warning'
                              }));
                              const worksheet = XLSX.utils.json_to_sheet(exportRows);
                              const workbook = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(workbook, worksheet, 'Defaulters List');
                              XLSX.writeFile(workbook, `Defaulters_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
                              showToast(`Exported ${filteredDefaulterList.length} defaulters to Excel!`, 'success');
                            }}
                            style={{
                              padding: '8px 18px',
                              fontSize: '0.82rem',
                              fontWeight: '700',
                              borderRadius: '8px',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#059669',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Download size={15} />
                            <span>Export List</span>
                          </button>
                        </>
                      )}
                    </div>

                    {(() => {
                      const DEFAULTER_PAGE_SIZE = 25;
                      const totalDefaulterCount = filteredDefaulterList.length;
                      const totalDefaulterPages = Math.ceil(totalDefaulterCount / DEFAULTER_PAGE_SIZE) || 1;
                      const currentDefaulterPage = Math.min(defaulterPage, totalDefaulterPages);
                      const startDefIndex = (currentDefaulterPage - 1) * DEFAULTER_PAGE_SIZE;
                      const paginatedDefaulterList = filteredDefaulterList.slice(startDefIndex, startDefIndex + DEFAULTER_PAGE_SIZE);

                      return (
                        <div className="custom-table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                          {totalDefaulterCount === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                              <CheckCircle size={44} color="#10b981" style={{ marginBottom: '10px', opacity: 0.8 }} />
                              <h5 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>No Defaulters Found!</h5>
                              <p style={{ fontSize: '0.82rem', margin: 0 }}>No student records match the selected subject and status criteria.</p>
                            </div>
                          ) : (
                            <>
                              <table className="custom-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Roll No</th>
                                    <th>Student Name</th>
                                    <th>Sem & Div</th>
                                    <th style={{ textAlign: 'center' }}>Lectures Attended</th>
                                    <th style={{ textAlign: 'center' }}>Attendance %</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ textAlign: 'center' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedDefaulterList.map((s, i) => (
                                    <tr key={s.id || (startDefIndex + i)}>
                                      <td style={{ textAlign: 'center', fontWeight: '700', color: '#09355c' }}>
                                        {s.roll_no || s.rollNo || (startDefIndex + i + 1)}
                                      </td>
                                      <td style={{ fontWeight: '600', color: '#0f172a' }}>{s.name}</td>
                                      <td>Sem {s.semester || '1'} {s.division ? `(Div ${s.division})` : ''}</td>
                                      <td style={{ textAlign: 'center', fontWeight: '600' }}>{s.attendedLectures} / {s.totalLectures}</td>
                                      <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                          padding: '4px 10px',
                                          borderRadius: '12px',
                                          fontSize: '0.82rem',
                                          fontWeight: '800',
                                          background: s.percentage < 75 ? '#fef2f2' : '#fffbeb',
                                          color: s.percentage < 75 ? '#dc2626' : '#d97706',
                                          border: `1px solid ${s.percentage < 75 ? '#fca5a5' : '#fcd34d'}`
                                        }}>
                                          {s.percentage}%
                                        </span>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                          padding: '4px 14px',
                                          borderRadius: '20px',
                                          fontSize: '0.78rem',
                                          fontWeight: '700',
                                          background: s.statusKey === 'CRITICAL' ? '#dc2626' : '#f59e0b',
                                          color: '#ffffff',
                                          boxShadow: `0 2px 8px ${s.statusKey === 'CRITICAL' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                        }}>
                                          {s.statusKey === 'CRITICAL' ? 'Defaulter' : 'Warning'}
                                        </span>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <button
                                          onClick={() => {
                                            const matchedRule = blacklistRules.find(r => (parseFloat(s.percentage) || 0) < r.minPercentage);
                                            const ruleAction = matchedRule ? matchedRule.action : 'Dear Student, your attendance is below requirement. Please contact HOD immediately.';
                                            const smsMessage = `Dear ${s.name}, your attendance is currently ${s.percentage}%, which is below the mandatory 75% requirement. Action Required: ${ruleAction}`;

                                            try {
                                              const existing = JSON.parse(localStorage.getItem('attendance_system_notices') || '[]');
                                              const newNotice = {
                                                id: 'notice_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                                                studentEnrollment: s.enrollment_no || s.email || s.id,
                                                studentName: s.name,
                                                title: s.statusKey === 'CRITICAL' ? '⚠️ Attendance Defaulter Critical Notice' : '⚠️ Low Attendance Warning Notice',
                                                category: s.statusKey === 'CRITICAL' ? 'DEFAULTER NOTICE' : 'ATTENDANCE WARNING',
                                                tagColor: s.statusKey === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                                                date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                                                body: smsMessage,
                                                timestamp: Date.now()
                                              };

                                              localStorage.setItem('attendance_system_notices', JSON.stringify([newNotice, ...existing]));
                                              window.dispatchEvent(new Event('notices_updated'));
                                            } catch (e) {
                                              console.error('Error saving notice:', e);
                                            }

                                            showToast(`📱 SMS Notice sent to ${s.name}`, 'success');
                                            Swal.fire({
                                              title: 'Notice Dispatched!',
                                              text: `Attendance warning notice has been sent to ${s.name}. It is now live on their student notice board.`,
                                              icon: 'success',
                                              confirmButtonColor: '#d97706'
                                            });
                                          }}
                                          style={{
                                            padding: '5px 12px',
                                            fontSize: '0.78rem',
                                            fontWeight: '600',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: '#ffffff',
                                            color: '#334155',
                                            cursor: 'pointer'
                                          }}
                                          title="Send Custom SMS Notice to Student"
                                        >
                                          Send SMS Notice
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {totalDefaulterPages > 1 && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 16px',
                                  background: '#f8fafc',
                                  borderTop: '1px solid #e2e8f0',
                                  flexWrap: 'wrap',
                                  gap: '10px'
                                }}>
                                  <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>
                                    Showing {startDefIndex + 1}–{Math.min(startDefIndex + DEFAULTER_PAGE_SIZE, totalDefaulterCount)} of {totalDefaulterCount} defaulter(s)
                                  </span>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      disabled={currentDefaulterPage <= 1}
                                      onClick={() => setDefaulterPage(p => Math.max(1, p - 1))}
                                      style={{
                                        padding: '6px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700',
                                        border: '1px solid #cbd5e1', background: currentDefaulterPage <= 1 ? '#f1f5f9' : '#ffffff',
                                        color: currentDefaulterPage <= 1 ? '#94a3b8' : '#0f172a', cursor: currentDefaulterPage <= 1 ? 'default' : 'pointer'
                                      }}
                                    >
                                      Previous
                                    </button>

                                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', padding: '0 4px' }}>
                                      Page {currentDefaulterPage} of {totalDefaulterPages}
                                    </span>

                                    <button
                                      disabled={currentDefaulterPage >= totalDefaulterPages}
                                      onClick={() => setDefaulterPage(p => Math.min(totalDefaulterPages, p + 1))}
                                      style={{
                                        padding: '6px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700',
                                        border: '1px solid #cbd5e1', background: currentDefaulterPage >= totalDefaulterPages ? '#f1f5f9' : '#ffffff',
                                        color: currentDefaulterPage >= totalDefaulterPages ? '#94a3b8' : '#0f172a', cursor: currentDefaulterPage >= totalDefaulterPages ? 'default' : 'pointer'
                                      }}
                                    >
                                      Next
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* PANEL 5: LEAVE APPLICATIONS DIRECTORY */}
            {activeTab === 'leaves' && (
              <div style={styles.tabPanel}>
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
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
                            const matchedStu = students.find(s => String(s.id) === String(l.student_id) || s.enrollment_no === l.enrollment_no);
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

            {/* PANEL 5: REPORTS & PDF DOWNLOADS */}
            {activeTab === 'reports' && (
              <div style={{ ...styles.tabPanel, ...styles.reportsPanel }} className="glass-panel">

                {/* Filter Options & Download Buttons Header */}
                <div style={{ marginBottom: '24px' }}>
                  {/* Row 1 (Sabse Uper): Action Buttons on Right */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-success"
                        onClick={handleDownloadPDF}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600' }}
                      >
                        <Download size={16} /> PDF
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={handleExportExcel}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600' }}
                      >
                        <Download size={16} /> Excel
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={handleExportCSV}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600' }}
                      >
                        <Download size={16} /> CSV
                      </button>
                    </div>
                  </div>

                  {/* Row 2 (Uske Niche): All Report Filter Options */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={styles.filterGroup}>
                      <label style={styles.formLabel}>Report Type</label>
                      <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                        className="glass-input"
                        style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                      >
                        <option value="summary">Summary Report</option>
                        <option value="subject_wise">Subject Wise Report</option>
                        <option value="subject_date_wise">Subject Attendance with Dates</option>
                        <option value="semester_date_wise">Semester Attendance with Dates</option>
                        <option value="day_wise">Day-Wise Report</option>
                      </select>
                    </div>

                    {reportType === 'semester_date_wise' && (
                      <div style={styles.filterGroup}>
                        <label style={styles.formLabel}>Select Semester</label>
                        <select
                          value={reportSemFilter === 'ALL' ? '1' : reportSemFilter}
                          onChange={(e) => setReportSemFilter(e.target.value)}
                          className="glass-input"
                          style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', minWidth: '160px' }}
                        >
                          <option value="1">Semester 1</option>
                          <option value="2">Semester 2</option>
                          <option value="3">Semester 3</option>
                          <option value="4">Semester 4</option>
                          <option value="5">Semester 5</option>
                          <option value="6">Semester 6</option>
                          <option value="7">Semester 7</option>
                          <option value="8">Semester 8</option>
                        </select>
                      </div>
                    )}

                    {(reportType === 'subject_wise' || reportType === 'subject_date_wise' || reportType === 'day_wise') && (
                      <div style={styles.filterGroup}>
                        <label style={styles.formLabel}>Select Subject</label>
                        <select
                          value={reportSubjectFilter}
                          onChange={(e) => setReportSubjectFilter(e.target.value)}
                          className="glass-input"
                          style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', minWidth: '180px' }}
                        >
                          <option value="ALL">All Subjects</option>
                          {uniqueSubjectList.map(sub => (
                            <option key={sub.name} value={sub.name}>{sub.name} (Sem {sub.semester})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {reportType === 'day_wise' && (
                      <>
                        <div style={styles.filterGroup}>
                          <label style={styles.formLabel}>Select Date</label>
                          <input
                            type="date"
                            value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                            className="glass-input"
                            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px', minWidth: '150px' }}
                          />
                        </div>

                        <div style={styles.filterGroup}>
                          <label style={styles.formLabel}>Division (Optional)</label>
                          <select
                            value={reportDivFilter}
                            onChange={(e) => setReportDivFilter(e.target.value)}
                            className="glass-input"
                            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', minWidth: '140px' }}
                          >
                            <option value="ALL">All Divisions</option>
                            {uniqueDivisionList.map(divName => (
                              <option key={divName} value={divName}>Div {divName}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {(reportType === 'subject_date_wise' || reportType === 'semester_date_wise') && (
                      <>
                        <div style={styles.filterGroup}>
                          <label style={styles.formLabel}>Start Date</label>
                          <input
                            type="date"
                            value={reportStartDate}
                            onChange={(e) => setReportStartDate(e.target.value)}
                            className="glass-input"
                            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px', minWidth: '150px' }}
                          />
                        </div>

                        <div style={styles.filterGroup}>
                          <label style={styles.formLabel}>End Date</label>
                          <input
                            type="date"
                            value={reportEndDate}
                            onChange={(e) => setReportEndDate(e.target.value)}
                            className="glass-input"
                            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', height: '42px', minWidth: '150px' }}
                          />
                        </div>

                        <div style={styles.filterGroup}>
                          <label style={styles.formLabel}>Division (Optional)</label>
                          <select
                            value={reportDivFilter}
                            onChange={(e) => setReportDivFilter(e.target.value)}
                            className="glass-input"
                            style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px', minWidth: '140px' }}
                          >
                            <option value="ALL">All Divisions</option>
                            {uniqueDivisionList.map(divName => (
                              <option key={divName} value={divName}>Div {divName}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Summary Cards Grid at Bottom (2-by-2 per row on mobile) */}
                <div className="admin-reports-stat-grid">
                  {/* 1. Total Student */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #09355c, #0f4c81)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(9, 53, 92, 0.25)', flexShrink: 0 }}>
                        <Users size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Student</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {stats.totalStudents || students.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total Faculty */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #00a86b, #059669)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(0, 168, 107, 0.25)', flexShrink: 0 }}>
                        <GraduationCap size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Faculty</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#00a86b', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {stats.totalFaculty || faculties.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Total Subject */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(168, 85, 247, 0.25)', flexShrink: 0 }}>
                        <BookOpen size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Total<br />Subject</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#9333ea', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {(() => {
                            const uniqueSubjs = new Set();
                            (allFacultySubjects || []).forEach(s => {
                              if (s && (s.subjectName || s.name)) uniqueSubjs.add((s.subjectName || s.name).trim().toUpperCase());
                            });
                            return uniqueSubjs.size > 0 ? uniqueSubjs.size : (allFacultySubjects.length || 0);
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Division */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(37, 99, 235, 0.25)', flexShrink: 0 }}>
                        <LayoutGrid size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Division</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#2563eb', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {(() => {
                            const uniqueDivs = new Set();
                            (students || []).forEach(s => {
                              if (s && (s.division || s.div)) uniqueDivs.add(String(s.division || s.div).trim().toUpperCase());
                            });
                            (qrSessionHistory || []).forEach(s => {
                              if (s && s.division && String(s.division).toUpperCase() !== 'ALL') uniqueDivs.add(String(s.division).trim().toUpperCase());
                            });
                            return uniqueDivs.size > 0 ? uniqueDivs.size : 2;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. Lecture */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #e69500, #f59e0b)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(230, 149, 0, 0.25)', flexShrink: 0 }}>
                        <Clock size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Lecture</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#d97706', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {stats.qrSessionsGenerated || qrSessionHistory.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 6. Defaulters */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(220, 38, 38, 0.25)', flexShrink: 0 }}>
                        <AlertTriangle size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Defaulters</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#dc2626', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {stats.totalDefaulters || totalDefaultersCount || 0}
                        </div>
                      </div>
                    </div>
                  </div>
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

                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>Mobile Number</label>
                        <input
                          type="tel"
                          className="glass-input"
                          placeholder="Enter Admin Mobile Number"
                          value={profileForm.mobile}
                          onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })}
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

                  {/* CARD 3: MOBILE NAVIGATION SETTINGS */}
                  <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '18px', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
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
              </div>
            )}

          </main>

          {/* STUDENT CRUD modal */}
          {showStudentModal && (
            <div style={styles.modalOverlay}>
              <div className="glass-panel" style={styles.modalContent}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ ...styles.modalTitle, margin: 0 }}>
                    {modalMode === 'add' ? 'Add New Student' : 'Edit Student Details'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => { setShowStudentModal(false); setCreatedStudentCredentials(null); }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      padding: 0
                    }}
                    title="Close Form"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {createdStudentCredentials ? (
                  <div style={styles.credentialsSuccessCard}>
                    <CheckCircle size={32} color="#10b981" style={{ marginBottom: '10px' }} />
                    <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Student Added Successfully!</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      Please share these generated credentials with the student. They will not be shown again.
                    </p>
                    <div style={styles.credentialsFields}>
                      <div style={styles.credentialRow}>
                        <span>Login Email:</span>
                        <code>{createdStudentCredentials.email || createdStudentCredentials.username}</code>
                      </div>
                      <div style={styles.credentialRow}>
                        <span>Password (Mobile No):</span>
                        <code>{createdStudentCredentials.password}</code>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowStudentModal(false)} style={{ width: '100%', marginTop: '20px' }}>
                      Close and Continue
                    </button>
                  </div>
                ) : (
                    <form onSubmit={handleStudentSubmit} style={styles.modalForm}>
                    <div style={styles.modalFormBody}>
                      <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Enrollment Number *</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. 2100201190"
                        value={studentForm.enrollment_no}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/\D/.test(val)) {
                            showToast('Enrollment number should contain digits only', 'warning', 2000);
                          }
                          const cleanVal = val.replace(/\D/g, '').slice(0, 10);
                          setStudentForm({ ...studentForm, enrollment_no: cleanVal });
                        }}
                        onBlur={() => {
                          setEnrollmentTouched(true);
                          if (!/^\d{10}$/.test(studentForm.enrollment_no || '')) {
                            showToast('Please enter valid 10-digit enrollment number', 'warning', 3000);
                          }
                        }}
                        required
                        pattern="^\d{10}$"
                        title="Please enter valid enrollment number"
                        disabled={modalMode === 'edit'}
                        autoFocus
                        tabIndex={1}
                        style={enrollmentTouched && !/^\d{10}$/.test(studentForm.enrollment_no || '') ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                      />
                      {enrollmentTouched && !/^\d{10}$/.test(studentForm.enrollment_no || '') && (
                        <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                          ⚠️ Enrollment Number is required (Must be 10 digits)
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
                        tabIndex={2}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Student Full Name *</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. Amit Patel"
                        value={studentForm.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/\d/.test(val)) {
                            showToast('Student Name should contain letters only (No numbers allowed)', 'warning', 2500);
                          }
                          const cleanVal = val.replace(/\d/g, '');
                          setStudentForm({ ...studentForm, name: cleanVal });
                        }}
                        onBlur={() => {
                          setNameTouched(true);
                          if (!studentForm.name || !studentForm.name.trim()) {
                            showToast('Please enter Student Full Name', 'warning', 3000);
                          } else if (!/^[A-Za-z\s.'-]+$/.test(studentForm.name.trim())) {
                            showToast('Student Name should contain letters only', 'warning', 3000);
                          }
                        }}
                        required
                        tabIndex={3}
                        style={nameTouched && (!studentForm.name || !studentForm.name.trim() || !/^[A-Za-z\s.'-]+$/.test(studentForm.name.trim())) ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                      />
                      {nameTouched && (!studentForm.name || !studentForm.name.trim()) && (
                        <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                          ⚠️ Student Full Name is required
                        </div>
                      )}
                      {nameTouched && studentForm.name && !/^[A-Za-z\s.'-]+$/.test(studentForm.name.trim()) && (
                        <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                          ⚠️ Student Name should contain letters only (No numbers allowed)
                        </div>
                      )}
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Email ID (Gmail) *</label>
                      <input
                        type="email"
                        className="glass-input"
                        placeholder="e.g. student@college.com"
                        value={studentForm.email || ''}
                        onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                        required
                        tabIndex={4}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                            showToast('Please enter a valid email address (e.g. student@college.com)', 'warning', 3000);
                          }
                        }}
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
                        tabIndex={5}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Semester *</label>
                      <SearchableSemesterSelect
                        value={studentForm.semester}
                        onChange={(val) => setStudentForm({ ...studentForm, semester: val })}
                        placeholder="Select Semester (1-8)"
                        isDark={false}
                        tabIndex={6}
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
                        tabIndex={7}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Mobile Number *</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. 9876543210"
                        value={studentForm.mobile}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/\D/.test(val)) {
                            showToast('Mobile number should contain digits only', 'warning', 2000);
                          }
                          const cleanVal = val.replace(/\D/g, '').slice(0, 10);
                          setStudentForm({ ...studentForm, mobile: cleanVal });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleStudentSubmit(e);
                          }
                        }}
                        onBlur={() => {
                          setMobileTouched(true);
                          if (!/^\d{10}$/.test(studentForm.mobile || '')) {
                            showToast('Please enter valid 10-digit mobile number', 'warning', 3000);
                          }
                        }}
                        required
                        pattern="^\d{10}$"
                        title="Please enter valid 10-digit mobile number"
                        tabIndex={8}
                        style={mobileTouched && !/^\d{10}$/.test(studentForm.mobile || '') ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                      />
                      {mobileTouched && !/^\d{10}$/.test(studentForm.mobile || '') && (
                        <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                          ⚠️ Mobile number is required (Must be 10 digits)
                        </div>
                      )}
                    </div>

                    {modalMode === 'edit' && (
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>
                          Set New Custom Password (Optional)
                        </label>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Keep current or set new (e.g. Pass@123)"
                          value={studentForm.password || ''}
                          onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                          tabIndex={9}
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val && val.trim()) {
                              const check = validateStrongPassword(val);
                              if (!check.isValid) {
                                showToast(`⚠️ ${check.message}`, 'warning', 4000);
                              }
                            }
                          }}
                        />
                      </div>
                    )}

                    {modalMode === 'edit' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        <input
                          type="checkbox"
                          id="resetPass"
                          checked={studentForm.resetPassword || false}
                          onChange={(e) => setStudentForm({ ...studentForm, resetPassword: e.target.checked })}
                          tabIndex={10}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="resetPass" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          Regenerate password for this student
                        </label>
                      </div>
                    )}
                    </div>

                    <div style={styles.modalActions}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowStudentModal(false)}
                        tabIndex={11}
                        style={{ outline: 'none', transition: 'all 0.15s ease' }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #2563eb';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.35)';
                          e.currentTarget.style.background = '#dbeafe';
                          e.currentTarget.style.color = '#1d4ed8';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = '1px solid var(--border-light)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        tabIndex={12}
                        style={{ outline: 'none', transition: 'all 0.15s ease' }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #0f172a';
                          e.currentTarget.style.boxShadow = '0 0 0 5px rgba(245, 158, 11, 0.6), 0 4px 14px rgba(245, 158, 11, 0.5)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = 'none';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ ...styles.modalTitle, margin: 0 }}>
                    {facultyModalMode === 'add' ? 'Add New Faculty Member' : 'Edit Faculty Details'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => { setShowFacultyModal(false); setCreatedFacultyCredentials(null); }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      padding: 0
                    }}
                    title="Close Form"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <X size={18} />
                  </button>
                </div>

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
                    <div style={styles.modalFormBody}>
                      <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Faculty Full Name *</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. Dr. Sarah Connor"
                        value={facultyForm.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/\d/.test(val)) {
                            showToast('Faculty Name should contain letters only (No numbers allowed)', 'warning', 2500);
                          }
                          const cleanVal = val.replace(/\d/g, '');
                          setFacultyForm({ ...facultyForm, name: cleanVal });
                        }}
                        required
                        autoFocus
                        tabIndex={1}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Email ID</label>
                      <input
                        type="email"
                        className="glass-input"
                        placeholder="e.g. faculty@college.com"
                        value={facultyForm.email || ''}
                        onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value })}
                        tabIndex={2}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (!val) {
                            showToast('Email ID is required for faculty members', 'warning', 3000);
                          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                            showToast('Please enter a valid email address (e.g. faculty@college.com)', 'warning', 3000);
                          }
                        }}
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
                        tabIndex={3}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Mobile Number</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. 9876543210"
                        value={facultyForm.mobile}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/\D/.test(val)) {
                            showToast('Mobile number should contain digits only', 'warning', 2000);
                          }
                          const cleanVal = val.replace(/\D/g, '').slice(0, 10);
                          setFacultyForm({ ...facultyForm, mobile: cleanVal });
                        }}
                        tabIndex={4}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !/^\d{10}$/.test(val)) {
                            showToast('Please enter valid 10-digit mobile number', 'warning', 3000);
                          }
                        }}
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
                        placeholder={facultyModalMode === 'add' ? 'Set custom password (e.g. Pass@123)' : 'Keep current or set new (e.g. Pass@123)'}
                        value={facultyForm.password || ''}
                        onChange={(e) => setFacultyForm({ ...facultyForm, password: e.target.value })}
                        tabIndex={5}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveFaculty(e);
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val && val.trim()) {
                            const check = validateStrongPassword(val);
                            if (!check.isValid) {
                              showToast(`⚠️ ${check.message}`, 'warning', 4000);
                            }
                          }
                        }}
                      />
                    </div>

                    </div>

                    <div style={styles.modalActions}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowFacultyModal(false)}
                        tabIndex={6}
                        style={{ outline: 'none', transition: 'all 0.15s ease' }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #2563eb';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.35)';
                          e.currentTarget.style.background = '#dbeafe';
                          e.currentTarget.style.color = '#1d4ed8';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = '1px solid var(--border-light)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        tabIndex={7}
                        style={{ outline: 'none', transition: 'all 0.15s ease' }}
                        onFocus={e => {
                          e.currentTarget.style.border = '2px solid #0f172a';
                          e.currentTarget.style.boxShadow = '0 0 0 5px rgba(245, 158, 11, 0.6), 0 4px 14px rgba(245, 158, 11, 0.5)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = 'none';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {facultyModalMode === 'add' ? 'Generate Credentials & Save' : 'Update Faculty'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* CUSTOM REACT DELETE CONFIRMATION MODAL (0ms response, No Browser Thread Blocking) */}
          {/* CUSTOM REACT DELETE CONFIRMATION MODAL */}
          {deleteConfirmState.isOpen && (
            <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              width: '100vw', width: '100dvw',
              height: '100vh', height: '100dvh',
              zIndex: 999999,
              background: 'transparent',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box'
            }}>
              <div className="custom-confirm-modal" style={{
                width: '440px',
                maxWidth: '100%',
                padding: '28px',
                borderRadius: '20px',
                border: '1.5px solid #fca5a5',
                background: '#ffffff',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Trash2 size={26} color="#ef4444" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: '800' }}>
                      {deleteConfirmState.entityType === 'faculty' ? 'Confirm Faculty Deletion' : 'Confirm Student Deletion'}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: '700' }}>
                      ⚠️ Permanent System Action
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.94rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                  Are you sure you want to delete <strong style={{ color: '#0f172a', fontWeight: '800' }}>{deleteConfirmState.studentName}</strong>? {deleteConfirmState.entityType === 'faculty' ? 'This faculty account will be permanently deleted from the system.' : 'All associated attendance history will also be permanently deleted.'}
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn-cancel-modal"
                    onClick={() => setDeleteConfirmState({ isOpen: false, type: 'single', entityType: 'student', studentId: null, studentName: '', targetIds: [] })}
                    style={{
                      padding: '9px 20px',
                      fontSize: '0.88rem',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      background: '#f1f5f9',
                      color: '#334155',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
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
                      boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                      cursor: 'pointer'
                    }}
                  >
                    Yes, Delete Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2-Step SweetAlert Modal for Promoting Students */}
          {promoteStep > 0 && (() => {
            let sem8Count = 0;
            let oddSemCount = 0;
            let evenSemCount = 0;

            students.forEach(s => {
              const semNum = parseInt(String(s.semester || '').replace(/\D/g, ''), 10);
              if (!isNaN(semNum) && semNum > 0) {
                if (semNum === 8) sem8Count++;
                if (semNum % 2 !== 0) oddSemCount++;
                else evenSemCount++;
              }
            });

            const hasSem8Students = sem8Count > 0;
            const isEvenToOddTerm = hasSem8Students || (evenSemCount > oddSemCount);

            return (
              <div className="promote-modal-overlay" style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                width: '100vw', height: '100vh',
                width: '100dvw', height: '100dvh',
                zIndex: 999999,
                background: 'transparent',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                boxSizing: 'border-box'
              }}>
                <div className="custom-confirm-modal" style={{
                  width: '480px',
                  maxWidth: '100%',
                  padding: '28px',
                  borderRadius: '20px',
                  border: promoteStep === 1 ? '1.5px solid #fcd34d' : '1.5px solid #fca5a5',
                  background: '#ffffff',
                  boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}>
                  {promoteStep === 1 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '48px', height: '48px', borderRadius: '14px',
                          background: '#fef3c7',
                          border: '1px solid #fcd34d',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Download size={24} color="#d97706" />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '700' }}>
                            📁 Download Report First!
                          </h3>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#b45309',
                            fontWeight: '700',
                            background: '#fef3c7',
                            border: '1px solid #fcd34d',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                            marginTop: '4px'
                          }}>
                            {isEvenToOddTerm ? '⚠️ Year-End Graduation Backup Safeguard' : '⚠️ Academic Term Backup Safeguard'}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.92rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                        {isEvenToOddTerm ? (
                          <>Please download the complete student backup report before proceeding. All <strong style={{ color: '#dc2626' }}>Semester 8</strong> final-year students will be graduated & removed. If you have already exported the backup report, click <strong style={{ color: '#d97706' }}>"Yes"</strong> to continue.</>
                        ) : (
                          <>Please download the complete student backup report before proceeding. Active students will advance to Even Semesters (+1). If you have already exported the backup report, click <strong style={{ color: '#d97706' }}>"Yes"</strong> to continue.</>
                        )}
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
                        {/* Top Row: Green Download Report Button */}
                        <button
                          type="button"
                          onClick={handleExportStudentsData}
                          style={{
                            width: '100%',
                            padding: '10px 18px',
                            fontSize: '0.88rem',
                            fontWeight: '700',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Download size={16} /> Download Report
                        </button>

                        {/* Bottom Row: Translucent Cancel Button + Yellow Yes Button */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                          <button
                            type="button"
                            className="btn-cancel-modal"
                            onClick={() => setPromoteStep(0)}
                            style={{
                              flex: 1,
                              padding: '9px 18px',
                              fontSize: '0.88rem',
                              fontWeight: '600',
                              borderRadius: '10px',
                              border: '1.5px solid #cbd5e1',
                              background: '#f8fafc',
                              color: '#334155',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => setPromoteStep(2)}
                            style={{
                              flex: 1,
                              padding: '9px 18px',
                              fontSize: '0.88rem',
                              fontWeight: '700',
                              borderRadius: '10px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                              color: '#ffffff',
                              cursor: 'pointer',
                              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Yes
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '48px', height: '48px', borderRadius: '14px',
                          background: '#fef2f2',
                          border: '1px solid #fca5a5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <TrendingUp size={24} color="#ef4444" />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '700' }}>
                            {isEvenToOddTerm ? '🚀 Confirm Year-End Graduation & Promotion' : '🚀 Confirm Promotion to Even Semester'}
                          </h3>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#dc2626',
                            fontWeight: '700',
                            background: '#fef2f2',
                            border: '1px solid #fca5a5',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                            marginTop: '4px'
                          }}>
                            {isEvenToOddTerm ? '⚠️ Permanent System Action (Graduating Semester 8)' : '⚠️ Mid-Academic Term Advancement'}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.92rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                        {isEvenToOddTerm ? (
                          <>Are you sure you want to promote all students? Students in <strong style={{ color: '#0f172a' }}>Semesters 2, 4, and 6</strong> will advance to <strong style={{ color: '#0f172a' }}>Semesters 3, 5, and 7 (+1)</strong>, and all <strong style={{ color: '#dc2626' }}>Semester 8</strong> final-year students ({sem8Count > 0 ? `${sem8Count} student(s)` : 'Semester 8 students'}) will be automatically graduated and deleted.</>
                        ) : (
                          <>Are you sure you want to promote all students to Even Semester? Students in <strong style={{ color: '#0f172a' }}>Semesters 1, 3, 5, and 7</strong> will advance to <strong style={{ color: '#0f172a' }}>Semesters 2, 4, 6, and 8 (+1)</strong>. No student accounts will be deleted during this promotion.</>
                        )}
                      </p>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                          type="button"
                          className="btn-cancel-modal"
                          onClick={() => setPromoteStep(0)}
                          disabled={promoteLoading}
                          style={{
                            padding: '9px 20px', fontSize: '0.88rem', fontWeight: '600',
                            borderRadius: '10px', border: '1.5px solid #cbd5e1',
                            background: '#f8fafc', color: '#334155', cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={executePromoteStudents}
                          disabled={promoteLoading}
                          style={{
                            padding: '9px 22px', fontSize: '0.88rem', fontWeight: '700',
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#ffffff', border: 'none', borderRadius: '10px',
                            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)', cursor: 'pointer'
                          }}
                        >
                          {promoteLoading ? 'Promoting Students...' : 'Yes, Promote Now'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Add Blacklist Rule Modal Popup Dialog */}
          {showAddRuleModal && (
            <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              width: '100vw', width: '100dvw',
              height: '100vh', height: '100dvh',
              background: 'transparent',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
              padding: '16px',
              boxSizing: 'border-box'
            }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '460px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2), 0 0 20px rgba(225, 29, 72, 0.15)',
                overflow: 'hidden',
                animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                {/* Modal Header */}
                <div style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fafafa',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, #e11d48, #be123c)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)'
                    }}>
                      <ShieldAlert size={20} color="#ffffff" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Add Blacklist Rule</h3>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>Configure new attendance defaulter policy</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddRuleModal(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Form */}
                <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, maxHeight: '65vh' }}>

                    {/* Rule Name */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>
                        Rule Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Engineering Theory Cutoff"
                        value={newRuleName}
                        onChange={e => setNewRuleName(e.target.value)}
                        autoFocus
                        tabIndex={1}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none'
                        }}
                      />
                    </div>

                    {/* Attendance Cutoff Percentage */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>
                        Attendance Cutoff Percentage (Defaulter) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="100"
                        placeholder="75"
                        value={newRulePercentage}
                        onChange={e => setNewRulePercentage(e.target.value)}
                        tabIndex={2}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none'
                        }}
                      />
                    </div>

                    {/* Warning Cutoff Percentage */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>
                        Warning Cutoff Percentage <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="100"
                        placeholder="80"
                        value={newRuleWarningPercentage}
                        onChange={e => setNewRuleWarningPercentage(e.target.value)}
                        tabIndex={3}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none'
                        }}
                      />
                    </div>

                    {/* Rule Scope Header */}
                    <div style={{
                      marginTop: '4px', marginBottom: '2px',
                      fontSize: '0.82rem', color: '#64748b', fontWeight: '500',
                      borderTop: '1px solid #f1f5f9', paddingTop: '12px'
                    }}>
                      Rule Scope (Optional - leave blank for organization-wide)
                    </div>

                    {/* Program (Optional) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>Program (Optional)</label>
                      <select
                        value={newRuleProgram}
                        onChange={e => setNewRuleProgram(e.target.value)}
                        tabIndex={4}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="All Programs">All Programs</option>
                        <option value="B.Tech">B.Tech</option>
                        <option value="M.Tech">M.Tech</option>
                        <option value="BCA">BCA</option>
                        <option value="MCA">MCA</option>
                        <option value="Diploma">Diploma</option>
                      </select>
                    </div>

                    {/* Semester (Optional) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>Semester (Optional)</label>
                      <select
                        value={newRuleSemester}
                        onChange={e => setNewRuleSemester(e.target.value)}
                        tabIndex={5}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="All Semesters">All Semesters</option>
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                        <option value="Semester 3">Semester 3</option>
                        <option value="Semester 4">Semester 4</option>
                        <option value="Semester 5">Semester 5</option>
                        <option value="Semester 6">Semester 6</option>
                        <option value="Semester 7">Semester 7</option>
                        <option value="Semester 8">Semester 8</option>
                      </select>
                    </div>

                    {/* Subject (Optional) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>Subject (Optional)</label>
                      <select
                        value={newRuleSubject}
                        onChange={e => setNewRuleSubject(e.target.value)}
                        tabIndex={6}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="All Subjects">All Subjects</option>
                        {Array.from(new Set((allFacultySubjects || []).map(s => s.subjectName).filter(Boolean))).map((subName, idx) => (
                          <option key={idx} value={subName}>{subName}</option>
                        ))}
                      </select>
                    </div>

                    {/* Subject Type (Optional) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>Subject Type (Optional)</label>
                      <select
                        value={newRuleSubjectType}
                        onChange={e => setNewRuleSubjectType(e.target.value)}
                        tabIndex={7}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRule(e);
                          }
                        }}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                          background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="All Types">All Types</option>
                        <option value="Theory">Theory</option>
                        <option value="Practical">Practical</option>
                        <option value="Practical + Theory">Practical + Theory</option>
                      </select>
                    </div>

                  </div>

                  {/* Modal Footer */}
                  <div style={{
                    padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px',
                    flexShrink: 0
                  }}>
                    <button
                      type="button"
                      onClick={() => setShowAddRuleModal(false)}
                      tabIndex={8}
                      style={{
                        padding: '9px 18px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: '700',
                        background: '#e2e8f0', color: '#334155', border: '2px solid #cbd5e1', cursor: 'pointer',
                        transition: 'all 0.15s ease', outline: 'none'
                      }}
                      onFocus={e => {
                        e.currentTarget.style.border = '2px solid #2563eb';
                        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.35)';
                        e.currentTarget.style.background = '#dbeafe';
                        e.currentTarget.style.color = '#1d4ed8';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.border = '2px solid #cbd5e1';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.background = '#e2e8f0';
                        e.currentTarget.style.color = '#334155';
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      tabIndex={9}
                      style={{
                        padding: '9px 22px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: '800',
                        background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#ffffff',
                        border: '2px solid #be123c', boxShadow: '0 4px 14px rgba(225, 29, 72, 0.4)', cursor: 'pointer',
                        transition: 'all 0.15s ease', outline: 'none'
                      }}
                      onFocus={e => {
                        e.currentTarget.style.border = '2px solid #0f172a';
                        e.currentTarget.style.boxShadow = '0 0 0 5px rgba(225, 29, 72, 0.6), 0 4px 14px rgba(225, 29, 72, 0.5)';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.border = '2px solid #be123c';
                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(225, 29, 72, 0.4)';
                      }}
                    >
                      Apply Rule
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Floating Toastr Notification Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
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
    gap: '14px'
  },
  dashboardRow: {
    display: 'flex',
    gap: '14px',
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
    marginBottom: '24px',
    position: 'relative'
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
    fontSize: '0.88rem',
    color: 'var(--text-primary)',
    fontWeight: '600'
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
    width: '100vw',
    width: '100dvw',
    height: '100vh',
    height: '100dvh',
    background: 'transparent',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    padding: '16px',
    boxSizing: 'border-box'
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
    flex: 1,
    overflow: 'visible',
    minHeight: 0
  },
  modalFormBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    paddingRight: '6px',
    paddingBottom: '6px',
    paddingTop: '2px',
    flex: 1
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    paddingBottom: '6px',
    paddingRight: '6px',
    paddingLeft: '6px',
    borderTop: '1px solid var(--border-light)',
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
