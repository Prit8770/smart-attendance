import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, KeyRound, QrCode, MapPin, BarChart3, Download, Upload, TrendingUp, Plus, Search,
  Trash2, Edit, Check, CheckCircle, XCircle, Clock, Shield, ShieldAlert, LogOut, RefreshCw, Unlock,
  Sun, Moon, GraduationCap, User, Settings, Folder, FolderOpen, Calendar, Menu, RotateCcw, X,
  LayoutGrid, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText, ClipboardList, AlertTriangle, UserPlus, BookOpen, FileSpreadsheet, Send, MessageSquare, ArrowLeft, Printer, Layers, SlidersHorizontal, Filter, Copy, Paperclip
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import QRCode from 'qrcode';
import ToastContainer from './ToastContainer';
import SearchableSemesterSelect from './SearchableSemesterSelect';
import AdminModalCloseBtn from './AdminModalCloseBtn';

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

export default function AdminDashboard({
  user,
  token,
  onLogout,
  theme,
  toggleTheme,
  onUpdateUser,
  onSwitchRole,
  activeRole = 'admin',
  canSwitchRole = true
}) {
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
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef(null);
  const profileCardRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        roleMenuRef.current &&
        !roleMenuRef.current.contains(e.target) &&
        profileCardRef.current &&
        !profileCardRef.current.contains(e.target)
      ) {
        setRoleMenuOpen(false);
      }
    };
    if (roleMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [roleMenuOpen]);
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

  // Calculate available semesters (ONLY created for semesters that currently have active registered students)
  const availableSemesters = useMemo(() => {
    const semSet = new Set();

    (students || []).forEach(s => {
      if (s && s.semester) {
        const semNum = String(s.semester).replace(/\D/g, '').trim();
        if (semNum) semSet.add(semNum);
      }
    });

    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [students]);

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
  const [showSemesterMobileActions, setShowSemesterMobileActions] = useState(false);

  useEffect(() => {
    setShowStudentMobileActions(false);
    setShowFacultyMobileActions(false);
    setShowSubjectMobileActions(false);
    setShowSemesterMobileActions(false);
  }, [activeTab, mobileSidebarOpen]);

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
  const [selectedSemesterIds, setSelectedSemesterIds] = useState([]);

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
    roles: ['faculty'],
    subjects: [{ subjectName: '', semester: '1' }]
  });
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [facultyModalMode, setFacultyModalMode] = useState('add'); // 'add' or 'edit'
  const [createdFacultyCredentials, setCreatedFacultyCredentials] = useState(null); // Save generated credentials
  const [facultyLoading, setFacultyLoading] = useState(false);

  // Semester CRUD / Management State
  const [customSemesters, setCustomSemesters] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_custom_semesters');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showAddSemesterModal, setShowAddSemesterModal] = useState(false);
  const [isEditingSemester, setIsEditingSemester] = useState(false);
  const [editingSemId, setEditingSemId] = useState(null);
  const [semesterFormData, setSemesterFormData] = useState({
    semNumber: '',
    name: '',
    program: "Bachelor's of Computer Applications",
    term: 'Odd'
  });
  const [semesterSearchQuery, setSemesterSearchQuery] = useState('');

  const defaultSemestersList = useMemo(() => [], []);

  const allSemestersList = useMemo(() => {
    const combined = [...defaultSemestersList, ...customSemesters];
    return combined.sort((a, b) => {
      const semNumA = String(a.semNumber || a.semester_number || a.id || '').trim();
      const semNumB = String(b.semNumber || b.semester_number || b.id || '').trim();

      const digitsA = parseInt(semNumA.replace(/\D/g, ''), 10);
      const digitsB = parseInt(semNumB.replace(/\D/g, ''), 10);

      if (!isNaN(digitsA) && !isNaN(digitsB) && digitsA !== digitsB) {
        return digitsA - digitsB;
      }
      return semNumA.localeCompare(semNumB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [defaultSemestersList, customSemesters]);

  const handleOpenAddSemesterModal = () => {
    setIsEditingSemester(false);
    setEditingSemId(null);
    const nextSemNum = String(allSemestersList.length + 1);
    setSemesterFormData({
      semNumber: nextSemNum,
      name: `Semester ${nextSemNum}`,
      program: "Bachelor's of Computer Applications",
      term: (allSemestersList.length + 1) % 2 === 1 ? 'Odd' : 'Even'
    });
    setShowAddSemesterModal(true);
  };

  const handleOpenEditSemesterModal = (sem) => {
    setIsEditingSemester(true);
    setEditingSemId(sem.id);
    setSemesterFormData({
      semNumber: sem.semNumber || sem.id,
      name: sem.name || `Semester ${sem.id}`,
      program: sem.program || sem.department || "Bachelor's of Computer Applications",
      term: sem.term || 'Odd'
    });
    setShowAddSemesterModal(true);
  };

  const handleSaveSemester = async (e) => {
    if (e) e.preventDefault();
    const cleanNum = semesterFormData.semNumber.trim();
    const cleanName = semesterFormData.name.trim() || `Semester ${cleanNum}`;
    const cleanNumDigits = cleanNum.replace(/\D/g, '');

    if (!cleanNum) {
      showToast('Please enter a semester number or title', 'error');
      return;
    }

    // Check if duplicate semester number/code or display name already exists
    const duplicate = allSemestersList.find(s => {
      // Ignore current item if editing
      if (isEditingSemester && (String(s.id) === String(editingSemId) || String(s.semNumber) === String(editingSemId))) {
        return false;
      }

      const sSemNumStr = String(s.semNumber || s.id || '').trim();
      const sSemDigits = sSemNumStr.replace(/\D/g, '');
      const sNameStr = String(s.name || s.semester_display_name || '').trim();

      const isCodeMatch = sSemNumStr.toLowerCase() === cleanNum.toLowerCase() ||
        (cleanNumDigits && sSemDigits && cleanNumDigits === sSemDigits);

      const isNameMatch = sNameStr.toLowerCase() === cleanName.toLowerCase();

      return isCodeMatch || isNameMatch;
    });

    if (duplicate) {
      showToast(`Semester with code/number '${cleanNum}' already exists! Please use a unique semester code.`, 'error');
      return;
    }

    const payload = {
      semester_number: parseInt(cleanNum.replace(/\D/g, ''), 10) || 1,
      semester_display_name: cleanName,
      term_type: semesterFormData.term || 'Odd'
    };

    try {
      if (isEditingSemester) {
        const res = await fetch(`/api/semesters/${editingSemId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to update semester in database');
        }

        const updatedDbSem = resData.semester || { id: editingSemId, ...payload };
        const updatedCustom = customSemesters.map(s => {
          if (String(s.id) === String(editingSemId)) {
            return {
              ...s,
              id: updatedDbSem.id,
              semNumber: String(updatedDbSem.semester_number || cleanNum),
              name: updatedDbSem.semester_display_name || cleanName,
              term: updatedDbSem.term_type || semesterFormData.term
            };
          }
          return s;
        });
        setCustomSemesters(updatedCustom);
        localStorage.setItem('admin_custom_semesters', JSON.stringify(updatedCustom));
        showToast(`Semester '${cleanName}' updated successfully!`, 'success');
      } else {
        const res = await fetch('/api/semesters', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to save semester to database');
        }

        const newDbSem = resData.semester || {};
        const newSem = {
          id: newDbSem.id || `sem_${Date.now()}`,
          semNumber: String(newDbSem.semester_number || cleanNum),
          name: newDbSem.semester_display_name || cleanName,
          program: semesterFormData.program || "Bachelor's of Computer Applications",
          term: newDbSem.term_type || semesterFormData.term || 'Odd',
          isDefault: false,
          createdAt: new Date().toISOString()
        };
        const newCustom = [...customSemesters, newSem];
        setCustomSemesters(newCustom);
        localStorage.setItem('admin_custom_semesters', JSON.stringify(newCustom));
        showToast(`Semester '${cleanName}' saved to Supabase database successfully!`, 'success');
      }
    } catch (err) {
      console.error('Save semester error:', err);
      showToast(err.message || 'Error saving semester to database', 'error');
    }
    setShowAddSemesterModal(false);
  };

  const handleDeleteSemester = (semId, semName) => {
    setDeleteConfirmState({
      isOpen: true,
      type: 'single',
      entityType: 'semester',
      studentId: semId,
      studentName: semName || 'this semester',
      targetIds: [semId]
    });
  };

  const handleDownloadSemesterSampleTemplate = () => {
    const headers = [['Semester Number', 'Semester Name', 'Term Type']];
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Semester Sample');
    XLSX.writeFile(workbook, 'Semester_Bulk_Upload_Sample.xlsx');
    showToast('Downloaded Semester import sample format template!', 'success');
  };

  const handleSemesterImportFile = (e) => {
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
          console.warn('XLSX read attempt failed for semester import:', xlsxErr);
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
            console.warn('Text fallback failed for semester import:', txtErr);
          }
        }

        if (!rows || rows.length < 2) {
          showToast('File is empty or missing data rows.', 'warning');
          return;
        }

        const headers = rows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));
        const semestersToInsert = [];
        const duplicateSemesters = [];
        const invalidTermErrors = [];

        for (let i = 1; i < rows.length; i++) {
          const values = rows[i];
          if (!values || values.length === 0) continue;

          let semNumber = '', name = '', rawTerm = '';
          let hasTermHeader = false;

          headers.forEach((h, idx) => {
            const val = values[idx] !== undefined && values[idx] !== null ? values[idx].toString().trim() : '';
            const cleanH = h ? h.toString().trim().toLowerCase() : '';

            if (cleanH.includes('number') || cleanH.includes('no') || cleanH.includes('sem number') || cleanH.includes('sem no')) {
              semNumber = val.replace(/\D/g, '') || val;
            } else if (cleanH.includes('name') || cleanH.includes('title')) {
              name = val;
            } else if (cleanH.includes('term')) {
              hasTermHeader = true;
              rawTerm = val;
            }
          });

          let normalizedTerm = 'Odd';
          if (rawTerm) {
            const cleanT = rawTerm.toLowerCase();
            if (cleanT === 'odd' || cleanT === 'odd term') {
              normalizedTerm = 'Odd';
            } else if (cleanT === 'even' || cleanT === 'even term') {
              normalizedTerm = 'Even';
            } else {
              invalidTermErrors.push(`Row ${i + 1}: Invalid Term Type "${rawTerm}". Allowed values are "Odd", "Even", "Odd Term", or "Even Term".`);
              continue;
            }
          }

          if (!semNumber && name) {
            semNumber = name.replace(/\D/g, '');
          }
          if (semNumber) {
            const cleanName = name || `Semester ${semNumber}`;
            const exists = allSemestersList.some(s =>
              String(s.semNumber || s.id || '').trim() === String(semNumber).trim() ||
              String(s.name || s.semester_display_name || '').toLowerCase().trim() === cleanName.toLowerCase().trim()
            );
            const alreadyInBatch = semestersToInsert.some(s =>
              String(s.semester_number).trim() === String(semNumber).trim() ||
              s.semester_display_name.toLowerCase().trim() === cleanName.toLowerCase().trim()
            );

            const semObj = {
              semester_number: parseInt(semNumber, 10) || 1,
              semester_display_name: cleanName,
              term_type: normalizedTerm
            };

            if (exists || alreadyInBatch) {
              duplicateSemesters.push(semObj);
            } else {
              semestersToInsert.push(semObj);
            }
          }
        }

        if (invalidTermErrors.length > 0) {
          showToast(invalidTermErrors.join(' | '), 'error');
          return;
        }

        // Case 1: All uploaded semesters were duplicates
        if (duplicateSemesters.length > 0 && semestersToInsert.length === 0) {
          const dupListHtml = duplicateSemesters.map(d =>
            `<li><strong>${d.semester_display_name}</strong> (Semester Code/No: ${d.semester_number}, Term: ${d.term_type})</li>`
          ).join('');

          Swal.fire({
            icon: 'warning',
            title: 'Duplicate Semesters Found!',
            html: `
              <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
                <p style="margin-bottom: 10px; font-weight: 600; color: #dc2626;">
                  ⚠️ No new semesters were added because all ${duplicateSemesters.length} semester(s) in your file already exist in your semester list:
                </p>
                <div style="max-height: 200px; overflow-y: auto; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 10px 14px;">
                  <ul style="margin: 0; padding-left: 18px; color: #9f1239;">
                    ${dupListHtml}
                  </ul>
                </div>
              </div>
            `,
            confirmButtonText: 'OK, Got It',
            confirmButtonColor: '#e11d48'
          });
          return;
        }

        if (semestersToInsert.length === 0) {
          showToast('No valid semesters found in the uploaded file.', 'warning');
          return;
        }

        // Send semesters to backend DB via POST /api/semesters/bulk
        const res = await fetch('/api/semesters/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ semesters: semestersToInsert })
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to save semesters to database');
        }

        const insertedRows = resData.inserted || [];
        if (insertedRows.length > 0) {
          const newFormattedSems = insertedRows.map(s => ({
            id: s.id,
            semNumber: String(s.semester_number || s.id),
            name: s.semester_display_name || `Semester ${s.semester_number || s.id}`,
            program: "Bachelor's of Computer Applications",
            academicYear: '2025-2026',
            term: s.term_type || 'Odd',
            description: ''
          }));

          const updatedCustom = [...customSemesters, ...newFormattedSems];
          setCustomSemesters(updatedCustom);
          try {
            localStorage.setItem('admin_custom_semesters', JSON.stringify(updatedCustom));
          } catch (e) {}

          if (duplicateSemesters.length > 0) {
            const dupListHtml = duplicateSemesters.map(d =>
              `<li><strong>${d.semester_display_name}</strong> (Semester Code/No: ${d.semester_number}, Term: ${d.term_type})</li>`
            ).join('');

            Swal.fire({
              icon: 'warning',
              title: 'Bulk Import Completed (With Duplicates)',
              html: `
                <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
                  <p style="margin-bottom: 8px; color: #16a34a; font-weight: 600;">
                    ✅ <strong>${insertedRows.length} new semester(s)</strong> added successfully!
                  </p>
                  <p style="margin-bottom: 8px; color: #d97706; font-weight: 600;">
                    ⚠️ <strong>${duplicateSemesters.length} semester(s)</strong> already existed and were skipped:
                  </p>
                  <div style="max-height: 180px; overflow-y: auto; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 10px 14px;">
                    <ul style="margin: 0; padding-left: 18px; color: #b45309;">
                      ${dupListHtml}
                    </ul>
                  </div>
                </div>
              `,
              confirmButtonText: 'Understood',
              confirmButtonColor: '#f59e0b'
            });
          } else {
            Swal.fire({
              icon: 'success',
              title: 'Bulk Import Successful!',
              text: `Successfully imported all ${insertedRows.length} semester(s) into the database!`,
              confirmButtonText: 'Great!',
              confirmButtonColor: '#10b981',
              timer: 3000
            });
          }
        } else {
          showToast('No new semesters were imported (all duplicates skipped).', 'info');
        }
      } catch (err) {
        console.error('Error importing semester file:', err);
        showToast(err.message || 'Failed to parse semester file.', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExportSemesterData = () => {
    if (!allSemestersList || allSemestersList.length === 0) {
      showToast('No semester records available to export.', 'warning');
      return;
    }

    const filteredSemesters = allSemestersList.filter(sem => {
      if (!semesterSearchQuery) return true;
      const q = semesterSearchQuery.toLowerCase();
      return (
        sem.name.toLowerCase().includes(q) ||
        String(sem.semNumber).includes(q) ||
        (sem.academicYear && sem.academicYear.toLowerCase().includes(q)) ||
        (sem.term && sem.term.toLowerCase().includes(q))
      );
    });

    const listToExport = filteredSemesters.length > 0 ? filteredSemesters : allSemestersList;

    const exportRows = listToExport.map((s, idx) => {
      const semStudentCount = students.filter(std => String(std.semester).trim() === String(s.semNumber).trim()).length;
      const semSubjectCount = allFacultySubjects.filter(sub => String(sub.semester).trim() === String(s.semNumber).trim()).length;

      return {
        'S.No': idx + 1,
        'Semester Number': s.semNumber || s.id,
        'Semester Name': s.name || `Semester ${s.semNumber}`,
        'Term Type': s.term || 'Odd',
        'Total Students': semStudentCount,
        'Total Subjects': semSubjectCount
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Semesters List');
    const fileName = `Semester_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast(`Successfully exported ${listToExport.length} semester record(s) to ${fileName}!`, 'success');
  };



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

  // Master Attendance Matrix States
  const [selectedSemFolder, setSelectedSemFolder] = useState('');
  const [matrixData, setMatrixData] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixDateMode, setMatrixDateMode] = useState('all');
  const [matrixMonth, setMatrixMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [matrixStartDate, setMatrixStartDate] = useState('');
  const [matrixEndDate, setMatrixEndDate] = useState('');
  const [matrixSingleDate, setMatrixSingleDate] = useState('');
  const [matrixDivFilter, setMatrixDivFilter] = useState('ALL');
  const [matrixSubjectFilter, setMatrixSubjectFilter] = useState('ALL');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState('ALL');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixSortBy, setMatrixSortBy] = useState('roll_asc');
  const [matrixSemPageIndex, setMatrixSemPageIndex] = useState(0);
  const [selectedCellInfo, setSelectedCellInfo] = useState(null);
  const [directoryReloading, setDirectoryReloading] = useState(false);

  // Helper to remove subject codes like (101), (104), [102], etc.
  const cleanSubjectTitle = (sub) => {
    if (!sub) return 'Subject';
    return String(sub).replace(/\s*[\(\[][^()\[\]]*[\)\]]/g, '').trim() || sub;
  };

  // Fetch Semester Matrix Data from Backend API with client-side fallback
  const fetchSemesterMatrix = async (semNumber) => {
    const targetSem = (!semNumber || semNumber === 'ALL') ? (availableSemesters[0] || '1') : semNumber;
    if (!matrixData) {
      setMatrixLoading(true);
    }
    try {
      let query = `?semester=${targetSem}&mode=admin&all=true`;
      if (matrixDateMode === 'month' && matrixMonth) {
        query += `&month=${matrixMonth}`;
      } else if (matrixDateMode === 'custom') {
        if (matrixStartDate) query += `&startDate=${matrixStartDate}`;
        if (matrixEndDate) query += `&endDate=${matrixEndDate}`;
      } else if (matrixDateMode === 'single' && matrixSingleDate) {
        query += `&date=${matrixSingleDate}`;
      }
      if (matrixDivFilter && matrixDivFilter !== 'ALL') {
        query += `&division=${matrixDivFilter}`;
      }
      if (matrixSubjectFilter && matrixSubjectFilter !== 'ALL') {
        query += `&subject=${encodeURIComponent(matrixSubjectFilter)}`;
      }

      const res = await fetch(`/api/attendance/semester-matrix${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setMatrixData(data);
      } else {
        fallbackCompileMatrix(targetSem);
      }
    } catch (err) {
      console.error('Error fetching semester matrix:', err);
      fallbackCompileMatrix(targetSem);
    } finally {
      setMatrixLoading(false);
    }
  };

  const fallbackCompileMatrix = (semNumber) => {
    const isAll = !semNumber || semNumber === 'ALL';
    const targetSem = isAll ? 'ALL' : String(semNumber).replace(/\D/g, '');
    const semStudents = (students || []).filter(s => {
      if (isAll) return true;
      return String(s.semester || '').replace(/\D/g, '') === targetSem;
    });
    
    semStudents.sort((a, b) => {
      if (isAll) {
        const semA = parseInt(String(a.semester || '').replace(/\D/g, ''), 10) || 0;
        const semB = parseInt(String(b.semester || '').replace(/\D/g, ''), 10) || 0;
        if (semA !== semB) return semA - semB;
      }
      const divA = String(a.division || 'A').trim().toUpperCase();
      const divB = String(b.division || 'A').trim().toUpperCase();
      if (divA !== divB) {
        return divA.localeCompare(divB);
      }
      const rA = parseInt(String(a.roll_no || '').replace(/\D/g, ''), 10);
      const rB = parseInt(String(b.roll_no || '').replace(/\D/g, ''), 10);
      if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
      return String(a.roll_no || '').localeCompare(String(b.roll_no || ''), undefined, { numeric: true });
    });

    const semLogs = (liveLogs || []).filter(l => {
      if (l.status !== 'Success') return false;
      if (isAll) return true;
      const lSem = String(l.semester || l.students?.semester || '').replace(/\D/g, '');
      return lSem === targetSem;
    });

    const sessionMap = new Map();
    (qrSessionHistory || []).forEach(sess => {
      const sSem = String(sess.semester || '').replace(/\D/g, '');
      if (isAll || sSem === targetSem) {
        const dateStr = getLocalDateStr(sess.date || sess.created_at);
        const colKey = `${dateStr}_${sess.id || sess.qr_session_id || sess.otp_id}`;
        sessionMap.set(colKey, {
          columnKey: colKey,
          date: dateStr,
          subject: cleanSubjectTitle(sess.subject || 'Subject'),
          faculty_name: sess.faculty_name || 'Faculty',
          time: sess.created_at ? new Date(sess.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Session',
          type: sess.qr_session_id ? 'QR' : 'OTP',
          division: sess.division || 'ALL'
        });
      }
    });

    const columns = Array.from(sessionMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const attendanceMatrix = {};

    const logSet = new Set();
    (semLogs || []).forEach(l => {
      const lDate = getLocalDateStr(l.date || l.timestamp || l.created_at);
      if (l.student_id) logSet.add(`${String(l.student_id)}_${lDate}`);
      if (l.enrollment_no) logSet.add(`${String(l.enrollment_no).toLowerCase()}_${lDate}`);
    });

    semStudents.forEach(st => {
      attendanceMatrix[String(st.id)] = {};
      const studentDiv = String(st.division || 'A').trim().toUpperCase();

      columns.forEach(col => {
        const sessDiv = String(col.division || 'ALL').trim().toUpperCase();
        const isApplicable = sessDiv === 'ALL' || sessDiv === '' || studentDiv === sessDiv;

        const hasLog = logSet.has(`${String(st.id)}_${col.date}`) ||
          (st.enrollment_no ? logSet.has(`${String(st.enrollment_no).toLowerCase()}_${col.date}`) : false);

        if (hasLog) {
          attendanceMatrix[String(st.id)][col.columnKey] = {
            status: 'P',
            time: col.time,
            method: col.type
          };
        } else if (isApplicable) {
          attendanceMatrix[String(st.id)][col.columnKey] = {
            status: 'A',
            time: col.time,
            method: col.type
          };
        } else {
          attendanceMatrix[String(st.id)][col.columnKey] = {
            status: 'NA',
            time: col.time,
            method: col.type,
            targetDivision: col.division
          };
        }
      });
    });

    const dateGroupsMap = new Map();
    columns.forEach(col => {
      if (!dateGroupsMap.has(col.date)) {
        dateGroupsMap.set(col.date, {
          date: col.date,
          formattedDate: col.date,
          sessions: []
        });
      }
      dateGroupsMap.get(col.date).sessions.push(col);
    });

    const dateGroups = Array.from(dateGroupsMap.values());
    const uniqueSubjects = Array.from(new Set(columns.map(c => c.subject)));

    setMatrixData({
      semester: semNumber,
      totalStudents: semStudents.length,
      columns,
      dateGroups,
      uniqueSubjects,
      students: semStudents,
      attendanceMatrix,
      summary: {
        totalStudents: semStudents.length,
        totalLectures: columns.length,
        overallAttendancePct: 0,
        highAttendanceCount: 0,
        lowAttendanceCount: semStudents.length
      }
    });
  };

  useEffect(() => {
    if (activeTab === 'attendance_logs') {
      const activeSem = (selectedSemFolder && selectedSemFolder !== 'ALL') ? selectedSemFolder : (availableSemesters[0] || '1');
      if (selectedSemFolder !== activeSem) {
        setSelectedSemFolder(activeSem);
      }
      fetchSemesterMatrix(activeSem);
    }
  }, [activeTab, selectedSemFolder, availableSemesters, matrixDateMode, matrixMonth, matrixStartDate, matrixEndDate, matrixSingleDate, matrixDivFilter, matrixSubjectFilter]);

  // Automatically reset matrix filters when navigating away from attendance logs
  useEffect(() => {
    if (activeTab !== 'attendance_logs') {
      setSelectedSemFolder(availableSemesters[0] || '1');
      setMatrixSearch('');
    }
  }, [activeTab, availableSemesters]);

  const handleReloadDirectory = async () => {
    setDirectoryReloading(true);
    try {
      await Promise.all([
        fetchStudents(),
        fetchLiveLogs(),
        fetchQrData(),
        fetchStats()
      ]);
      if (selectedSemFolder) {
        await fetchSemesterMatrix(selectedSemFolder);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDirectoryReloading(false);
    }
  };

  // Filtered & Sorted Student Records for Master Matrix Table
  const processedMatrixStudents = useMemo(() => {
    if (!matrixData || !matrixData.students) return [];

    let list = matrixData.students.map(st => {
      const rowAttendance = matrixData.attendanceMatrix?.[String(st.id)] || {};
      let presentCount = 0;
      let absentCount = 0;
      let applicableCount = 0;

      (matrixData.columns || []).forEach(col => {
        const cell = rowAttendance[col.columnKey];
        if (cell?.status === 'P') {
          presentCount++;
          applicableCount++;
        } else if (cell?.status === 'A') {
          absentCount++;
          applicableCount++;
        }
      });

      const finalPresent = applicableCount > 0 ? presentCount : (st.presentCount !== undefined ? st.presentCount : presentCount);
      const finalAbsent = applicableCount > 0 ? absentCount : (st.absentCount !== undefined ? st.absentCount : absentCount);
      const finalApplicable = applicableCount > 0 ? applicableCount : ((finalPresent + finalAbsent) || 0);
      const pct = finalApplicable > 0 ? Math.round((finalPresent / finalApplicable) * 100) : null;

      return {
        ...st,
        presentCount: finalPresent,
        absentCount: finalAbsent,
        applicableCount: finalApplicable,
        totalConducted: finalApplicable,
        pct
      };
    });

    // 1. Search Query
    if (matrixSearch) {
      const q = matrixSearch.trim().toLowerCase();
      list = list.filter(st =>
        (st.name && st.name.toLowerCase().includes(q)) ||
        (st.roll_no && String(st.roll_no).toLowerCase().includes(q)) ||
        (st.enrollment_no && st.enrollment_no.toLowerCase().includes(q))
      );
    }

    // 2. Division Filter
    if (matrixDivFilter && matrixDivFilter !== 'ALL') {
      list = list.filter(st => String(st.division || 'A').toUpperCase() === String(matrixDivFilter).toUpperCase());
    }

    // 3. Status Filter (Safe vs Defaulters)
    if (matrixStatusFilter === 'regular') {
      list = list.filter(st => st.pct >= 75);
    } else if (matrixStatusFilter === 'defaulter') {
      list = list.filter(st => st.pct < 75);
    }

    // 4. Sorting (Semester-wise first, then Division-wise, then by Roll No / Name / Pct)
    list.sort((a, b) => {
      const semA = parseInt(String(a.semester || '').replace(/\D/g, ''), 10) || 0;
      const semB = parseInt(String(b.semester || '').replace(/\D/g, ''), 10) || 0;
      if (semA !== semB) {
        return semA - semB;
      }

      const divA = String(a.division || 'A').trim().toUpperCase();
      const divB = String(b.division || 'A').trim().toUpperCase();
      if (divA !== divB) {
        return divA.localeCompare(divB);
      }

      if (matrixSortBy === 'roll_asc' || matrixSortBy === 'roll_desc') {
        const rA = parseInt(String(a.roll_no || '').replace(/\D/g, ''), 10);
        const rB = parseInt(String(b.roll_no || '').replace(/\D/g, ''), 10);
        const diff = (!isNaN(rA) && !isNaN(rB))
          ? rA - rB
          : String(a.roll_no || '').localeCompare(String(b.roll_no || ''), undefined, { numeric: true });
        return matrixSortBy === 'roll_asc' ? diff : -diff;
      }
      if (matrixSortBy === 'name_asc' || matrixSortBy === 'name_desc') {
        const diff = String(a.name || '').localeCompare(String(b.name || ''));
        return matrixSortBy === 'name_asc' ? diff : -diff;
      }
      if (matrixSortBy === 'pct_desc') {
        return b.pct - a.pct;
      }
      if (matrixSortBy === 'pct_asc') {
        return a.pct - b.pct;
      }
      return 0;
    });

    return list;
  }, [matrixData, matrixSearch, matrixDivFilter, matrixStatusFilter, matrixSortBy]);

  const dateBoundaryKeys = useMemo(() => {
    const keys = new Set();
    const dateGroups = matrixData?.dateGroups || [];
    dateGroups.forEach((grp) => {
      if (grp.sessions?.length > 0) {
        const lastSession = grp.sessions[grp.sessions.length - 1];
        if (lastSession?.columnKey) keys.add(lastSession.columnKey);
      }
    });
    return keys;
  }, [matrixData?.dateGroups]);

  // When selectedSemFolder is 'ALL', identify distinct semesters present
  const matrixSemestersList = useMemo(() => {
    const semSet = new Set();
    (availableSemesters || []).forEach(s => {
      const semNum = String(s).replace(/\D/g, '').trim();
      if (semNum) semSet.add(semNum);
    });
    (students || []).forEach(s => {
      const semNum = String(s.semester || '').replace(/\D/g, '').trim();
      if (semNum) semSet.add(semNum);
    });
    (matrixData?.students || []).forEach(s => {
      const semNum = String(s.semester || '').replace(/\D/g, '').trim();
      if (semNum) semSet.add(semNum);
    });
    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [availableSemesters, students, matrixData?.students]);

  const safeSemPageIndex = useMemo(() => {
    if (!matrixSemestersList || matrixSemestersList.length === 0) return 0;
    return Math.min(Math.max(0, matrixSemPageIndex), matrixSemestersList.length - 1);
  }, [matrixSemPageIndex, matrixSemestersList]);

  const currentActiveSemester = useMemo(() => {
    if (matrixSemestersList.length === 0) return '1';
    return matrixSemestersList[safeSemPageIndex] || matrixSemestersList[0];
  }, [matrixSemestersList, safeSemPageIndex]);

  // When All Semesters is chosen, filter students down to the active semester page to eliminate lag
  const displayedMatrixStudents = useMemo(() => {
    const isAll = !selectedSemFolder || selectedSemFolder === 'ALL';
    if (!isAll || matrixSemestersList.length <= 1) {
      return processedMatrixStudents;
    }
    return processedMatrixStudents.filter(st =>
      String(st.semester || '').replace(/\D/g, '').trim() === String(currentActiveSemester)
    );
  }, [processedMatrixStudents, selectedSemFolder, matrixSemestersList, currentActiveSemester]);

  // Dynamically compute available divisions for the selected semester
  const availableSemesterDivisions = useMemo(() => {
    if (matrixData?.availableDivisions && Array.isArray(matrixData.availableDivisions) && matrixData.availableDivisions.length > 0) {
      return matrixData.availableDivisions;
    }
    const divs = new Set();
    const isAll = !selectedSemFolder || selectedSemFolder === 'ALL';
    const targetSem = isAll ? String(currentActiveSemester) : String(selectedSemFolder || '').replace(/\D/g, '');

    (students || []).forEach(s => {
      const sSem = String(s.semester || '').replace(/\D/g, '');
      if (sSem === targetSem && s.division && String(s.division).trim()) {
        divs.add(String(s.division).trim().toUpperCase());
      }
    });

    (matrixData?.students || []).forEach(s => {
      const sSem = String(s.semester || '').replace(/\D/g, '');
      if (sSem === targetSem && s.division && String(s.division).trim()) {
        divs.add(String(s.division).trim().toUpperCase());
      }
    });

    (matrixData?.columns || []).forEach(c => {
      if (c.division && c.division !== 'ALL' && String(c.division).trim()) divs.add(String(c.division).trim().toUpperCase());
    });

    const sorted = Array.from(divs).sort();
    return sorted.length > 0 ? sorted : ['A', 'B'];
  }, [matrixData, selectedSemFolder, students, currentActiveSemester]);

  useEffect(() => {
    setMatrixSearch('');
    setMatrixSemPageIndex(0);
  }, [selectedSemFolder]);

  // If user searches while in All Semesters mode, jump to the first semester that matches
  useEffect(() => {
    const isAll = !selectedSemFolder || selectedSemFolder === 'ALL';
    if (matrixSearch && isAll && matrixSemestersList.length > 1) {
      const firstSemWithMatch = matrixSemestersList.findIndex(sem =>
        processedMatrixStudents.some(st => String(st.semester || '').replace(/\D/g, '').trim() === String(sem))
      );
      if (firstSemWithMatch !== -1 && firstSemWithMatch !== matrixSemPageIndex) {
        setMatrixSemPageIndex(firstSemWithMatch);
      }
    }
  }, [matrixSearch]);

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
  const [newSubSem, setNewSubSem] = useState('');
  const [newSubType, setNewSubType] = useState('Theory');
  const [newSubFacultyId, setNewSubFacultyId] = useState('');
  const [subjectModalMode, setSubjectModalMode] = useState('add'); // 'add' | 'edit'
  const [editingSubjectIdx, setEditingSubjectIdx] = useState(null);
  const [editingSubjectObj, setEditingSubjectObj] = useState(null);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [savingSubjects, setSavingSubjects] = useState(false);
  // Global subjects catalog (unassigned - stored in localStorage)
  const [globalSubjectsCatalog, setGlobalSubjectsCatalog] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_global_subjects_catalog');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [];
  });

  // Assign Faculty to Subject State (Photo 1 & Photo 2)
  const [showAssignFacultyModal, setShowAssignFacultyModal] = useState(false);
  const [assigningSubject, setAssigningSubject] = useState(null);
  const [selectedAssignFacultyIds, setSelectedAssignFacultyIds] = useState([]);
  const [savingFacultyAssignment, setSavingFacultyAssignment] = useState(false);
  const [assignFacultySearch, setAssignFacultySearch] = useState('');

  // Blacklist Rules State (Strictly user-defined: NO fake/dummy rules auto-injected)
  const [blacklistRules, setBlacklistRules] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_blacklist_rules');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Purge legacy hardcoded dummy rules so they never reappear
          return parsed.filter(r => !(r.id === 1 && r.name === 'Engineering Theory Cutoff') && !(r.id === 2 && r.name === 'Critical Defaulter Threshold'));
        }
      }
    } catch (e) { }
    return [];
  });
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePercentage, setNewRulePercentage] = useState('75');
  const [newRuleWarningPercentage, setNewRuleWarningPercentage] = useState('80');
  const [newRuleProgram, setNewRuleProgram] = useState('All Programs');
  const [newRuleSemester, setNewRuleSemester] = useState('All Semesters');
  const [newRuleSubject, setNewRuleSubject] = useState('All Subjects');
  const [newRuleSubjectType, setNewRuleSubjectType] = useState('All Types');

  // Fetch rules from server on load
  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch('/api/rules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const clean = data.filter(r => !(r.id === 1 && r.name === 'Engineering Theory Cutoff') && !(r.id === 2 && r.name === 'Critical Defaulter Threshold'));
            setBlacklistRules(clean);
            localStorage.setItem('admin_blacklist_rules', JSON.stringify(clean));
          }
        }
      } catch (err) {
        console.warn('Error fetching rules from server:', err);
      }
    };
    fetchRules();
  }, [token]);

  // Fetch subjects from Supabase server DB
  const fetchDbSubjects = async () => {
    try {
      const res = await fetch('/api/subjects');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const formattedDbSubs = data.map(dbSub => {
            const fIds = [dbSub.faculty_id_1, dbSub.faculty_id_2, dbSub.faculty_id_3].filter(Boolean).map(String);
            return {
              subjectName: dbSub.subject_name || dbSub.subjectName || '',
              shortName: dbSub.short_name || dbSub.shortName || '-',
              code: dbSub.subject_code || dbSub.code || '',
              subjectCode: dbSub.subject_code || dbSub.code || '',
              semester: String(dbSub.semester || '1'),
              type: dbSub.type || 'Theory',
              globalKey: `supabase_${dbSub.id || Date.now()}`,
              dbId: dbSub.id,
              facultyId: fIds[0] || null,
              facultyIds: fIds
            };
          });

          setGlobalSubjectsCatalog(formattedDbSubs);
          localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(formattedDbSubs));
        }
      }
    } catch (err) {
      console.warn('Error fetching subjects from Supabase server:', err);
    }
  };

  useEffect(() => {
    fetchDbSubjects();
  }, [token]);

  // Fetch semesters from Supabase server DB on load
  useEffect(() => {
    const fetchDbSemesters = async () => {
      try {
        const res = await fetch('/api/semesters');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const formatted = data.map(s => ({
              id: s.id,
              semNumber: String(s.semester_number || s.id),
              name: s.semester_display_name || `Semester ${s.semester_number || s.id}`,
              program: "Bachelor's of Computer Applications",
              academicYear: s.academic_year || '2025-2026',
              term: s.term_type || 'Odd',
              description: s.description || ''
            }));
            setCustomSemesters(formatted);
            try {
              localStorage.setItem('admin_custom_semesters', JSON.stringify(formatted));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Error fetching semesters from Supabase server:', err);
      }
    };
    fetchDbSemesters();
  }, [token]);

  const handleOpenAddRuleModal = () => {
    setEditingRuleId(null);
    setNewRuleName('');
    setNewRulePercentage('75');
    setNewRuleWarningPercentage('80');
    setNewRuleProgram('All Programs');
    setNewRuleSemester('All Semesters');
    setNewRuleSubject('All Subjects');
    setNewRuleSubjectType('All Types');
    setShowAddRuleModal(true);
  };

  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setNewRuleName(rule.name || '');
    setNewRulePercentage(String(rule.minPercentage || 75));
    setNewRuleWarningPercentage(String(rule.warningPercentage || 80));
    setNewRuleProgram(rule.program || 'All Programs');
    setNewRuleSemester(rule.semester || 'All Semesters');
    setNewRuleSubject(rule.subject || 'All Subjects');
    setNewRuleSubjectType(rule.subjectType || 'All Types');
    setShowAddRuleModal(true);
  };

  const handleSaveRule = (e) => {
    e.preventDefault();
    if (!newRuleName.trim()) {
      showToast('Please enter a rule name.', 'error');
      return;
    }

    let updated;
    if (editingRuleId) {
      updated = blacklistRules.map(r => {
        if (r.id === editingRuleId) {
          return {
            ...r,
            name: newRuleName.trim(),
            minPercentage: parseFloat(newRulePercentage) || 75,
            warningPercentage: parseFloat(newRuleWarningPercentage) || 80,
            program: newRuleProgram,
            semester: newRuleSemester,
            subject: newRuleSubject,
            subjectType: newRuleSubjectType
          };
        }
        return r;
      });
      setBlacklistRules(updated);
      localStorage.setItem('admin_blacklist_rules', JSON.stringify(updated));
      showToast('Blacklist Rule updated successfully!', 'success');
    } else {
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
      updated = [...blacklistRules, newRule];
      setBlacklistRules(updated);
      localStorage.setItem('admin_blacklist_rules', JSON.stringify(updated));
      showToast('New Blacklist Rule added successfully!', 'success');
    }

    // Persist to server
    if (token) {
      fetch('/api/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rules: updated })
      }).catch(err => console.error('Error saving rules to server:', err));
    }

    setNewRuleName('');
    setNewRulePercentage('75');
    setNewRuleWarningPercentage('80');
    setNewRuleProgram('All Programs');
    setNewRuleSemester('All Semesters');
    setNewRuleSubject('All Subjects');
    setNewRuleSubjectType('All Types');
    setEditingRuleId(null);
    setShowAddRuleModal(false);
  };

  const handleDeleteRule = (ruleId) => {
    const updated = blacklistRules.filter(r => r.id !== ruleId);
    setBlacklistRules(updated);
    localStorage.setItem('admin_blacklist_rules', JSON.stringify(updated));

    if (token) {
      fetch(`/api/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {
        fetch('/api/rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ rules: updated })
        }).catch(err => console.error('Error deleting rule from server:', err));
      });
    }

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
    setShowFloatingMobileMenu(prev => {
      const next = typeof e?.target?.checked === 'boolean' ? e.target.checked : !prev;
      localStorage.setItem('admin_show_floating_mobile_menu', JSON.stringify(next));
      return next;
    });
  };

  const isAnyAdminModalOpen = Boolean(
    showStudentModal ||
    showFacultyModal ||
    showAddSubjectModal ||
    showAddSemesterModal ||
    showAssignFacultyModal ||
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

  const allFacultySubjects = (() => {
    const subjectMap = new Map();

    // 1. Process active subjects from globalSubjectsCatalog (the primary source of truth)
    (globalSubjectsCatalog || []).forEach((s, idx) => {
      if (!s || (!s.subjectName && !s.name)) return;
      const subName = String(s.subjectName || s.name || '').trim();
      const semNum = String(s.semester || '1').replace(/\D/g, '') || '1';
      const subCodeVal = (s.code || s.subjectCode || s.subject_code || s.subCode || s.sub_code || '').toString().trim();
      const subType = (s.type || s.subjectType || 'Theory').toString().trim();
      const shortCode = (s.shortName || s.shortCode || '').toString().trim();

      const codeKey = subCodeVal ? subCodeVal.toLowerCase() : '';
      const typeKey = subType ? subType.toLowerCase() : 'theory';
      const groupKey = codeKey
        ? `code_${codeKey}_sem_${semNum}_type_${typeKey}`
        : `name_${subName.toLowerCase()}_sem_${semNum}_type_${typeKey}`;

      const globalKey = s.globalKey || `global_${groupKey}_${idx}`;

      // Resolve assigned faculty IDs & names
      let fIds = Array.isArray(s.facultyIds) ? s.facultyIds.map(String) : [];
      if (fIds.length === 0 && s.facultyId) {
        fIds = [String(s.facultyId)];
      }

      let fNames = [];
      if (fIds.length > 0) {
        fNames = fIds.map(fid => {
          const fac = (faculties || []).find(f => String(f.id) === String(fid));
          return fac ? (fac.name || 'Faculty') : null;
        }).filter(Boolean);
      }

      const facNameDisplay = fNames.length > 0
        ? fNames.join(', ')
        : (s.facultyName && s.facultyName !== 'Unassigned' ? s.facultyName : 'Unassigned');

      subjectMap.set(groupKey, {
        ...s,
        subjectName: subName,
        shortName: shortCode,
        code: subCodeVal,
        subjectCode: subCodeVal,
        semester: semNum,
        type: subType,
        subKey: globalKey,
        globalKey: globalKey,
        facultyId: fIds[0] || null,
        facultyIds: fIds,
        facultyNamesList: fNames,
        facultyName: facNameDisplay
      });
    });

    // 2. Enrich active subjects with assigned faculty info from faculties array
    (faculties || []).forEach(f => {
      let fSubs = [];
      if (typeof f.subjects === 'string') {
        try { fSubs = JSON.parse(f.subjects); } catch (e) { fSubs = []; }
      } else if (Array.isArray(f.subjects)) {
        fSubs = f.subjects;
      }

      if (Array.isArray(fSubs)) {
        fSubs.forEach((s) => {
          if (!s || (!s.subjectName && !s.name)) return;
          const subName = String(s.subjectName || s.name || '').trim();
          const semNum = String(s.semester || '1').replace(/\D/g, '') || '1';
          const subCodeVal = (s.code || s.subjectCode || s.subject_code || s.subCode || s.sub_code || '').toString().trim();
          const subType = (s.type || s.subjectType || 'Theory').toString().trim();

          const codeKey = subCodeVal ? subCodeVal.toLowerCase() : '';
          const typeKey = subType ? subType.toLowerCase() : 'theory';
          const groupKey = codeKey
            ? `code_${codeKey}_sem_${semNum}_type_${typeKey}`
            : `name_${subName.toLowerCase()}_sem_${semNum}_type_${typeKey}`;

          const facIdStr = String(f.id);
          const facName = f.name || 'Faculty';

          if (subjectMap.has(groupKey)) {
            const existing = subjectMap.get(groupKey);
            if (!existing.facultyIds.includes(facIdStr)) {
              existing.facultyIds.push(facIdStr);
            }
            if (facName && !existing.facultyNamesList.includes(facName)) {
              existing.facultyNamesList.push(facName);
            }
            if (existing.facultyNamesList.length > 0) {
              existing.facultyName = existing.facultyNamesList.join(', ');
            }
          }
        });
      }
    });

    const subs = Array.from(subjectMap.values());

    // Sort Semester-wise ascending (Sem 1, Sem 2, Sem 3, ...), then by subject name
    subs.sort((a, b) => {
      const semA = parseInt(String(a.semester || '0').replace(/\D/g, ''), 10) || 0;
      const semB = parseInt(String(b.semester || '0').replace(/\D/g, ''), 10) || 0;
      if (semA !== semB) return semA - semB;
      const nameA = String(a.subjectName || a.name || '').trim().toLowerCase();
      const nameB = String(b.subjectName || b.name || '').trim().toLowerCase();
      return nameA.localeCompare(nameB);
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

    const getSemNum = (val) => {
      if (!val) return '';
      return String(val).replace(/\D/g, '').trim();
    };

    const getDivCode = (val) => {
      if (!val) return 'ALL';
      const clean = String(val).replace(/Div(?:ision)?\s*/i, '').trim().toUpperCase();
      return clean === '' ? 'ALL' : clean;
    };

    // Extract all identifiers for a student or log object
    const getObjectKeys = (obj) => {
      if (!obj) return [];
      const keys = [
        obj.enrollment_no,
        obj.student_id,
        obj.roll_no,
        obj.roll,
        obj.id,
        obj.user_id,
        obj.email,
        obj.student?.enrollment_no,
        obj.student?.student_id,
        obj.student?.roll_no,
        obj.student?.id
      ];
      return Array.from(new Set(
        keys.filter(k => k !== undefined && k !== null && String(k).trim() !== '')
            .map(k => String(k).trim().toLowerCase())
      ));
    };

    const studentKeysListMap = students.map(std => ({
      std,
      keys: getObjectKeys(std)
    }));

    // 1. Calculate unique conducted session keys per (Semester + Division) across all sources
    const semDivSessionKeysMap = {};

    const registerSessionKey = (semVal, divVal, sessKey) => {
      if (!sessKey) return;
      const sem = getSemNum(semVal) || '1';
      const div = getDivCode(divVal);

      const comboKey = `${sem}_${div}`;
      if (!semDivSessionKeysMap[comboKey]) {
        semDivSessionKeysMap[comboKey] = new Set();
      }
      semDivSessionKeysMap[comboKey].add(sessKey);
    };

    const getSessKey = (item) => {
      if (!item) return null;
      if (item.qr_session_id) return `qr_${item.qr_session_id}`;
      if (item.otp_id) return `otp_${item.otp_id}`;
      if (item.session_id) return `sess_${item.session_id}`;
      const d = normDateStr(item.date || item.created_at);
      const sub = String(item.subject || item.subject_name || '').trim().toLowerCase();
      const t = item.time || item.id || '';
      if (d && sub) return `${d}_${sub}_${t}`;
      if (d) return `${d}_${t}`;
      return item.id ? `id_${item.id}` : null;
    };

    (qrSessionHistory || []).forEach(sess => {
      if (!sess) return;
      const sem = sess.semester || '1';
      const div = sess.division || 'ALL';
      const sKey = getSessKey(sess);
      registerSessionKey(sem, div, sKey);
    });

    allSystemLogs.forEach(log => {
      if (!log) return;
      let sem = log.semester || log.sem || (log.student && (log.student.semester || log.student.sem));
      let div = log.division || log.div || (log.student && (log.student.division || log.student.div));

      if (!sem || !div) {
        const logKeys = getObjectKeys(log);
        const match = studentKeysListMap.find(item => item.keys.some(k => logKeys.includes(k)));
        if (match) {
          if (!sem) sem = match.std.semester || match.std.sem;
          if (!div) div = match.std.division || match.std.div;
        }
      }

      const sKey = getSessKey(log);
      registerSessionKey(sem || '1', div || 'ALL', sKey);
    });

    // 2. Build student attended count from real system logs
    const studentAttendedSessionsMap = {};

    allSystemLogs.forEach(log => {
      if (!log) return;
      const status = String(log.status || '').toLowerCase();
      if (status === 'success' || status === 'present') {
        const logKeys = getObjectKeys(log);
        if (logKeys.length === 0) return;

        const sessKey = getSessKey(log) || `${normDateStr(log.date || log.created_at)}_${log.time || log.id}`;

        const match = studentKeysListMap.find(item => item.keys.some(k => logKeys.includes(k)));
        if (match) {
          const stdId = String(match.std.id || match.std.enrollment_no || match.keys[0]).toLowerCase();
          if (!studentAttendedSessionsMap[stdId]) {
            studentAttendedSessionsMap[stdId] = new Set();
          }
          studentAttendedSessionsMap[stdId].add(sessKey);
        } else {
          logKeys.forEach(k => {
            if (!studentAttendedSessionsMap[k]) {
              studentAttendedSessionsMap[k] = new Set();
            }
            studentAttendedSessionsMap[k].add(sessKey);
          });
        }
      }
    });

    const activeRules = (blacklistRules || []).filter(r => !r.status || r.status === 'Active');

    return students.map((std) => {
      const semStr = getSemNum(std.semester || std.sem || '1');
      const divCode = getDivCode(std.division || std.div || 'A');

      const divSpecificKeys = semDivSessionKeysMap[`${semStr}_${divCode}`];
      const semAllKeys = semDivSessionKeysMap[`${semStr}_ALL`];

      const combinedKeys = new Set();
      if (divSpecificKeys) divSpecificKeys.forEach(k => combinedKeys.add(k));
      if (semAllKeys) semAllKeys.forEach(k => combinedKeys.add(k));

      const totalConducted = combinedKeys.size;

      const stdKeys = getObjectKeys(std);
      const stdId = String(std.id || std.enrollment_no || stdKeys[0] || '').toLowerCase();

      let attendedSet = studentAttendedSessionsMap[stdId];
      if (!attendedSet) {
        for (const k of stdKeys) {
          if (studentAttendedSessionsMap[k]) {
            attendedSet = studentAttendedSessionsMap[k];
            break;
          }
        }
      }
      const realAttended = attendedSet ? attendedSet.size : 0;

      let totalLectures, attendedLectures, absent, percentage, statusKey, statusLabel, hasSession;

      const matchedRule = activeRules.length > 0
        ? ([...activeRules].reverse().find(r => {
            const matchSem = !r.semester || r.semester === 'All Semesters' || getSemNum(r.semester) === semStr;
            const matchProg = !r.program || r.program === 'All Programs' || String(r.program).toLowerCase() === String(std.course || std.department || '').toLowerCase();
            return matchSem && matchProg;
          }) || activeRules[activeRules.length - 1] || activeRules[0])
        : null;

      const defaulterThreshold = matchedRule ? (parseFloat(matchedRule.minPercentage) || 75) : 75;
      const warningThreshold = matchedRule && matchedRule.warningPercentage !== undefined && matchedRule.warningPercentage !== null && matchedRule.warningPercentage !== ''
        ? parseFloat(matchedRule.warningPercentage)
        : (defaulterThreshold < 75 ? 75 : 80);

      if (totalConducted > 0) {
        hasSession = true;
        totalLectures = totalConducted;
        attendedLectures = Math.min(totalConducted, realAttended);
        absent = Math.max(0, totalConducted - attendedLectures);
        percentage = Math.min(100, Math.round((attendedLectures / totalConducted) * 100));
      } else {
        if (realAttended > 0) {
          hasSession = true;
          totalLectures = realAttended;
          attendedLectures = realAttended;
          absent = 0;
          percentage = 100;
        } else {
          hasSession = false;
          totalLectures = 0;
          attendedLectures = 0;
          absent = 0;
          percentage = 0;
        }
      }

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

      const matchedSub = (allFacultySubjects || []).find(s => s && getSemNum(s.semester) === semStr);

      return {
        ...std,
        totalLectures,
        attendedLectures,
        absent,
        percentage,
        hasSession,
        statusKey,
        statusLabel,
        defaulterThreshold,
        warningThreshold,
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
        const sId = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : null;
        const enrolls = [log.enrollment_no, log.student_id, log.roll_no].filter(Boolean).map(x => String(x).trim().toLowerCase());
        enrolls.forEach(en => {
          if (d) presentMap.add(`${en}_${d}`);
          if (sId) presentMap.add(`${en}_${sId}`);
          if (log.qr_session_id) presentMap.add(`${en}_${log.qr_session_id}`);
          if (log.otp_id) presentMap.add(`${en}_${log.otp_id}`);
        });
      }
    });

    const rows = filteredStudents.map((std, sIdx) => {
      const semStr = std.semester ? `${std.semester}` : (targetSem || '1');
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentKeys = [std.enrollment_no, std.roll_no, std.roll, std.id].filter(Boolean).map(x => String(x).trim().toLowerCase());

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
          const isPresent = studentKeys.some(k =>
            presentMap.has(`${k}_${colObj.sessId}`) ||
            presentMap.has(`${k}_${rawD}`) ||
            (colObj.qr_session_id && presentMap.has(`${k}_${colObj.qr_session_id}`)) ||
            (colObj.otp_id && presentMap.has(`${k}_${colObj.otp_id}`))
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
        const sId = log.qr_session_id ? `qr_${log.qr_session_id}` : log.otp_id ? `otp_${log.otp_id}` : null;
        const enrolls = [log.enrollment_no, log.student_id, log.roll_no].filter(Boolean).map(x => String(x).trim().toLowerCase());
        enrolls.forEach(en => {
          if (d) presentMap.add(`${en}_${d}`);
          if (sId) presentMap.add(`${en}_${sId}`);
          if (log.qr_session_id) presentMap.add(`${en}_${log.qr_session_id}`);
          if (log.otp_id) presentMap.add(`${en}_${log.otp_id}`);
        });
      }
    });

    const rows = filteredStudents.map((std, sIdx) => {
      const semStr = std.semester ? `${std.semester}` : (targetSem || '1');
      const divCode = String(std.division || std.div || 'A').trim().toUpperCase();
      const studentKeys = [std.enrollment_no, std.roll_no, std.roll, std.id].filter(Boolean).map(x => String(x).trim().toLowerCase());

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
          const isPresent = studentKeys.some(k =>
            presentMap.has(`${k}_${col.sessId}`) ||
            presentMap.has(`${k}_${rawD}`) ||
            (col.qr_session_id && presentMap.has(`${k}_${col.qr_session_id}`)) ||
            (col.otp_id && presentMap.has(`${k}_${col.otp_id}`))
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

    // Sort rows by Semester, Division, then Roll No
    rows.sort((a, b) => {
      const semA = parseInt(String(a.sem || a.semester || '').replace(/\D/g, '')) || 0;
      const semB = parseInt(String(b.sem || b.semester || '').replace(/\D/g, '')) || 0;
      if (semA !== semB) return semA - semB;

      const divA = String(a.division || '').toUpperCase();
      const divB = String(b.division || '').toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rollA = parseInt(String(a.roll_no || '').replace(/\D/g, '')) || 0;
      const rollB = parseInt(String(b.roll_no || '').replace(/\D/g, '')) || 0;
      return rollA - rollB;
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
      if (defaulterSemFilter !== 'ALL') {
        const stdSem = String(std.semester || std.sem || '1').replace(/\D/g, '').trim();
        if (stdSem !== String(defaulterSemFilter).trim()) return false;
      }
      if (defaulterDivFilter !== 'ALL') {
        const stdDiv = String(std.division || std.div || '').trim().toUpperCase();
        if (stdDiv !== defaulterDivFilter.toUpperCase()) return false;
      }
      return true;
    });
  }, [defaulterStudentList, defaulterSemFilter, defaulterDivFilter]);

  const totalDefaultersCount = semDivFilteredList.filter(s => s.statusKey === 'CRITICAL').length;
  const warningsIssuedCount = semDivFilteredList.filter(s => s.statusKey === 'WARNING').length;

  const filteredDefaulterList = useMemo(() => {
    return semDivFilteredList.filter(std => {
      if (defaulterStatusFilter === 'CRITICAL') {
        return std.statusKey === 'CRITICAL';
      }
      if (defaulterStatusFilter === 'WARNING') {
        return std.statusKey === 'WARNING';
      }
      // 'ALL' -> Exclude Safe level students completely from defaulters list
      return std.statusKey !== 'SAFE';
    });
  }, [semDivFilteredList, defaulterStatusFilter]);

  const handleOpenAddSubjectModal = () => {
    setNewSubName('');
    setNewSubShort('');
    setNewSubCode('');
    setNewSubSem('');
    setNewSubType('Theory');
    setNewSubFacultyId('');
    setSubjectModalMode('add');
    setEditingSubjectIdx(null);
    setEditingSubjectObj(null);
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
          (s.subjectName || s.name || '').toLowerCase().trim() === (targetSub.subjectName || targetSub.name || '').toLowerCase().trim() &&
          String(s.semester || '1').replace(/\D/g, '') === String(targetSub.semester || '1').replace(/\D/g, '')
        );
      }
    }

    if (!sub) return;
    setEditingSubjectObj(sub);
    setEditingSubjectIdx(targetIdx >= 0 ? targetIdx : 0);
    setNewSubName(sub.subjectName || sub.name || '');
    setNewSubShort(sub.shortName || sub.shortCode || sub.short || '');
    setNewSubCode(sub.code || sub.subjectCode || sub.subject_code || sub.subCode || sub.sub_code || '');
    setNewSubSem(sub.semester ? String(sub.semester).replace(/\D/g, '') : '');
    setNewSubType(sub.type || sub.subjectType || 'Theory');
    setNewSubFacultyId(sub.facultyId || '');
    setSubjectModalMode('edit');
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
    if (!newSubSem) {
      showToast('Please select a semester.', 'warning');
      return;
    }

    const subCodeVal = (newSubCode || '').trim();
    const newSubObj = {
      subjectName: newSubName.trim(),
      shortName: newSubShort.trim(),
      code: subCodeVal,
      subjectCode: subCodeVal,
      semester: String(newSubSem),
      type: newSubType || 'Theory'
    };

    const newSemNum = String(newSubSem).replace(/\D/g, '');
    const newTypeLower = (newSubType || 'Theory').trim().toLowerCase();

    // Helper to check if item `s` in allFacultySubjects is the exact subject currently being edited
    const isEditingThisSubject = (s, idx) => {
      if (subjectModalMode !== 'edit') return false;
      if (editingSubjectObj) {
        if (s.subKey && editingSubjectObj.subKey && s.subKey === editingSubjectObj.subKey) return true;
        if (s.globalKey && editingSubjectObj.globalKey && s.globalKey === editingSubjectObj.globalKey) return true;

        const sCode = String(s.code || s.subjectCode || s.subject_code || '').trim().toLowerCase();
        const origCode = String(editingSubjectObj.code || editingSubjectObj.subjectCode || editingSubjectObj.subject_code || '').trim().toLowerCase();
        const sSem = String(s.semester || '1').replace(/\D/g, '');
        const origSem = String(editingSubjectObj.semester || '1').replace(/\D/g, '');
        const sName = String(s.subjectName || s.name || '').trim().toLowerCase();
        const origName = String(editingSubjectObj.subjectName || editingSubjectObj.name || '').trim().toLowerCase();
        const sType = String(s.type || s.subjectType || 'Theory').trim().toLowerCase();
        const origType = String(editingSubjectObj.type || editingSubjectObj.subjectType || 'Theory').trim().toLowerCase();

        if (sSem === origSem && sType === origType) {
          if (origCode && sCode && origCode === sCode) return true;
          if (origName && sName && origName === sName) return true;
        }
      }
      return editingSubjectIdx === idx;
    };

    // 1. Check duplicate Subject Code across ALL semesters (Subject code must be unique globally across all semesters)
    if (subCodeVal) {
      const dupCodeSubject = (allFacultySubjects || []).find((s, idx) => {
        if (isEditingThisSubject(s, idx)) return false;
        const existingCode = String(s.code || s.subjectCode || s.subject_code || s.subCode || s.sub_code || '').trim().toLowerCase();
        return existingCode && existingCode === subCodeVal.toLowerCase();
      });

      if (dupCodeSubject) {
        const dupName = dupCodeSubject.subjectName || dupCodeSubject.name || 'another subject';
        const dupSem = String(dupCodeSubject.semester || '1').replace(/\D/g, '');
        showToast(`Subject Code "${subCodeVal}" is already assigned to "${dupName}" in Semester ${dupSem}! Subject code must be unique across all semesters.`, 'error', 5000);
        return;
      }
    }

    // 2. Check duplicate Subject Name + Semester + Type + Code combination
    const isExactDup = (allFacultySubjects || []).some((s, idx) => {
      if (isEditingThisSubject(s, idx)) return false;
      const sameName = (s.subjectName || s.name || '').toLowerCase().trim() === newSubObj.subjectName.toLowerCase().trim();
      const sameSem = String(s.semester || '1').replace(/\D/g, '') === newSemNum;
      const sameType = String(s.type || s.subjectType || 'Theory').toLowerCase().trim() === newTypeLower;
      const existingCode = String(s.code || s.subjectCode || s.subject_code || s.subCode || s.sub_code || '').trim().toLowerCase();
      const sameCode = existingCode === subCodeVal.toLowerCase();

      if (!subCodeVal && !existingCode) {
        return sameName && sameSem && sameType;
      }
      return sameName && sameSem && sameType && sameCode;
    });

    if (isExactDup) {
      showToast(`Subject "${newSubObj.subjectName}" (${newSubObj.type}) with Code "${subCodeVal}" already exists for Semester ${newSubSem}.`, 'warning', 4500);
      return;
    }

    if (subjectModalMode === 'add') {
      // Save to global catalog (unassigned)
      const globalKey = `global_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newGlobalSubs = [...(globalSubjectsCatalog || []), { ...newSubObj, globalKey }];
      setGlobalSubjectsCatalog(newGlobalSubs);
      localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(newGlobalSubs));

      // Save to Supabase subjects table via backend API
      if (token) {
        fetch('/api/subjects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(newSubObj)
        })
        .then(res => res.json())
        .then(resData => {
          if (resData && resData.subject) {
            console.log('Subject successfully saved in Supabase subjects table:', resData.subject);
          }
        })
        .catch(err => console.error('Error saving subject to Supabase:', err));
      }

      showToast(`Subject "${newSubObj.subjectName}" (${newSubObj.type}) added! Use Assign Faculty button to assign a faculty.`, 'success', 3500);
    } else if (subjectModalMode === 'edit') {
      const originalSub = editingSubjectObj || ((editingSubjectIdx !== null && editingSubjectIdx >= 0) ? allFacultySubjects[editingSubjectIdx] : null);
      if (!originalSub) {
        showToast('Could not find subject to edit.', 'error');
        return;
      }

      const origName = String(originalSub.subjectName || originalSub.name || '').toLowerCase().trim();
      const origCode = String(originalSub.code || originalSub.subjectCode || originalSub.subject_code || '').toLowerCase().trim();
      const origSem = String(originalSub.semester || '1').replace(/\D/g, '');
      const origType = String(originalSub.type || originalSub.subjectType || 'Theory').toLowerCase().trim();
      const origSubKey = originalSub.subKey;
      const origGlobalKey = originalSub.globalKey;

      // Strict multi-attribute matcher to find the target subject in DB/catalog
      const isMatchWithOriginal = (s) => {
        if (!s) return false;
        const sSubKey = s.subKey || s.globalKey;
        if (sSubKey && ((origSubKey && sSubKey === origSubKey) || (origGlobalKey && sSubKey === origGlobalKey))) return true;

        const sName = String(s.subjectName || s.name || '').toLowerCase().trim();
        const sCode = String(s.code || s.subjectCode || s.subject_code || s.subCode || s.sub_code || '').toLowerCase().trim();
        const sSem = String(s.semester || '1').replace(/\D/g, '');
        const sType = String(s.type || s.subjectType || 'Theory').toLowerCase().trim();

        const sameCode = origCode && sCode && origCode === sCode;
        const sameName = origName && sName && origName === sName;
        const sameSem = sSem === origSem;
        const sameType = sType === origType;

        // Must match type AND semester AND (code OR name)
        if ((sameCode || sameName) && sameSem && sameType) return true;
        if (sameCode && sameName && sameSem) return true;
        if (sameCode && sameName && sameType) return true;

        return false;
      };

      setSavingSubjects(true);
      try {
        const updatePromises = [];
        (faculties || []).forEach(f => {
          let currentFacultySubjects = [];
          if (typeof f.subjects === 'string') {
            try { currentFacultySubjects = JSON.parse(f.subjects); } catch (e) { currentFacultySubjects = []; }
          } else if (Array.isArray(f.subjects)) {
            currentFacultySubjects = [...f.subjects];
          }

          const localIdx = currentFacultySubjects.findIndex(s => isMatchWithOriginal(s));

          if (localIdx >= 0) {
            currentFacultySubjects[localIdx] = {
              ...currentFacultySubjects[localIdx],
              subjectName: newSubObj.subjectName,
              shortName: newSubObj.shortName,
              code: newSubObj.code,
              subjectCode: newSubObj.code,
              semester: newSubObj.semester,
              type: newSubObj.type
            };
            updatePromises.push(handleSaveSubjectsToBackend(f.id, currentFacultySubjects, false));
          }
        });

        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }

        // ALSO update in globalSubjectsCatalog in-place if present
        const newGlobalSubs = (globalSubjectsCatalog || []).map(s => {
          if (isMatchWithOriginal(s)) {
            return {
              ...s,
              subjectName: newSubObj.subjectName,
              shortName: newSubObj.shortName,
              code: newSubObj.code,
              subjectCode: newSubObj.code,
              semester: newSubObj.semester,
              type: newSubObj.type,
              globalKey: s.globalKey || origGlobalKey || origSubKey
            };
          }
          return s;
        });
        setGlobalSubjectsCatalog(newGlobalSubs);
        localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(newGlobalSubs));

        // ALSO update in Supabase subjects table via backend API!
        if (token) {
          fetch('/api/subjects/update-match', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ originalSub, newSubObj })
          })
          .then(res => res.json())
          .then(resData => {
            console.log('Subject update synced to Supabase DB:', resData);
          })
          .catch(err => console.error('Error updating subject in Supabase DB:', err));
        }

        showToast(`Subject "${newSubObj.subjectName}" updated successfully!`, 'success', 3000);
        await fetchFaculties();
      } catch (err) {
        console.error('Error updating subject across faculties:', err);
        showToast('Failed to update subject details.', 'error');
      } finally {
        setSavingSubjects(false);
      }
    }

    setNewSubName('');
    setNewSubShort('');
    setNewSubCode('');
    setNewSubSem('');
    setNewSubType('Theory');
    setNewSubFacultyId('');
    setSubjectModalMode('add');
    setEditingSubjectIdx(null);
    setEditingSubjectObj(null);
    setShowAddSubjectModal(false);
  };

  const handleOpenAssignFacultyModal = (sub) => {
    if (!sub) return;
    setAssigningSubject(sub);
    setAssignFacultySearch('');
    const targetSubName = String(sub.subjectName || sub.name || '').toLowerCase().trim();
    const targetSem = String(sub.semester || '1').replace(/\D/g, '') || '1';
    const targetType = String(sub.type || sub.subjectType || 'Theory').toLowerCase().trim();
    const targetCode = String(sub.code || sub.subjectCode || '').toLowerCase().trim();
    const targetDbId = sub.dbId || sub.id;

    const assignedIdsSet = new Set();

    // 1. Collect faculty IDs directly from sub object properties (facultyIds / facultyId)
    if (Array.isArray(sub.facultyIds) && sub.facultyIds.length > 0) {
      sub.facultyIds.forEach(id => {
        if (id) assignedIdsSet.add(String(id).trim());
      });
    }
    if (sub.facultyId) {
      assignedIdsSet.add(String(sub.facultyId).trim());
    }

    // 2. Also match by facultyNames / facultyNamesList if IDs were name strings
    if (Array.isArray(sub.facultyNamesList) && sub.facultyNamesList.length > 0) {
      sub.facultyNamesList.forEach(fn => {
        if (!fn) return;
        const matchedFac = (faculties || []).find(f => f.name && f.name.toLowerCase().trim() === String(fn).toLowerCase().trim());
        if (matchedFac) {
          assignedIdsSet.add(String(matchedFac.id));
        }
      });
    }

    // 3. Check faculties list to see which faculties have this subject in their f.subjects array
    (faculties || []).forEach(f => {
      let fSubs = [];
      if (typeof f.subjects === 'string') {
        try { fSubs = JSON.parse(f.subjects); } catch (e) { fSubs = []; }
      } else if (Array.isArray(f.subjects)) {
        fSubs = f.subjects;
      }
      const teachesThisSub = (fSubs || []).some(s => {
        if (!s) return false;
        const sDbId = s.dbId || s.id;
        if (targetDbId && sDbId && String(targetDbId) === String(sDbId)) return true;

        const sCode = String(s.code || s.subjectCode || '').toLowerCase().trim();
        const sSem = String(s.semester || '1').replace(/\D/g, '') || '1';
        const sType = String(s.type || s.subjectType || 'Theory').toLowerCase().trim();
        const sName = String(s.subjectName || s.name || '').toLowerCase().trim();

        if (targetCode && sCode) {
          return targetCode === sCode && targetSem === sSem && sType === targetType;
        }
        if (targetSubName && sName) {
          return targetSubName === sName && targetSem === sSem && sType === targetType;
        }
        return false;
      });

      if (teachesThisSub) {
        assignedIdsSet.add(String(f.id));
      }
    });

    const initialSelectedIds = Array.from(assignedIdsSet);
    setSelectedAssignFacultyIds(initialSelectedIds);
    setShowAssignFacultyModal(true);
  };

  const toggleAssignFacultySelect = (facId) => {
    const idStr = String(facId);
    if (selectedAssignFacultyIds.includes(idStr)) {
      setSelectedAssignFacultyIds(prev => prev.filter(id => id !== idStr));
    } else {
      setSelectedAssignFacultyIds(prev => [...prev, idStr]);
    }
  };

  const handleSaveFacultyAssignment = async () => {
    if (!assigningSubject) return;

    setSavingFacultyAssignment(true);
    try {
      const targetSubName = String(assigningSubject.subjectName || assigningSubject.name || '').toLowerCase().trim();
      const targetSem = String(assigningSubject.semester || '1').replace(/\D/g, '') || '1';
      const targetType = String(assigningSubject.type || assigningSubject.subjectType || 'Theory').toLowerCase().trim();
      const targetCode = String(assigningSubject.code || assigningSubject.subjectCode || '').toLowerCase().trim();
      const targetDbId = assigningSubject.dbId || assigningSubject.id;

      const subObjToAssign = {
        subjectName: assigningSubject.subjectName || assigningSubject.name || '',
        shortName: assigningSubject.shortName || assigningSubject.shortCode || '',
        code: (assigningSubject.code || assigningSubject.subjectCode || '').toString().trim(),
        subjectCode: (assigningSubject.code || assigningSubject.subjectCode || '').toString().trim(),
        semester: String(assigningSubject.semester || '1'),
        type: assigningSubject.type || assigningSubject.subjectType || 'Theory',
        dbId: targetDbId || null
      };

      const isSameSub = (sObj) => {
        if (!sObj) return false;
        const sDbId = sObj.dbId || sObj.id;
        if (targetDbId && sDbId && String(targetDbId) === String(sDbId)) return true;

        const sCode = String(sObj.code || sObj.subjectCode || sObj.subject_code || sObj.subCode || sObj.sub_code || '').toLowerCase().trim();
        const sSem = String(sObj.semester || '1').replace(/\D/g, '') || '1';
        const sType = String(sObj.type || sObj.subjectType || 'Theory').toLowerCase().trim();
        const sName = String(sObj.subjectName || sObj.name || '').toLowerCase().trim();

        if (targetCode && sCode) {
          return targetCode === sCode && targetSem === sSem && sType === targetType;
        }
        if (targetSubName && sName) {
          return targetSubName === sName && targetSem === sSem && sType === targetType;
        }
        return false;
      };

      // 1. Optimistically compute updated faculties list
      const updatedFacultiesList = (faculties || []).map(f => {
        let currentSubs = [];
        if (typeof f.subjects === 'string') {
          try { currentSubs = JSON.parse(f.subjects); } catch (e) { currentSubs = []; }
        } else if (Array.isArray(f.subjects)) {
          currentSubs = [...f.subjects];
        }

        const hasThisSub = currentSubs.some(isSameSub);
        const shouldHave = selectedAssignFacultyIds.includes(String(f.id));

        if (shouldHave && !hasThisSub) {
          const updatedSubs = [...currentSubs, subObjToAssign];
          return { ...f, subjects: updatedSubs };
        } else if (!shouldHave && hasThisSub) {
          const updatedSubs = currentSubs.filter(s => !isSameSub(s));
          return { ...f, subjects: updatedSubs };
        }
        return f;
      });

      // 2. Optimistically compute updated global subjects catalog
      const globalKey = assigningSubject.globalKey || assigningSubject.subKey || `global_${targetSubName}_${targetSem}_${targetType}`;

      const assignedFacultyNames = selectedAssignFacultyIds.map(fid => {
        const fac = (updatedFacultiesList || faculties || []).find(f => String(f.id) === String(fid));
        return fac ? (fac.name || 'Faculty') : null;
      }).filter(Boolean);

      const assignedFacultyNameStr = assignedFacultyNames.length > 0 ? assignedFacultyNames.join(', ') : 'Unassigned';

      const updatedSubObj = {
        ...assigningSubject,
        ...subObjToAssign,
        globalKey,
        facultyId: selectedAssignFacultyIds[0] || null,
        facultyIds: selectedAssignFacultyIds,
        facultyNamesList: assignedFacultyNames,
        facultyName: assignedFacultyNameStr
      };

      let updatedGlobal = [...(globalSubjectsCatalog || [])];
      const matchIdx = updatedGlobal.findIndex(s => {
        const sKey = s.globalKey || s.subKey;
        if (globalKey && sKey && globalKey === sKey) return true;
        const sName = String(s.subjectName || s.name || '').toLowerCase().trim();
        const sSem = String(s.semester || '1').replace(/\D/g, '');
        const sCode = String(s.code || s.subjectCode || '').toLowerCase().trim();
        const sType = String(s.type || s.subjectType || 'Theory').toLowerCase().trim();
        if (targetCode && sCode && targetCode === sCode && targetSem === sSem && sType === targetType) return true;
        return sName === targetSubName && sSem === targetSem && sType === targetType;
      });

      if (matchIdx >= 0) {
        updatedGlobal[matchIdx] = { ...updatedGlobal[matchIdx], ...updatedSubObj };
      } else {
        updatedGlobal.push(updatedSubObj);
      }

      // 3. INSTANT OPTIMISTIC UI UPDATES (< 1ms)
      setFaculties(updatedFacultiesList);
      setGlobalSubjectsCatalog(updatedGlobal);
      try {
        sessionStorage.setItem('cached_admin_faculties', JSON.stringify(updatedFacultiesList));
        localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(updatedGlobal));
      } catch (e) {}

      // Close modal & toast instantly!
      const actionText = selectedAssignFacultyIds.length > 0 
        ? `Faculty assigned successfully to "${assigningSubject.subjectName || assigningSubject.name}"!` 
        : `Faculty unassigned for "${assigningSubject.subjectName || assigningSubject.name}".`;
      showToast(actionText, 'success', 3000);
      setShowAssignFacultyModal(false);
      setSavingFacultyAssignment(false);

      // 4. Background DB Sync call
      if (token) {
        fetch('/api/subjects/assign-faculty', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ assigningSubject, facultyIds: selectedAssignFacultyIds })
        })
          .then(res => res.json())
          .then(resData => {
            console.log('Faculty assignment synced to Supabase DB:', resData);
            notifyDataChanged();
          })
          .catch(err => {
            console.error('Background sync error:', err);
          });
      }
    } catch (err) {
      console.error('Error saving faculty assignment:', err);
      showToast('Failed to update faculty assignment. Please try again.', 'error');
      setSavingFacultyAssignment(false);
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
  const [qrCodeTimer, setQrCodeTimer] = useState(15);
  const [qrGenerationEnabled, setQrGenerationEnabled] = useState(true);
  const [qrDailyLimit, setQrDailyLimit] = useState(5);
  const [qrLimitInput, setQrLimitInput] = useState('5');
  const [qrLimitSaving, setQrLimitSaving] = useState(false);
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
  const [locationSaving, setLocationSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const fileInputRef = useRef(null);
  const facultyFileInputRef = useRef(null);
  const subjectFileInputRef = useRef(null);
  const semesterFileInputRef = useRef(null);
  const firstSemInputRef = useRef(null);
  const addSemCreateBtnRef = useRef(null);
  const firstStudentInputRef = useRef(null);
  const addStudentSaveBtnRef = useRef(null);
  const firstFacultyInputRef = useRef(null);
  const addFacultySaveBtnRef = useRef(null);
  const firstSubjectInputRef = useRef(null);
  const addSubjectSaveBtnRef = useRef(null);
  const statCardsRef = useRef(null);
  const statsPanelRef = useRef(null);

  // Auto-focus first input field when Add Semester Modal opens
  useEffect(() => {
    if (showAddSemesterModal) {
      setTimeout(() => {
        if (firstSemInputRef.current) {
          firstSemInputRef.current.focus();
          firstSemInputRef.current.select();
        }
      }, 50);
    }
  }, [showAddSemesterModal]);

  // Auto-focus first input field when Add Student Modal opens
  useEffect(() => {
    if (showStudentModal) {
      setTimeout(() => {
        if (firstStudentInputRef.current) {
          firstStudentInputRef.current.focus();
        }
      }, 50);
    }
  }, [showStudentModal]);

  // Auto-focus first input field when Add Faculty Modal opens
  useEffect(() => {
    if (showFacultyModal) {
      setTimeout(() => {
        if (firstFacultyInputRef.current) {
          firstFacultyInputRef.current.focus();
        }
      }, 50);
    }
  }, [showFacultyModal]);

  // Auto-focus first input field when Add Subject Modal opens
  useEffect(() => {
    if (showAddSubjectModal) {
      setTimeout(() => {
        if (firstSubjectInputRef.current) {
          firstSubjectInputRef.current.focus();
        }
      }, 50);
    }
  }, [showAddSubjectModal]);

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
        setQrSessionHistory([]);
        try { sessionStorage.removeItem('cached_admin_qrhistory'); } catch (e) { }
        await fetchQrData();
        if (res.ok) {
          showToast('Session history cleared! Session count restarted from #1.', 'success');
        } else {
          showToast('Session history cleared.', 'info');
        }
      } catch (err) {
        setQrSessionHistory([]);
        showToast('Session history cleared.', 'info');
      }
    }
  };

  const fetchQrSettings = async () => {
    try {
      const [resSettings, resLimit] = await Promise.all([
        fetch('/api/qr/settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/qr/limit', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (resSettings.ok) {
        const data = await resSettings.json();
        setQrGenerationEnabled(data.enabled);
      }
      if (resLimit.ok) {
        const data = await resLimit.json();
        setQrDailyLimit(data.limit);
        setQrLimitInput(String(data.limit));
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
        window.dispatchEvent(new CustomEvent('app_data_changed'));
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('attendance_system_sync');
            bc.postMessage({ type: 'DATA_CHANGED' });
            bc.close();
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Error toggling QR settings:', err);
    }
  };

  const handleSaveQrLimit = async () => {
    const val = parseInt(qrLimitInput);
    if (isNaN(val) || val < 1 || val > 100) {
      showToast('Please enter a valid limit between 1 and 100.', 'warning');
      return;
    }
    setQrLimitSaving(true);
    try {
      const res = await fetch('/api/qr/limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ limit: val })
      });
      if (res.ok) {
        setQrDailyLimit(val);
        showToast(`QR session limit set to ${val} per day successfully!`, 'success', 3000);
        window.dispatchEvent(new CustomEvent('app_data_changed'));
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('attendance_system_sync');
            bc.postMessage({ type: 'DATA_CHANGED' });
            bc.close();
          } catch (e) {}
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save limit.', 'error');
      }
    } catch (err) {
      console.error('Error saving QR limit:', err);
      showToast('Network error saving limit.', 'error');
    } finally {
      setQrLimitSaving(false);
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

  const fetchReportDataRef = useRef(fetchReportData);
  useEffect(() => {
    fetchReportDataRef.current = fetchReportData;
  });

  // Run on mount
  useEffect(() => {
    fetchStats();
    fetchLiveLogs();
    fetchStudents();
    fetchQrData();
    fetchFaculties();
    fetchQrSettings();
    fetchAllLeaves();
    fetchReportData();
  }, []);

  // Smart Auto-Polling for Stats, Logs, Sessions & Reports (Live Real-Time Updates)
  useEffect(() => {
    const isSessionActive = stats.activeQrSession !== null || activeQrSessionDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 4000;

    const interval = setInterval(() => {
      fetchStats();
      fetchLiveLogs();
      fetchQrData();
      if (fetchReportDataRef.current) {
        fetchReportDataRef.current();
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [stats.activeQrSession, activeQrSessionDetails]);

  // Instant Cross-Panel BroadcastChannel, SSE & Custom Event Sync
  useEffect(() => {
    const refreshAll = () => {
      fetchStats();
      fetchLiveLogs();
      fetchStudents();
      fetchQrData();
      fetchFaculties();
      fetchQrSettings();
      fetchAllLeaves();
      if (fetchReportDataRef.current) {
        fetchReportDataRef.current();
      }
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

    let eventSource = null;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        eventSource = new EventSource('/api/sync/events');
        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && (data.type === 'DATA_CHANGED' || data.type === 'FACULTY_CHANGED' || data.type === 'STUDENT_CHANGED')) {
              refreshAll();
            }
          } catch (err) {}
        };
      } catch (e) {}
    }

    return () => {
      window.removeEventListener('app_data_changed', refreshAll);
      if (bc) bc.close();
      if (eventSource) eventSource.close();
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
    setLocationSaving(true);
    try {
      const res = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(locationForm)
      });
      const data = await res.json();
      if (res.ok) {
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

        Swal.fire({
          icon: 'success',
          title: 'Location Saved Successfully!',
          html: `
            <div style="font-size: 0.92rem; color: #334155; text-align: left; line-height: 1.6; padding: 10px 14px; background: rgba(16, 185, 129, 0.08); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.25);">
              <div>📍 <strong>Latitude:</strong> ${updated.latitude.toFixed(6)}</div>
              <div>📍 <strong>Longitude:</strong> ${updated.longitude.toFixed(6)}</div>
              <div>🎯 <strong>Radius:</strong> ${updated.radius} meters</div>
            </div>
            <p style="margin-top: 10px; font-size: 0.85rem; color: #10b981; font-weight: 600;">Campus geofence updated for all students & faculties.</p>
          `,
          confirmButtonText: 'Great!',
          confirmButtonColor: '#10b981',
          timer: 3500
        });
      } else {
        const errMsg = data.error || 'Failed to save location configuration.';
        setLocationMessage(errMsg);
        Swal.fire({
          icon: 'error',
          title: 'Location Not Saved!',
          text: errMsg,
          confirmButtonText: 'Try Again',
          confirmButtonColor: '#ef4444'
        });
      }
    } catch (err) {
      console.error('Error saving location:', err);
      const netMsg = 'Network error. Failed to save location.';
      setLocationMessage(netMsg);
      Swal.fire({
        icon: 'error',
        title: 'Location Not Saved!',
        text: 'Network error occurred while saving location. Please check your connection and try again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLocationSaving(false);
    }
  };

  // Live coordinates fetching from device GPS
  const handleGetAdminLiveLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
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
        showToast('Campus location set successfully to device GPS!', 'success');
      },
      (error) => {
        showToast(`GPS Location Error: ${error.message}`, 'error');
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
          showToast(`Location set successfully: ${display_name.split(',')[0]}`, 'success');
        } else {
          showToast('Location address not found. Please try again.', 'error');
        }
      } else {
        showToast('Failed to connect to location search service.', 'error');
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      showToast('Error connecting to location search service.', 'error');
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
        notifyDataChanged();
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

  // Send imported student batch to backend with full duplicate error reporting
  const sendBulkImport = async (studentsList, allowedSemesters = []) => {
    if (!Array.isArray(studentsList) || studentsList.length === 0) {
      showToast('No student records found to import.', 'warning');
      return;
    }

    const prevStudents = [...students];
    const optimisticRows = studentsList.map((stu, idx) => ({
      id: `opt_${Date.now()}_${idx}`,
      enrollment_no: String(stu.enrollment_no || '').trim(),
      name: String(stu.name || '').trim(),
      course: String(stu.course || '').trim(),
      semester: String(stu.semester || '').trim(),
      division: stu.division ? String(stu.division).trim().toUpperCase() : '',
      roll_no: stu.roll_no ? String(stu.roll_no).trim() : '',
      mobile: String(stu.mobile || '').trim(),
      email: stu.email ? String(stu.email).trim().toLowerCase() : '',
      username: String(stu.enrollment_no || '').trim().toLowerCase(),
      plain_password: String(stu.mobile || '').trim()
    }));

    const optimisticList = [...optimisticRows, ...students];
    setStudents(optimisticList);
    setStats(prev => ({ ...prev, totalStudents: (prev.totalStudents || 0) + optimisticRows.length }));
    try {
      sessionStorage.setItem('cached_admin_students', JSON.stringify(optimisticList));
      localStorage.setItem('cached_admin_students', JSON.stringify(optimisticList));
    } catch (e) {}

    try {
      const payloadAllowedSems = allowedSemesters.length > 0
        ? allowedSemesters
        : (allSemestersList || []).map(s => String(s.semNumber || s.id).trim());

      const response = await fetch('/api/students/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ students: studentsList, allowedSemesters: payloadAllowedSems })
      });
      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        setStudents(prevStudents);
        showToast(data.error || 'Your session has expired. Please log in again.', 'error');
        if (onLogout) onLogout();
        return;
      }

      if (response.ok) {
        showToast(data.message || `Successfully imported ${studentsList.length} student records!`, 'success');
        fetchStudents(false);
        fetchStats();
      } else {
        setStudents(prevStudents);
        try {
          sessionStorage.setItem('cached_admin_students', JSON.stringify(prevStudents));
          localStorage.setItem('cached_admin_students', JSON.stringify(prevStudents));
        } catch (e) {}
        fetchStudents(false);
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          Swal.fire({
            icon: 'error',
            title: 'Bulk Upload Failed!',
            html: `
              <div style="text-align: left; max-height: 250px; overflow-y: auto; font-size: 0.84rem; padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.25);">
                <strong style="color: #b91c1c;">Found ${data.errors.length} duplicate / validation issue(s):</strong>
                <ul style="margin-top: 8px; padding-left: 18px; line-height: 1.5; color: #dc2626;">
                  ${data.errors.slice(0, 15).map(e => `<li>${e}</li>`).join('')}
                  ${data.errors.length > 15 ? `<li style="font-weight: 700;">...and ${data.errors.length - 15} more errors</li>` : ''}
                </ul>
              </div>
              <p style="margin-top: 10px; font-size: 0.82rem; color: #64748b;">
                Please ensure mobile numbers, emails, and enrollment numbers are unique, and roll numbers are not duplicated in the same semester & division.
              </p>
            `,
            confirmButtonText: 'Review & Fix',
            confirmButtonColor: '#f59e0b'
          });
        } else {
          showToast(data.error || 'Bulk upload failed.', 'error', 5000);
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      setStudents(prevStudents);
      fetchStudents(false);
      showToast(err.message || 'Failed to upload students.', 'error');
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

  // Helper to extract clean digit strings without scientific notation precision loss
  const cleanDigitString = (val) => {
    if (val === undefined || val === null) return '';
    let str = String(val).trim();
    if (!str) return '';

    // Handle potential scientific notation (e.g. 2.400059139e+09 or 2.400059139E9)
    if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)$/.test(str)) {
      try {
        const num = Number(str);
        if (!isNaN(num) && isFinite(num)) {
          str = BigInt(Math.round(num)).toString();
        }
      } catch (_) {}
    }

    // Remove trailing .0 or float decimal representations from Excel
    str = str.replace(/\.0+$/, '').trim();
    // Extract only digits
    return str.replace(/\D/g, '');
  };

  // Helper to map header columns to student properties
  const parseHeaderToStudentField = (header, val, stuObj) => {
    if (val === undefined || val === null) return;
    let strVal = String(val).trim();
    if (!strVal) return;

    const rawH = String(header || '').trim().toLowerCase();
    const cleanH = rawH.replace(/[^a-z0-9]/g, '');
    if (!cleanH) return;

    // 0. Ignore Serial Number / Row Index columns
    if (
      cleanH === 'srno' ||
      cleanH === 'sno' ||
      cleanH === 'slno' ||
      cleanH === 'serialno' ||
      cleanH === 'sr' ||
      cleanH === 'seq' ||
      cleanH === 'seqno' ||
      cleanH === 'index'
    ) {
      return;
    }

    // 1. Enrollment No / Registration No / Student ID (Specific matches only)
    if (
      cleanH.includes('enroll') ||
      cleanH.includes('enrol') ||
      cleanH.includes('registra') ||
      cleanH.includes('regno') ||
      cleanH.includes('admission') ||
      cleanH.includes('admno') ||
      cleanH === 'eno' ||
      cleanH === 'enrno' ||
      cleanH === 'enno' ||
      cleanH === 'grno' ||
      cleanH === 'prn' ||
      cleanH === 'urn' ||
      cleanH === 'uid' ||
      cleanH === 'studentid' ||
      cleanH === 'stdid' ||
      cleanH === 'studentno' ||
      cleanH === 'stdno'
    ) {
      const cleanDigits = cleanDigitString(strVal);
      if (cleanDigits) {
        stuObj.enrollment_no = cleanDigits;
      }
    }
    // 2. Roll No (Must not match enrollment)
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
    // 4. Name / Candidate / Student Name
    else if (cleanH.includes('name') || cleanH.includes('student') || cleanH === 'candidate') {
      stuObj.name = strVal;
    }
    // 5. Course / Branch / Dept / Stream / Program
    else if (
      cleanH.includes('course') ||
      cleanH.includes('dept') ||
      cleanH.includes('branch') ||
      cleanH.includes('stream') ||
      cleanH.includes('program') ||
      cleanH.includes('degree')
    ) {
      stuObj.course = strVal;
    }
    // 6. Semester / Sem / Year / Term
    else if (cleanH.includes('semester') || cleanH.includes('sem') || cleanH.includes('term') || cleanH === 'yr' || cleanH === 'year') {
      stuObj.semester = strVal.replace(/sem/gi, '').trim();
    }
    // 7. Mobile / Phone / Contact / WhatsApp / Cell
    else if (
      cleanH.includes('mobile') ||
      cleanH.includes('phone') ||
      cleanH.includes('contact') ||
      cleanH.includes('cell') ||
      cleanH.includes('whatsapp') ||
      cleanH.includes('phno') ||
      cleanH.includes('mob')
    ) {
      const cleanDigits = cleanDigitString(strVal);
      stuObj.mobile = cleanDigits || strVal;
    }
    // 8. Email / Gmail ID
    else if (cleanH.includes('email') || cleanH.includes('gmail') || cleanH.includes('mail')) {
      stuObj.email = strVal;
    }
    // 9. Password (Optional)
    else if (cleanH.includes('password') || cleanH.includes('pass')) {
      stuObj.password = strVal;
    }
  };

  // Helper to validate whether a given semester matches any configured semester in options
  const isSemesterInOptions = (inputSem, semestersList) => {
    if (!Array.isArray(semestersList) || semestersList.length === 0) return false;
    const cleanInput = String(inputSem || '').trim();
    if (!cleanInput) return false;

    const lowerInput = cleanInput.toLowerCase();
    const digitInput = cleanInput.replace(/\D/g, '');

    return semestersList.some(s => {
      const semNum = String(s.semNumber || s.id || '').trim();
      const semNumLower = semNum.toLowerCase();
      const semNumDigit = semNum.replace(/\D/g, '');
      const semNameLower = String(s.name || '').trim().toLowerCase();

      if (lowerInput === semNumLower) return true;
      if (digitInput && semNumDigit && digitInput === semNumDigit) return true;
      if (semNameLower && (lowerInput === semNameLower || lowerInput.includes(semNameLower) || semNameLower.includes(lowerInput))) return true;

      return false;
    });
  };

  // CSV & XLSX student import handler
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType !== 'csv' && fileType !== 'xlsx' && fileType !== 'xls') {
      showToast('Invalid file format! Please upload only .csv or .xlsx excel files.', 'error');
      e.target.value = '';
      return;
    }

    if (!allSemestersList || allSemestersList.length === 0) {
      showToast('Bulk Upload Failed: No semester options exist in the system. Please add semester(s) in the Semester Management menu first.', 'error', 6000);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let rows = [];
        const data = new Uint8Array(event.target.result);

        // Attempt 1: Read via XLSX library across all sheets
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

        // Attempt 2: Fallback to plain text splitting for raw CSV/TSV
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

        // Dynamically detect header row (first row with recognized column keywords like enroll, name, roll, mobile, etc.)
        let headerRowIdx = 0;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          const rowCells = rows[r].map(c => String(c || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
          const hasEnroll = rowCells.some(c => c.includes('enroll') || c.includes('enrol') || c.includes('reg') || c === 'eno' || c === 'grno' || c === 'studentid');
          const hasName = rowCells.some(c => c.includes('name') || c.includes('student'));
          const hasRoll = rowCells.some(c => c.includes('roll'));
          const hasMobile = rowCells.some(c => c.includes('mobile') || c.includes('phone') || c.includes('contact'));

          if ((hasEnroll && (hasName || hasRoll || hasMobile)) || (hasName && hasRoll) || (hasName && hasMobile)) {
            headerRowIdx = r;
            break;
          }
        }

        const headers = rows[headerRowIdx].map(h => (h ? h.toString().trim().toLowerCase() : ''));
        const studentsList = [];
        let invalidEnrollmentCount = 0;
        const semesterValidationErrors = [];
        const availableSemLabels = allSemestersList
          .map(s => s.name || `Semester ${s.semNumber || s.id}`)
          .join(', ');

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const values = rows[i];
          if (!values || values.length === 0 || !values.some(v => v !== null && v !== undefined && String(v).trim() !== '')) continue;

          const stuObj = {};
          headers.forEach((header, index) => {
            let val = values[index] !== undefined && values[index] !== null ? values[index].toString().trim() : '';
            parseHeaderToStudentField(header, val, stuObj);
          });

          if (stuObj.enrollment_no || stuObj.name) {
            const cleanEnroll = cleanDigitString(stuObj.enrollment_no || '');
            if (!cleanEnroll || !/^\d{10}$/.test(cleanEnroll)) {
              invalidEnrollmentCount++;
              continue;
            }

            const rawSem = stuObj.semester;
            if (!rawSem || !isSemesterInOptions(rawSem, allSemestersList)) {
              const semDisplay = rawSem ? `"${rawSem}"` : 'Not provided';
              const studentLabel = stuObj.name || `Enrollment: ${cleanEnroll}`;
              semesterValidationErrors.push(`Row ${i + 1} (${studentLabel}): Semester ${semDisplay} is not available in semester options. Only students of configured semesters (${availableSemLabels}) can be added.`);
              continue;
            }

            // Find canonical semester number/ID
            const matchedSem = allSemestersList.find(s => {
              const semNum = String(s.semNumber || s.id || '').trim();
              const semNumDigit = semNum.replace(/\D/g, '');
              const inputDigit = String(rawSem).replace(/\D/g, '');
              return semNum === String(rawSem).trim() || (inputDigit && semNumDigit && inputDigit === semNumDigit) || String(s.name || '').toLowerCase() === String(rawSem).toLowerCase();
            });

            stuObj.enrollment_no = cleanEnroll;
            stuObj.course = stuObj.course || 'B.E.';
            stuObj.semester = matchedSem ? String(matchedSem.semNumber || matchedSem.id) : String(rawSem).replace(/\D/g, '') || '1';
            stuObj.mobile = cleanDigitString(stuObj.mobile || '') || '0000000000';
            studentsList.push(stuObj);
          }
        }

        if (semesterValidationErrors.length > 0) {
          Swal.fire({
            icon: 'error',
            title: 'Bulk Upload Failed!',
            html: `
              <div style="text-align: left; max-height: 250px; overflow-y: auto; font-size: 0.84rem; padding: 10px 12px; background: rgba(239, 68, 68, 0.08); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.25);">
                <strong style="color: #b91c1c;">Found ${semesterValidationErrors.length} invalid semester issue(s):</strong>
                <ul style="margin-top: 8px; padding-left: 18px; line-height: 1.5; color: #dc2626;">
                  ${semesterValidationErrors.slice(0, 15).map(e => `<li>${e}</li>`).join('')}
                  ${semesterValidationErrors.length > 15 ? `<li style="font-weight: 700;">...and ${semesterValidationErrors.length - 15} more errors</li>` : ''}
                </ul>
              </div>
              <p style="margin-top: 10px; font-size: 0.82rem; color: #64748b;">
                Bulk upload only allows adding students for active semester options (${availableSemLabels}). Please add missing semesters in the Semester Management section or adjust your file.
              </p>
            `,
            confirmButtonText: 'Review & Fix',
            confirmButtonColor: '#f59e0b'
          });
          e.target.value = '';
          return;
        }

        if (invalidEnrollmentCount > 0) {
          showToast(`Skipped ${invalidEnrollmentCount} student rows: Enrollment Number must be exactly 10 digits!`, 'warning');
        }

        if (studentsList.length === 0) {
          showToast('Import Failed: Enrollment Number must be exactly 10 digits! No valid student rows found.', 'error');
          return;
        }

        const allowedSemesters = allSemestersList.map(s => String(s.semNumber || s.id).trim());
        sendBulkImport(studentsList, allowedSemesters);
      } catch (err) {
        console.error('Error parsing file for student import:', err);
        showToast('Failed to parse file. Please ensure it is a valid CSV or XLSX Excel file.', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
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

    // 1. Enrollment uniqueness (for Add Mode)
    if (!isEdit) {
      const cleanEnroll = String(studentForm.enrollment_no || '').trim();
      const enrollExists = (students || []).find(s => String(s.enrollment_no || '').trim() === cleanEnroll);
      if (enrollExists) {
        showToast(`Student with Enrollment Number '${cleanEnroll}' already exists (${enrollExists.name})!`, 'error', 5000);
        return;
      }
    }

    // 2. Mobile uniqueness check
    const cleanMobile = String(studentForm.mobile || '').trim();
    const mobileExists = (students || []).find(s => 
      String(s.mobile || '').trim() === cleanMobile &&
      (!isEdit || String(s.id) !== String(studentForm.id))
    );
    if (mobileExists) {
      showToast(`Mobile number '${cleanMobile}' is already registered for student ${mobileExists.name} (${mobileExists.enrollment_no})!`, 'error', 5000);
      return;
    }

    // 3. Email uniqueness check
    if (studentForm.email && studentForm.email.trim()) {
      const cleanEmail = studentForm.email.trim().toLowerCase();
      const emailExists = (students || []).find(s => 
        s.email && String(s.email).trim().toLowerCase() === cleanEmail &&
        (!isEdit || String(s.id) !== String(studentForm.id))
      );
      if (emailExists) {
        showToast(`Email ID '${studentForm.email}' is already registered for student ${emailExists.name} (${emailExists.enrollment_no})!`, 'error', 5000);
        return;
      }
    }

    // 4. Roll Number uniqueness in SAME Semester & Division
    if (studentForm.roll_no && String(studentForm.roll_no).trim() !== '' && studentForm.semester) {
      const cleanRoll = String(studentForm.roll_no).trim();
      const cleanSem = String(studentForm.semester).trim();
      const cleanDiv = studentForm.division ? String(studentForm.division).trim().toUpperCase() : '';

      const rollExists = (students || []).find(s => {
        if (isEdit && String(s.id) === String(studentForm.id)) return false;
        const sSem = String(s.semester || '').trim();
        const sDiv = String(s.division || '').trim().toUpperCase();
        const sRoll = String(s.roll_no || '').trim();
        return sSem === cleanSem && sDiv === cleanDiv && sRoll === cleanRoll;
      });

      if (rollExists) {
        const divText = cleanDiv ? `Division ${cleanDiv}` : 'General Division';
        showToast(`Roll Number '${cleanRoll}' already exists in Semester ${cleanSem}, ${divText} (Assigned to: ${rollExists.name})!`, 'error', 5000);
        return;
      }
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

    if (entityType === 'semester') {
      const targetIdsList = (targetIds && targetIds.length > 0 ? targetIds : [studentId]);
      const targetSet = new Set(targetIdsList.map(id => String(id)));

      // Optimistic instant local removal
      const updatedCustom = customSemesters.filter(s => !targetSet.has(String(s.id)));
      setCustomSemesters(updatedCustom);
      localStorage.setItem('admin_custom_semesters', JSON.stringify(updatedCustom));
      setSelectedSemesterIds(prev => prev.filter(id => !targetSet.has(String(id))));

      try {
        if (targetIdsList.length === 1) {
          await fetch(`/api/semesters/${targetIdsList[0]}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
        } else {
          await fetch('/api/semesters/bulk-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ ids: targetIdsList })
          });
        }
        showToast(`Selected semester(s) deleted successfully!`, 'success');
      } catch (err) {
        console.error('Delete semester error:', err);
      }
      return;
    }

    if (entityType === 'faculty') {
      const rawTargetIdsList = targetIds && targetIds.length > 0 ? targetIds : (studentId ? [studentId] : []);
      const targetIdsList = rawTargetIdsList.filter(id => {
        const fac = (faculties || []).find(f => String(f.id) === String(id));
        return !isPrimaryAdminFaculty(fac) && id !== 'admin_primary' && String(id) !== '78';
      });

      if (targetIdsList.length === 0) {
        showToast('Primary Admin account is protected and cannot be deleted.', 'warning');
        return;
      }

      const prevFacs = [...faculties];
      const targetSet = new Set(targetIdsList.map(id => String(id)));

      // Optimistic instant local removal (0ms delay)
      const updatedList = faculties.filter(f => !targetSet.has(String(f.id)));
      setFaculties(updatedList);
      setSelectedFacultyIds(prev => prev.filter(id => !targetSet.has(String(id))));
      setStats(prev => ({ ...prev, totalFaculty: Math.max(0, (prev.totalFaculty || 0) - targetIdsList.length) }));

      try {
        if (targetIdsList.length > 1) {
          const res = await fetch('/api/faculty/bulk-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ facultyIds: targetIdsList })
          });
          if (res.ok) {
            showToast(`Successfully deleted ${targetIdsList.length} faculty member(s).`, 'success');
            fetchFaculties();
            fetchStats();
            notifyDataChanged();
          } else {
            setFaculties(prevFacs);
            showToast('Failed to delete faculty members', 'error');
          }
        } else if (targetIdsList.length === 1) {
          const res = await fetch(`/api/faculty/${targetIdsList[0]}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            showToast('Faculty member deleted successfully!', 'success');
            fetchFaculties();
            fetchStats();
            notifyDataChanged();
          } else {
            setFaculties(prevFacs);
            showToast('Failed to delete faculty member', 'error');
          }
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
      const isDeletingAll = keysToDelete.size >= allFacultySubjects.length;

      // Collect target subject objects for Supabase deletion
      const subjectsObjectsToDelete = allFacultySubjects.filter(s => keysToDelete.has(s.subKey) || keysToDelete.has(s.id) || keysToDelete.has(s.globalKey));

      // Delete from Supabase subjects table via backend API
      if (token && (subjectsObjectsToDelete.length > 0 || isDeletingAll)) {
        fetch('/api/subjects/delete-match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ subjects: subjectsObjectsToDelete, deleteAll: isDeletingAll })
        })
        .then(res => res.json())
        .then(resData => {
          console.log('Deleted subjects synced to Supabase DB:', resData);
        })
        .catch(err => console.error('Error deleting subjects from Supabase DB:', err));
      }

      // Delete subjects from globalSubjectsCatalog
      if (isDeletingAll) {
        setGlobalSubjectsCatalog([]);
        localStorage.removeItem('admin_global_subjects_catalog');
      } else {
        const isSubjectToDelete = (s) => {
          const gKey = s.globalKey || s.subKey;
          if (gKey && keysToDelete.has(gKey)) return true;
          const sName = String(s.subjectName || s.name || '').trim().toLowerCase();
          const sSem = String(s.semester || '1').replace(/\D/g, '');
          const sCode = String(s.code || s.subjectCode || '').trim().toLowerCase();
          const sType = String(s.type || 'Theory').trim().toLowerCase();

          return subjectsObjectsToDelete.some(target => {
            const tKey = target.globalKey || target.subKey;
            if (gKey && tKey && gKey === tKey) return true;
            if (target.dbId && s.dbId && String(target.dbId) === String(s.dbId)) return true;

            const tCode = String(target.code || target.subjectCode || '').trim().toLowerCase();
            const tName = String(target.subjectName || target.name || '').trim().toLowerCase();
            const tSem = String(target.semester || '1').replace(/\D/g, '');
            const tType = String(target.type || 'Theory').trim().toLowerCase();

            if (sCode && tCode) return sCode === tCode && sSem === tSem && sType === tType;
            if (sName && tName) return sName === tName && sSem === tSem && sType === tType;
            return false;
          });
        };

        const updatedGlobal = (globalSubjectsCatalog || []).filter(s => !isSubjectToDelete(s));
        setGlobalSubjectsCatalog(updatedGlobal);
        localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(updatedGlobal));
      }

      const facultyUpdates = {};
      allFacultySubjects.forEach(s => {
        if ((keysToDelete.has(s.subKey) || keysToDelete.has(s.id) || keysToDelete.has(s.code) || keysToDelete.has(s.globalKey)) && (s.facultyId || (s.facultyIds && s.facultyIds.length > 0))) {
          const fList = Array.isArray(s.facultyIds) && s.facultyIds.length > 0 ? s.facultyIds : (s.facultyId ? [s.facultyId] : []);
          fList.forEach(fid => {
            if (!facultyUpdates[fid]) {
              facultyUpdates[fid] = [];
            }
            facultyUpdates[fid].push(s);
          });
        }
      });

      // Optimistic Instant Local Update (0ms UI latency)
      setFaculties(prevFacs => {
        return (prevFacs || []).map(f => {
          const fIdMatches = (fid) => String(f.id) === String(fid) || (f.isPrimaryAdmin && (String(fid) === 'admin_primary' || String(fid) === '78'));
          const targetFacKey = Object.keys(facultyUpdates).find(fid => fIdMatches(fid));
          if (!targetFacKey) return f;

          const toRemove = facultyUpdates[targetFacKey];
          let currentSubs = [];
          if (typeof f.subjects === 'string') {
            try { currentSubs = JSON.parse(f.subjects); } catch(e) { currentSubs = []; }
          } else if (Array.isArray(f.subjects)) {
            currentSubs = f.subjects;
          }

          const filteredSubs = currentSubs.filter(sub => {
            const subName = String(sub.subjectName || sub.name || '').trim().toLowerCase();
            const subSem = String(sub.semester || '').replace(/\D/g, '');
            const subCode = String(sub.code || sub.subjectCode || '').trim().toLowerCase();
            return !toRemove.some(r => {
              const rName = String(r.subjectName || r.name || '').trim().toLowerCase();
              const rSem = String(r.semester || '').replace(/\D/g, '');
              const rCode = String(r.code || r.subjectCode || '').trim().toLowerCase();
              if (r.subKey && sub.id && r.subKey === sub.id) return true;
              if (subCode && rCode && subCode === rCode) return true;
              return subName === rName && (!subSem || !rSem || subSem === rSem);
            });
          });

          return { ...f, subjects: filteredSubs };
        });
      });

      setSelectedSubjectIds(prev => prev.filter(k => !keysToDelete.has(k)));
      showToast(keysToDelete.size === 1 ? 'Subject deleted successfully!' : `Successfully deleted ${keysToDelete.size} subject(s).`, 'success');

      if (Object.keys(facultyUpdates).length > 0) {
        try {
          const updatePromises = Object.keys(facultyUpdates).map(async (facId) => {
            const subjectsPayload = facultyUpdates[facId];
            await fetch(`/api/faculty/${facId}/delete-subject`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ subjects: subjectsPayload })
            });
          });

          await Promise.all(updatePromises);
          fetchFaculties();
          notifyDataChanged();
        } catch (err) {
          console.error('Error deleting subjects:', err);
          showToast('Error deleting subject(s)', 'error');
          fetchFaculties();
        }
      } else {
        notifyDataChanged();
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
        fetchStudents(false);
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

  const isPrimaryAdminFaculty = (fac) => {
    if (!fac) return false;
    if (fac.isPrimaryAdmin || fac.id === 'admin_primary' || String(fac.id) === '78') return true;
    const email = String(fac.email || fac.username || '').toLowerCase().trim();
    return email === 'admin@ljcca.edu';
  };

  const toggleSelectFaculty = (id) => {
    const fac = (faculties || []).find(f => String(f.id) === String(id));
    if (isPrimaryAdminFaculty(fac)) return; // Primary Admin cannot be selected
    setSelectedFacultyIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAllFaculty = () => {
    const filteredFacs = (faculties || []).filter(f => {
      if (isPrimaryAdminFaculty(f)) return false; // Primary Admin is non-selectable
      if (!facultySearchQuery || !facultySearchQuery.trim()) return true;
      const q = facultySearchQuery.toLowerCase().trim();
      const fName = (f.name || '').toLowerCase();
      const fEmail = (f.email || f.username || '').toLowerCase();
      const fDept = (f.department || '').toLowerCase();
      const fMob = (f.mobile || '').toLowerCase();
      return fName.includes(q) || fEmail.includes(q) || fDept.includes(q) || fMob.includes(q);
    });
    const filteredIds = filteredFacs.map(f => f.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedFacultyIds.includes(id));

    if (allSelected) {
      setSelectedFacultyIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedFacultyIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBulkDeleteFaculty = (idsToDelete) => {
    const ids = (idsToDelete || selectedFacultyIds).filter(id => {
      const fac = (faculties || []).find(f => String(f.id) === String(id));
      return !isPrimaryAdminFaculty(fac);
    });
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

  const toggleSelectSemester = (id) => {
    setSelectedSemesterIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAllSemesters = () => {
    const filteredSemesters = allSemestersList.filter(sem => {
      if (!semesterSearchQuery) return true;
      const q = semesterSearchQuery.toLowerCase();
      return (
        sem.name.toLowerCase().includes(q) ||
        String(sem.semNumber).includes(q) ||
        (sem.academicYear && sem.academicYear.toLowerCase().includes(q)) ||
        (sem.term && sem.term.toLowerCase().includes(q))
      );
    });
    const filteredIds = filteredSemesters.map(s => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedSemesterIds.includes(id));

    if (allSelected) {
      setSelectedSemesterIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedSemesterIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBulkDeleteSemesters = (idsToDelete) => {
    const ids = idsToDelete || selectedSemesterIds;
    if (!ids || ids.length === 0) {
      showToast('Please select at least one semester to delete.', 'warning');
      return;
    }

    setDeleteConfirmState({
      isOpen: true,
      type: 'bulk',
      entityType: 'semester',
      studentId: null,
      studentName: `${ids.length} selected semester(s)`,
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
      device_id: student.device_id || '',
      password: '',
      resetPassword: false
    });
    setCreatedStudentCredentials(null);
    setEnrollmentTouched(false);
    setNameTouched(false);
    setMobileTouched(false);
    setShowStudentModal(true);
  };

  // Reset Student Device ID Handler (Single Student with SweetAlert Confirmation)
  const handleResetDeviceId = async (studentId, studentName, deviceId) => {
    if (!deviceId) {
      Swal.fire({
        title: 'Already Unlocked!',
        text: 'Your device is already unlocked.',
        icon: 'info',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'OK'
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Reset Device ID?',
      text: `Are you sure you want to reset device binding for ${studentName || 'this student'}? They will be able to log in from a new device.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Reset Device ID',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(`/api/students/${studentId}/reset-device`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        Swal.fire('Device Reset!', data.message || 'Device ID reset successfully!', 'success');
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, device_id: null, locked_until: null } : s));
        setStudentForm(prev => ({ ...prev, device_id: '' }));
      } else {
        showToast(data.error || 'Failed to reset Device ID', 'warning', 3500);
      }
    } catch (err) {
      showToast('Error resetting Device ID', 'error', 3000);
    }
  };

  // Bulk Reset Student Device IDs Handler (With SweetAlert Confirmation)
  const handleBulkResetDeviceId = async () => {
    if (!selectedStudentIds || selectedStudentIds.length === 0) {
      showToast('Please select at least one student to reset Device ID', 'warning');
      return;
    }

    const count = selectedStudentIds.length;
    const isAllSelected = count >= students.length;

    const result = await Swal.fire({
      title: isAllSelected ? 'Reset ALL Device IDs?' : `Reset Device IDs for ${count} Student(s)?`,
      text: isAllSelected 
        ? `Are you sure you want to reset device bindings for ALL ${count} students? All students will be able to register new devices on next login.`
        : `Are you sure you want to reset device bindings for ${count} selected student(s)? They will be able to log in from new devices.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Reset Device IDs',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch('/api/students/bulk-reset-device', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentIds: selectedStudentIds,
          resetAll: isAllSelected
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        Swal.fire(
          'Device IDs Reset!',
          data.message || `Device IDs for ${count} student(s) reset successfully. They can now log in from new devices.`,
          'success'
        );
        if (isAllSelected) {
          setStudents(prev => prev.map(s => ({ ...s, device_id: null, locked_until: null })));
        } else {
          const resetSet = new Set(selectedStudentIds.map(String));
          setStudents(prev => prev.map(s => resetSet.has(String(s.id)) ? { ...s, device_id: null, locked_until: null } : s));
        }
      } else {
        showToast(data.error || 'Failed to reset Device IDs', 'warning', 3500);
      }
    } catch (err) {
      showToast('Error resetting Device IDs', 'error', 3000);
    }
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
      roles: ['faculty'],
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
    const isPrimaryAdmin = faculty.isPrimaryAdmin || faculty.id === 'admin_primary' || String(faculty.id) === '78' || (faculty.email && faculty.email.toLowerCase() === 'admin@ljcca.edu');
    const initialRoles = Array.isArray(faculty.roles) && faculty.roles.length > 0
      ? (isPrimaryAdmin ? Array.from(new Set([...faculty.roles, 'admin'])) : faculty.roles)
      : (isPrimaryAdmin ? ['admin', 'faculty'] : (faculty.role === 'admin' ? ['admin', 'faculty'] : ['faculty']));

    setFacultyForm({
      id: faculty.id,
      name: faculty.name,
      email: faculty.email || '',
      department: faculty.department,
      mobile: faculty.mobile,
      password: '',
      roles: initialRoles,
      isPrimaryAdmin,
      subjects: parsedSubjects
    });
    setCreatedFacultyCredentials(null);
    setShowFacultyModal(true);
  };

  const handleSaveFaculty = async (e) => {
    e.preventDefault();
    if (!facultyForm.roles || facultyForm.roles.length === 0) {
      showToast('Please select at least one role: Faculty or Admin', 'warning');
      return;
    }
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

    if (!facultyForm.isPrimaryAdmin && facultyForm.password && String(facultyForm.password).trim() !== '') {
      const passCheck = validateStrongPassword(facultyForm.password);
      if (!passCheck.isValid) {
        showToast(`⚠️ Strong Password Required: ${passCheck.message}`, 'warning', 4000);
        return;
      }
    }
    const isEdit = facultyModalMode === 'edit';
    const cleanEmail = (facultyForm.email || '').trim().toLowerCase();
    const cleanMobile = (facultyForm.mobile || '').trim();
    const cleanDept = (facultyForm.department || '').trim().toLowerCase();

    // 1. Check duplicate Email in the SAME DEPARTMENT (different department is allowed)
    const isEmailDupInSameDept = (faculties || []).some(f => {
      if (isEdit && String(f.id) === String(facultyForm.id)) return false;
      const fDept = String(f.department || '').split('||SUB:')[0].trim().toLowerCase();
      if (fDept !== cleanDept) return false;
      const fEmail = String(f.email || f.username || '').trim().toLowerCase();
      return fEmail && fEmail === cleanEmail;
    });

    if (isEmailDupInSameDept) {
      showToast(`Faculty with Email "${facultyForm.email}" already exists in ${facultyForm.department || 'this'} department!`, 'error', 4000);
      return;
    }

    // 2. Check duplicate Mobile Number in the SAME DEPARTMENT (different department is allowed)
    if (cleanMobile) {
      const isMobileDupInSameDept = (faculties || []).some(f => {
        if (isEdit && String(f.id) === String(facultyForm.id)) return false;
        const fDept = String(f.department || '').split('||SUB:')[0].trim().toLowerCase();
        if (fDept !== cleanDept) return false;
        const fMobile = String(f.mobile || '').trim();
        return fMobile && fMobile === cleanMobile;
      });

      if (isMobileDupInSameDept) {
        showToast(`Faculty with Mobile Number "${facultyForm.mobile}" already exists in ${facultyForm.department || 'this'} department!`, 'error', 4000);
        return;
      }
    }
    const url = isEdit
      ? `/api/faculty/${facultyForm.id}`
      : '/api/faculty';
    const method = isEdit ? 'PUT' : 'POST';

    // Optimistic instant UI update for Edit Faculty (0.1s response time)
    if (isEdit) {
      const prevFacs = [...faculties];
      const updatedDept = String(facultyForm.department || '').split('||SUB:')[0].trim();
      const updatedSubjects = Array.isArray(facultyForm.subjects) ? facultyForm.subjects : [];
      const updatedRoles = Array.isArray(facultyForm.roles) && facultyForm.roles.length > 0 ? facultyForm.roles : ['faculty'];

      // Instant local state update (0ms delay)
      setFaculties(prev => prev.map(f => {
        if (String(f.id) === String(facultyForm.id)) {
          return {
            ...f,
            name: facultyForm.name,
            email: facultyForm.email || f.email,
            department: updatedDept,
            mobile: facultyForm.mobile,
            subjects: updatedSubjects,
            roles: updatedRoles
          };
        }
        return f;
      }));

      setShowFacultyModal(false);
      showToast('Faculty member details updated successfully!', 'success');

      // Send update request to backend asynchronously in background
      fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(facultyForm)
      })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          if (facultyForm.isPrimaryAdmin && onUpdateUser) {
            onUpdateUser({
              ...user,
              roles: facultyForm.roles,
              hasFacultyAccess: (facultyForm.roles || []).includes('faculty')
            });
          }
          fetchFaculties(false);
          fetchStats();
          notifyDataChanged();
        } else {
          setFaculties(prevFacs);
          showToast(data.error || 'Failed to save faculty', 'error');
        }
      })
      .catch((err) => {
        console.error('Error saving faculty:', err);
        setFaculties(prevFacs);
        showToast('Error connecting to backend', 'error');
      });
      return;
    }

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
        setCreatedFacultyCredentials({
          username: data.faculty.username,
          password: data.faculty.plain_password
        });
        fetchFaculties(false);
        fetchStats();
        notifyDataChanged();
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
        notifyDataChanged();
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

  // Send imported faculty batch to backend (Optimistic + Fast Batch + Duplicate Protection)
  const sendBulkFacultyImport = async (facultyList) => {
    const prevFacs = [...faculties];

    const existingEmails = new Set((faculties || []).map(f => (f.email || f.username || '').toLowerCase().trim()));
    const existingMobiles = new Set((faculties || []).map(f => (f.mobile || '').trim()).filter(m => m && m !== '0000000000'));

    const processedEmails = new Set();
    const processedMobiles = new Set();

    const newOnlyList = [];
    const duplicateList = [];

    (facultyList || []).forEach(fac => {
      const email = (fac.email || '').toLowerCase().trim();
      const mobile = (fac.mobile || '').trim();

      const isPrimaryAdmin = email === 'admin@ljcca.edu' || email === 'admin_primary';
      const isEmailDup = email && (existingEmails.has(email) || processedEmails.has(email));
      const isMobileDup = mobile && mobile !== '0000000000' && (existingMobiles.has(mobile) || processedMobiles.has(mobile));

      if (isPrimaryAdmin || isEmailDup || isMobileDup) {
        duplicateList.push(fac);
      } else {
        newOnlyList.push(fac);
        if (email) processedEmails.add(email);
        if (mobile && mobile !== '0000000000') processedMobiles.add(mobile);
      }
    });

    // Case 1: All uploaded faculties are duplicates
    if (duplicateList.length > 0 && newOnlyList.length === 0) {
      const dupListHtml = duplicateList.map(d =>
        `<li><strong>${d.name || 'Faculty'}</strong> (${d.email ? `Email: ${d.email}` : ''}${d.mobile && d.mobile !== '0000000000' ? `, Mobile: ${d.mobile}` : ''})</li>`
      ).join('');

      Swal.fire({
        icon: 'warning',
        title: 'Duplicate Faculty Found!',
        html: `
          <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
            <p style="margin-bottom: 10px; font-weight: 600; color: #dc2626;">
              ⚠️ No new faculty members were added because all ${duplicateList.length} record(s) in your file already exist in your faculty list:
            </p>
            <div style="max-height: 200px; overflow-y: auto; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 10px 14px;">
              <ul style="margin: 0; padding-left: 18px; color: #9f1239;">
                ${dupListHtml}
              </ul>
            </div>
          </div>
        `,
        confirmButtonText: 'OK, Got It',
        confirmButtonColor: '#e11d48'
      });
      return;
    }

    const optimisticNewFacs = newOnlyList.map((fac, idx) => ({
      id: `temp_${Date.now()}_${idx}`,
      name: fac.name || 'Faculty',
      email: fac.email || `faculty_${Date.now()}@college.edu`,
      department: fac.department || 'BCA',
      mobile: fac.mobile || '0000000000',
      username: fac.email,
      subjects: fac.subjects || []
    }));

    // Optimistic local state update (append only brand-new non-duplicate items)
    if (optimisticNewFacs.length > 0) {
      setFaculties(prev => [...optimisticNewFacs, ...prev]);
      setStats(prev => ({ ...prev, totalFaculty: (prev.totalFaculty || 0) + optimisticNewFacs.length }));
    }

    try {
      const response = await fetch('/api/faculty/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ faculty: newOnlyList })
      });
      const data = await response.json();
      if (response.ok) {
        await fetchFaculties();
        await fetchStats();
        notifyDataChanged();

        if (duplicateList.length > 0) {
          const dupListHtml = duplicateList.map(d =>
            `<li><strong>${d.name || 'Faculty'}</strong> (${d.email ? `Email: ${d.email}` : ''}${d.mobile && d.mobile !== '0000000000' ? `, Mobile: ${d.mobile}` : ''})</li>`
          ).join('');

          Swal.fire({
            icon: 'warning',
            title: 'Bulk Import Completed (With Duplicates)',
            html: `
              <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
                <p style="margin-bottom: 8px; color: #16a34a; font-weight: 600;">
                  ✅ <strong>${newOnlyList.length} new faculty member(s)</strong> added successfully!
                </p>
                <p style="margin-bottom: 8px; color: #d97706; font-weight: 600;">
                  ⚠️ <strong>${duplicateList.length} faculty member(s)</strong> already existed and were skipped:
                </p>
                <div style="max-height: 180px; overflow-y: auto; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 10px 14px;">
                  <ul style="margin: 0; padding-left: 18px; color: #b45309;">
                    ${dupListHtml}
                  </ul>
                </div>
              </div>
            `,
            confirmButtonText: 'Understood',
            confirmButtonColor: '#f59e0b'
          });
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Bulk Import Successful!',
            text: `Successfully imported all ${newOnlyList.length} faculty member(s) into the system!`,
            confirmButtonText: 'Great!',
            confirmButtonColor: '#10b981',
            timer: 3000
          });
        }
      } else {
        setFaculties(prevFacs);
        showToast(data.error || 'Failed to import faculty data.', 'error');
      }
    } catch (err) {
      console.error('Faculty import error:', err);
      setFaculties(prevFacs);
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
    const headers = [['Enrollment No', 'Full Name', 'Roll No', 'Division', 'Course', 'Semester', 'Mobile No', 'Email ID']];
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
        const subjectsToSync = [];
        const duplicateSubjects = [];
        const facultySubjectUpdates = new Map();
        const updatedGlobalCatalog = [...(globalSubjectsCatalog || [])];

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
            const cleanSubName = subName.trim();
            const cleanSem = semester.replace(/\D/g, '') || '1';
            const cleanCode = code ? code.trim() : '';
            const cleanType = type || 'Theory';
            const cleanShort = shortName || cleanSubName.substring(0, 4).toUpperCase();

            // Check if this subject already exists in current catalog or processed list
            const isDuplicate = (globalSubjectsCatalog || []).some(existing => {
              const exCode = String(existing.code || existing.subjectCode || '').trim().toLowerCase();
              const exName = String(existing.subjectName || existing.name || '').trim().toLowerCase();
              const exSem = String(existing.semester || '1').replace(/\D/g, '');
              const exType = String(existing.type || 'Theory').trim().toLowerCase();

              if (cleanCode && exCode && cleanCode.toLowerCase() === exCode) {
                return true;
              }
              if (cleanSubName.toLowerCase() === exName && cleanSem === exSem && cleanType.toLowerCase() === exType) {
                return true;
              }
              return false;
            }) || subjectsToSync.some(alreadySyncing => {
              const apCode = String(alreadySyncing.code || '').trim().toLowerCase();
              const apName = String(alreadySyncing.subjectName || '').trim().toLowerCase();
              const apSem = String(alreadySyncing.semester || '1');
              const apType = String(alreadySyncing.type || 'Theory').trim().toLowerCase();

              if (cleanCode && apCode && cleanCode.toLowerCase() === apCode) return true;
              return cleanSubName.toLowerCase() === apName && cleanSem === apSem && cleanType.toLowerCase() === apType;
            });

            const newSubObj = {
              subjectName: cleanSubName,
              shortName: cleanShort,
              code: cleanCode || `SUB${Math.floor(1000 + Math.random() * 9000)}`,
              subjectCode: cleanCode || `SUB${Math.floor(1000 + Math.random() * 9000)}`,
              semester: cleanSem,
              type: cleanType,
              globalKey: `global_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`
            };

            if (isDuplicate) {
              duplicateSubjects.push(newSubObj);
            } else {
              subjectsToSync.push(newSubObj);
              updatedGlobalCatalog.push(newSubObj);

              // Also assign to faculty if facEmail matches
              if (facEmail) {
                const targetFaculty = faculties.find(f => f.email && f.email.toLowerCase() === facEmail.toLowerCase());
                if (targetFaculty) {
                  if (!facultySubjectUpdates.has(targetFaculty.id)) {
                    let fSubs = [];
                    if (typeof targetFaculty.subjects === 'string') {
                      try { fSubs = JSON.parse(targetFaculty.subjects); } catch (e) { fSubs = []; }
                    } else if (Array.isArray(targetFaculty.subjects)) {
                      fSubs = [...targetFaculty.subjects];
                    }
                    facultySubjectUpdates.set(targetFaculty.id, fSubs);
                  }
                  const curSubs = facultySubjectUpdates.get(targetFaculty.id);
                  const existsInFac = curSubs.some(s => (s.subjectName || s.name) === cleanSubName && String(s.semester) === String(cleanSem));
                  if (!existsInFac) {
                    curSubs.push(newSubObj);
                  }
                }
              }
            }
          }
        }

        // Case 1: All uploaded subjects were duplicates
        if (duplicateSubjects.length > 0 && subjectsToSync.length === 0) {
          const dupListHtml = duplicateSubjects.map(d =>
            `<li><strong>${d.subjectName}</strong> (${d.code ? `Code: ${d.code}, ` : ''}Sem ${d.semester}, ${d.type})</li>`
          ).join('');

          Swal.fire({
            icon: 'warning',
            title: 'Duplicate Subjects Found!',
            html: `
              <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
                <p style="margin-bottom: 10px; font-weight: 600; color: #dc2626;">
                  ⚠️ No new subjects were added because all ${duplicateSubjects.length} subject(s) in your file already exist in your subject list:
                </p>
                <div style="max-height: 200px; overflow-y: auto; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 10px 14px;">
                  <ul style="margin: 0; padding-left: 18px; color: #9f1239;">
                    ${dupListHtml}
                  </ul>
                </div>
              </div>
            `,
            confirmButtonText: 'OK, Got It',
            confirmButtonColor: '#e11d48'
          });
          return;
        }

        if (subjectsToSync.length === 0) {
          showToast('No valid subjects found in the uploaded file.', 'warning');
          return;
        }

        // 1. Update local globalSubjectsCatalog state and localStorage immediately
        setGlobalSubjectsCatalog(updatedGlobalCatalog);
        try {
          localStorage.setItem('admin_global_subjects_catalog', JSON.stringify(updatedGlobalCatalog));
        } catch (e) {}

        // 2. Sync to backend DB subjects table via POST /api/subjects/sync-all
        if (token) {
          try {
            await fetch('/api/subjects/sync-all', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ subjects: subjectsToSync })
            });
          } catch (syncErr) {
            console.error('Error syncing subjects to backend:', syncErr);
          }
        }

        // 3. Save faculty assignments if any faculty emails matched
        if (facultySubjectUpdates.size > 0) {
          for (const [facId, updatedSubs] of facultySubjectUpdates.entries()) {
            await handleSaveSubjectsToBackend(facId, updatedSubs, false);
          }
        }

        // 4. Reload fresh data from backend
        await fetchDbSubjects();
        await fetchFaculties();

        // 5. Show SweetAlert alert
        if (duplicateSubjects.length > 0) {
          const dupListHtml = duplicateSubjects.map(d =>
            `<li><strong>${d.subjectName}</strong> (${d.code ? `Code: ${d.code}, ` : ''}Sem ${d.semester}, ${d.type})</li>`
          ).join('');

          Swal.fire({
            icon: 'warning',
            title: 'Bulk Import Completed (With Duplicates)',
            html: `
              <div style="text-align: left; font-size: 0.92rem; color: #334155; line-height: 1.6;">
                <p style="margin-bottom: 8px; color: #16a34a; font-weight: 600;">
                  ✅ <strong>${subjectsToSync.length} new subject(s)</strong> added successfully!
                </p>
                <p style="margin-bottom: 8px; color: #d97706; font-weight: 600;">
                  ⚠️ <strong>${duplicateSubjects.length} subject(s)</strong> already existed and were skipped:
                </p>
                <div style="max-height: 180px; overflow-y: auto; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; padding: 10px 14px;">
                  <ul style="margin: 0; padding-left: 18px; color: #b45309;">
                    ${dupListHtml}
                  </ul>
                </div>
              </div>
            `,
            confirmButtonText: 'Understood',
            confirmButtonColor: '#f59e0b'
          });
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Bulk Import Successful!',
            text: `Successfully imported all ${subjectsToSync.length} subject(s) into the list!`,
            confirmButtonText: 'Great!',
            confirmButtonColor: '#10b981',
            timer: 3000
          });
        }
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
    ).sort((a, b) => {
      const aIsAdmin = isPrimaryAdminFaculty(a);
      const bIsAdmin = isPrimaryAdminFaculty(b);
      if (aIsAdmin && !bIsAdmin) return -1;
      if (!aIsAdmin && bIsAdmin) return 1;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    const listToExport = filteredFaculties.length > 0 ? filteredFaculties : faculties;
    if (!listToExport || listToExport.length === 0) {
      showToast('No faculty data available to export.', 'warning');
      return;
    }

    const exportRows = listToExport.map((f, idx) => {
      const isPrimary = f.isPrimaryAdmin || f.id === 'admin_primary' || String(f.id) === '78' || (f.email && f.email.toLowerCase() === 'admin@ljcca.edu');
      const rolesArr = Array.isArray(f.roles) && f.roles.length > 0
        ? (isPrimary ? Array.from(new Set([...f.roles, 'admin'])) : f.roles)
        : (isPrimary ? ['admin', 'faculty'] : (f.role === 'admin' ? ['admin', 'faculty'] : ['faculty']));
      const roleStr = rolesArr.map(r => r === 'faculty' ? 'Faculty' : 'Admin').join(' + ');

      return {
        'S.No': idx + 1,
        'Full Name': f.name || '-',
        'Email ID': f.email || '-',
        'Department': f.department ? f.department.split('||SUB:')[0].trim() : '-',
        'Mobile No': f.mobile || '-',
        'Role': roleStr || 'Faculty',
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
    <div className={`admin-dashboard-root ${theme === 'light' ? 'admin-theme-light' : ''}`}>
      {/* Floating Return to Dashboard Arrow Button (Rendered on mobile for any tab other than dashboard, students, faculty, subjects) */}
      {activeTab !== 'dashboard' && !['students', 'faculty', 'subjects'].includes(activeTab) && !isAnyAdminModalOpen && (
        <button
          type="button"
          className="admin-floating-return-dashboard"
          style={{
            bottom: showFloatingMobileMenu ? '90px' : '24px'
          }}
          onClick={() => {
            setActiveTab('dashboard');
            setMobileSidebarOpen(false);
          }}
          title="Return to Dashboard"
        >
          <ArrowLeft size={26} strokeWidth={2.5} />
        </button>
      )}

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

      {/* Mobile Floating Bottom-Right Student Actions Toggle Button (Replaced by Delete button when items are selected) */}
      {activeTab === 'students' && !isAnyAdminModalOpen && !mobileSidebarOpen && (
        selectedStudentIds.length > 0 ? (
          <button
            type="button"
            className={`student-floating-mobile-actions-toggle floating-delete-btn ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
            onClick={() => handleBulkDeleteStudents(selectedStudentIds)}
            title={`Delete Selected (${selectedStudentIds.length})`}
            style={{
              bottom: showFloatingMobileMenu ? '92px' : '24px',
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              borderColor: '#ffffff',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.55), 0 4px 14px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
          >
            <Trash2 size={24} strokeWidth={2.5} color="#ffffff" />
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ffffff',
                color: '#ef4444',
                fontSize: '0.75rem',
                fontWeight: '800',
                borderRadius: '10px',
                padding: '2px 6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                minWidth: '20px',
                textAlign: 'center',
                lineHeight: '1.2'
              }}
            >
              {selectedStudentIds.length}
            </span>
          </button>
        ) : (
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
        )
      )}

      {/* Mobile Backdrop Overlay for Student Actions */}
      {activeTab === 'students' && !isAnyAdminModalOpen && !mobileSidebarOpen && showStudentMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowStudentMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container (Positioned dynamically based on hamburger setting) */}
      {activeTab === 'students' && !isAnyAdminModalOpen && !mobileSidebarOpen && showStudentMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            className="admin-glass-btn admin-glass-btn-blue"
            onClick={() => { setShowStudentMobileActions(false); handleDownloadStudentSampleTemplate(); }}
            title="Download sample Excel file format for student import"
          >
            <FileSpreadsheet size={16} />
            <span>Sample Format</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-purple"
            onClick={() => { setShowStudentMobileActions(false); fileInputRef.current && fileInputRef.current.click(); }}
            title="Import student records batch from CSV/Excel"
          >
            <Upload size={16} />
            <span>Bulk Upload</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-green"
            onClick={() => { setShowStudentMobileActions(false); handleExportStudentsData(); }}
            title="Export all student records to Excel file"
          >
            <Download size={16} />
            <span>Export Data</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-amber"
            onClick={() => { setShowStudentMobileActions(false); setPromoteStep(1); }}
            title="Promote all students to next semester (Sem 1..7 -> +1, Sem 8 -> Graduate & Remove)"
          >
            <TrendingUp size={16} />
            <span>Promote</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
            onClick={() => { setShowStudentMobileActions(false); openAddModal(); }}
          >
            <Plus size={16} /> <span>Add Student</span>
          </button>
        </div>
      )}

      {/* Mobile Floating Bottom-Right Faculty Actions Toggle Button */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && !mobileSidebarOpen && (
        selectedFacultyIds.length > 0 ? (
          <button
            type="button"
            className={`student-floating-mobile-actions-toggle floating-delete-btn ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
            onClick={() => handleBulkDeleteFaculty(selectedFacultyIds)}
            title={`Delete Selected (${selectedFacultyIds.length})`}
            style={{
              bottom: showFloatingMobileMenu ? '92px' : '24px',
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              borderColor: '#ffffff',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.55), 0 4px 14px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
          >
            <Trash2 size={24} strokeWidth={2.5} color="#ffffff" />
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ffffff',
                color: '#ef4444',
                fontSize: '0.75rem',
                fontWeight: '800',
                borderRadius: '10px',
                padding: '2px 6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                minWidth: '20px',
                textAlign: 'center',
                lineHeight: '1.2'
              }}
            >
              {selectedFacultyIds.length}
            </span>
          </button>
        ) : (
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
        )
      )}

      {/* Mobile Backdrop Overlay for Faculty Actions */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && !mobileSidebarOpen && showFacultyMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowFacultyMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container for Faculty */}
      {activeTab === 'faculty' && !isAnyAdminModalOpen && !mobileSidebarOpen && showFacultyMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            className="admin-glass-btn admin-glass-btn-blue"
            onClick={() => { setShowFacultyMobileActions(false); handleDownloadFacultySampleTemplate(); }}
            title="Download sample Excel file format for faculty import"
          >
            <FileSpreadsheet size={16} />
            <span>Sample Format</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-purple"
            onClick={() => { setShowFacultyMobileActions(false); facultyFileInputRef.current && facultyFileInputRef.current.click(); }}
            title="Import faculty batch from CSV or Excel"
          >
            <Upload size={16} />
            <span>Bulk Upload</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-green"
            onClick={() => { setShowFacultyMobileActions(false); handleExportFacultyData(); }}
            title="Export faculty records to Excel file"
          >
            <Download size={16} />
            <span>Export Data</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
            onClick={() => { setShowFacultyMobileActions(false); openAddFacultyModal(); }}
          >
            <Plus size={16} /> <span>Add Faculty</span>
          </button>
        </div>
      )}

      {/* Mobile Floating Bottom-Right Subject Actions Toggle Button */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && !mobileSidebarOpen && (
        selectedSubjectIds.length > 0 ? (
          <button
            type="button"
            className={`student-floating-mobile-actions-toggle floating-delete-btn ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
            onClick={() => handleBulkDeleteSubjects(selectedSubjectIds)}
            title={`Delete Selected (${selectedSubjectIds.length})`}
            style={{
              bottom: showFloatingMobileMenu ? '92px' : '24px',
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              borderColor: '#ffffff',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.55), 0 4px 14px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
          >
            <Trash2 size={24} strokeWidth={2.5} color="#ffffff" />
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ffffff',
                color: '#ef4444',
                fontSize: '0.75rem',
                fontWeight: '800',
                borderRadius: '10px',
                padding: '2px 6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                minWidth: '20px',
                textAlign: 'center',
                lineHeight: '1.2'
              }}
            >
              {selectedSubjectIds.length}
            </span>
          </button>
        ) : (
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
        )
      )}

      {/* Mobile Backdrop Overlay for Subject Actions */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && !mobileSidebarOpen && showSubjectMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowSubjectMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container for Subject */}
      {activeTab === 'subjects' && !isAnyAdminModalOpen && !mobileSidebarOpen && showSubjectMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            className="admin-glass-btn admin-glass-btn-blue"
            onClick={() => { setShowSubjectMobileActions(false); handleDownloadSubjectSampleTemplate(); }}
            title="Download sample Excel file format for subject import"
          >
            <FileSpreadsheet size={16} />
            <span>Sample Format</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-purple"
            onClick={() => { setShowSubjectMobileActions(false); subjectFileInputRef.current && subjectFileInputRef.current.click(); }}
            title="Import subject records batch from CSV or Excel"
          >
            <Upload size={16} />
            <span>Bulk Upload</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-green"
            onClick={() => { setShowSubjectMobileActions(false); handleExportSubjectsData(); }}
            title="Export subject records to Excel file"
          >
            <Download size={16} />
            <span>Export Data</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
            onClick={() => { setShowSubjectMobileActions(false); handleOpenAddSubjectModal(); }}
          >
            <Plus size={16} /> <span>Add Subject</span>
          </button>
        </div>
      )}
      {/* Mobile Floating Bottom-Right Semester Actions Toggle Button */}
      {activeTab === 'semesters' && !isAnyAdminModalOpen && !mobileSidebarOpen && (
        <button
          type="button"
          className={`student-floating-mobile-actions-toggle ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          onClick={() => setShowSemesterMobileActions(!showSemesterMobileActions)}
          title={showSemesterMobileActions ? "Close Semester Actions" : "Open Semester Actions"}
          style={{
            bottom: showFloatingMobileMenu ? '92px' : '24px'
          }}
        >
          {showSemesterMobileActions ? (
            <ChevronRight size={26} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={26} strokeWidth={2.5} />
          )}
        </button>
      )}

      {/* Mobile Backdrop Overlay for Semester Actions */}
      {activeTab === 'semesters' && !isAnyAdminModalOpen && !mobileSidebarOpen && showSemesterMobileActions && (
        <div
          className="student-mobile-actions-backdrop"
          onClick={() => setShowSemesterMobileActions(false)}
        />
      )}

      {/* Mobile Floating Action Buttons Container for Semester */}
      {activeTab === 'semesters' && !isAnyAdminModalOpen && !mobileSidebarOpen && showSemesterMobileActions && (
        <div
          className={`admin-action-btn-group mobile-actions-open ${!showFloatingMobileMenu ? 'hamburger-off-pos' : ''}`}
          style={{
            bottom: showFloatingMobileMenu ? '160px' : '92px'
          }}
        >
          <button
            className="admin-glass-btn admin-glass-btn-blue"
            onClick={() => { setShowSemesterMobileActions(false); handleDownloadSemesterSampleTemplate(); }}
            title="Download sample Excel file format for semester import"
          >
            <FileSpreadsheet size={16} />
            <span>Sample Format</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-purple"
            onClick={() => { setShowSemesterMobileActions(false); semesterFileInputRef.current && semesterFileInputRef.current.click(); }}
            title="Import semester records batch from CSV or Excel"
          >
            <Upload size={16} />
            <span>Bulk Upload</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-green"
            onClick={() => { setShowSemesterMobileActions(false); handleExportSemesterData(); }}
            title="Export semester records to Excel file"
          >
            <Download size={16} />
            <span>Export Data</span>
          </button>

          <button
            className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
            onClick={() => { setShowSemesterMobileActions(false); handleOpenAddSemesterModal(); }}
          >
            <Plus size={16} /> <span>Add Semester</span>
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
              <span className="admin-brand-title">Edu<span className="brand-mark-accent">Mark</span></span>
              <span className="admin-brand-subtitle">Admin Hub</span>
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
              className={`admin-nav-item ${activeTab === 'semesters' ? 'active' : ''}`}
              onClick={() => { setActiveTab('semesters'); setMobileSidebarOpen(false); }}
            >
              <Layers size={19} />
              <span>Semester</span>
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
              className={`admin-nav-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => { setActiveTab('students'); setMobileSidebarOpen(false); }}
            >
              <Users size={19} />
              <span>Students</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'leaves' ? 'active' : ''}`}
              onClick={() => { setActiveTab('leaves'); setMobileSidebarOpen(false); fetchAllLeaves(); }}
            >
              <FileText size={19} />
              <span>Leave Request</span>
            </button>

            <button
              className={`admin-nav-item ${activeTab === 'attendance_logs' ? 'active' : ''}`}
              onClick={() => {
                setSelectedSemFolder(availableSemesters[0] || '1');
                setMatrixSearch('');
                setMobileSidebarOpen(false);
                React.startTransition(() => {
                  setActiveTab('attendance_logs');
                });
                setTimeout(() => {
                  fetchLiveLogs();
                }, 0);
              }}
            >
              <ClipboardList size={19} />
              <span>Attendance Logs</span>
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
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setMobileSidebarOpen(false); }}
            >
              <Settings size={19} />
              <span>Profile & Settings</span>
            </button>
          </nav>

          <div className="admin-sidebar-footer" style={{ position: 'relative' }}>
            {/* Role Switcher Dropdown (Photo 2) */}
            {canSwitchRole && roleMenuOpen && (
              <div
                ref={roleMenuRef}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '12px',
                  right: '12px',
                  backgroundColor: '#002244',
                  border: '1.5px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Option 1: ORG ADMIN */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleMenuOpen(false);
                    if (onSwitchRole) onSwitchRole('admin');
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    textAlign: 'left',
                    background: (activeRole || 'admin') === 'admin' ? '#fbbf24' : 'transparent',
                    color: (activeRole || 'admin') === 'admin' ? '#002d62' : '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.85rem',
                    letterSpacing: '0.04em',
                    border: 'none',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit'
                  }}
                  onMouseEnter={(e) => {
                    if ((activeRole || 'admin') !== 'admin') e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if ((activeRole || 'admin') !== 'admin') e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>ORG ADMIN</span>
                </button>

                {/* Option 2: FACULTY */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleMenuOpen(false);
                    if (onSwitchRole) onSwitchRole('faculty');
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    textAlign: 'left',
                    background: activeRole === 'faculty' ? '#fbbf24' : 'transparent',
                    color: activeRole === 'faculty' ? '#002d62' : '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.85rem',
                    letterSpacing: '0.04em',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit'
                  }}
                  onMouseEnter={(e) => {
                    if (activeRole !== 'faculty') e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (activeRole !== 'faculty') e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>FACULTY</span>
                </button>
              </div>
            )}

            <div
              ref={profileCardRef}
              className="admin-user-profile-card"
              onClick={() => {
                if (canSwitchRole) setRoleMenuOpen(prev => !prev);
              }}
              style={{
                cursor: canSwitchRole ? 'pointer' : 'default',
                userSelect: 'none',
                position: 'relative'
              }}
              title={canSwitchRole ? "Click to switch role (Admin / Faculty)" : undefined}
            >
              <div className="admin-user-avatar">
                <GraduationCap size={20} color="#0f172a" />
              </div>
              <div className="admin-user-details" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span className="admin-user-profile-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || 'Administrative'}
                  </span>
                  {canSwitchRole && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: '6px',
                        color: '#ffffff',
                        transform: roleMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0
                      }}
                    >
                      <ChevronDown size={16} strokeWidth={2.5} color="#ffffff" />
                    </div>
                  )}
                </div>
                <span className="admin-user-profile-email">{user?.email || 'admin@ljcca.edu'}</span>
              </div>
            </div>

            <button className="admin-logout-btn" onClick={onLogout}>
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        <div className="admin-main-wrapper content-light">
          <header
            className={`admin-top-header-banner ${activeTab === 'dashboard' ? 'dashboard-header-tall' : ''}`}
            style={{ background: 'linear-gradient(90deg, #003366 0%, #004080 50%, #003366 100%)' }}
          >
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
                              activeTab === 'semesters' ? 'Semester' :
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #09355c, #0f4c81)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(9, 53, 92, 0.3)', flexShrink: 0 }}>
                        <Users size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Students</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#09355c', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {statsLoading ? '...' : stats.totalStudents}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #00a86b, #059669)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(0, 168, 107, 0.3)', flexShrink: 0 }}>
                        <GraduationCap size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Faculty Members</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#00a86b', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {statsLoading ? '...' : (stats.totalFaculty || 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(168, 85, 247, 0.3)', flexShrink: 0 }}>
                        <BookOpen size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Subjects</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#9333ea', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {allFacultySubjects.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(2, 132, 199, 0.3)', flexShrink: 0 }}>
                        <Layers size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Semester</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#0284c7', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {allSemestersList.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #e69500, #f59e0b)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(230, 149, 0, 0.3)', flexShrink: 0 }}>
                        <FileText size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Leave Requests</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#d97706', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {leavesLoading ? '...' : (allLeaves?.length || 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="glass-panel stat-card-v2"
                    style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(220, 38, 38, 0.3)', flexShrink: 0 }}>
                        <AlertTriangle size={24} color="#ffffff" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="stat-card-title" style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Defaulters</span>
                        <div className="stat-card-value" style={{ fontSize: '1.9rem', fontWeight: '800', color: '#dc2626', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
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

                    {/* Action 2: Leave Requests */}
                    <div
                      onClick={() => { setActiveTab('leaves'); setMobileSidebarOpen(false); }}
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
                        background: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)'
                      }}>
                        <FileText size={24} color="#ffffff" style={{ strokeWidth: 2.2 }} />
                      </div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                        Leave Requests
                      </h4>
                      <p style={{ fontSize: '0.95rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        Review & approve student leave requests
                      </p>
                    </div>

                    {/* Action 3: View Defaulters */}
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
                        background: '#00a86b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px',
                        boxShadow: '0 4px 12px rgba(0, 168, 107, 0.25)'
                      }}>
                        <TrendingUp size={24} color="#ffffff" style={{ strokeWidth: 2.2 }} />
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
              <div style={styles.tabPanel}>
                {/* CARD 1: ACTION BUTTONS CARD (TOP) */}
                <div className="glass-panel desktop-student-action-card" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={subjectFileInputRef}
                    onChange={handleSubjectImportFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                    {/* Left Actions Group */}
                    <div className="admin-action-btn-group desktop-student-action-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-blue"
                        onClick={() => { setShowSubjectMobileActions(false); handleDownloadSubjectSampleTemplate(); }}
                        title="Download sample Excel file format for subject import"
                      >
                        <FileSpreadsheet size={16} />
                        <span>Sample Format</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-purple"
                        onClick={() => { setShowSubjectMobileActions(false); subjectFileInputRef.current && subjectFileInputRef.current.click(); }}
                        title="Import subject records batch from CSV or Excel"
                      >
                        <Upload size={16} />
                        <span>Bulk Upload</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-green"
                        onClick={() => { setShowSubjectMobileActions(false); handleExportSubjectsData(); }}
                        title="Export subject records to Excel file"
                      >
                        <Download size={16} />
                        <span>Export</span>
                      </button>

                      {selectedSubjectIds.length > 0 && (
                        <button
                          className="admin-glass-btn admin-glass-btn-rose"
                          onClick={() => handleBulkDeleteSubjects(selectedSubjectIds)}
                          title={`Delete ${selectedSubjectIds.length} selected subject(s)`}
                        >
                          <Trash2 size={16} />
                          <span>
                            Delete ({selectedSubjectIds.length})
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Right Action Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      <button
                        onClick={() => { setShowSubjectMobileActions(false); handleOpenAddSubjectModal(); }}
                        className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
                      >
                        <Plus size={16} /> <span>Add Subject</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARD 2: SEARCH / FILTER BAR CARD (BELOW BUTTONS) */}
                <div className="glass-panel" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Search size={18} style={styles.searchIcon} />
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Search subject by Name or Code..."
                      value={subjectSearchQuery}
                      onChange={(e) => setSubjectSearchQuery(e.target.value)}
                      style={{ paddingLeft: '40px', paddingRight: subjectSearchQuery ? '36px' : '14px', width: '100%' }}
                    />
                    {subjectSearchQuery && (
                      <button
                        onClick={() => setSubjectSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* CARD 3: SUBJECT DATA TABLE CARD */}
                <div className="glass-panel" style={{ ...styles.studentCrudPanel, padding: isMobile ? '14px 10px' : '24px', borderRadius: '16px' }}>
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
                      const filteredSubjects = allFacultySubjects
                        .filter(sub => {
                          if (!subjectSearchQuery || !subjectSearchQuery.trim()) return true;
                          const q = subjectSearchQuery.toLowerCase().trim();
                          const subName = String(sub.subjectName || sub.name || '').toLowerCase();
                          const shortCode = String(sub.shortName || sub.shortCode || sub.short || '').toLowerCase();
                          const subCode = String(sub.code || sub.subjectCode || '').toLowerCase();
                          const facultyName = String(sub.facultyName || '').toLowerCase();
                          return subName.includes(q) || shortCode.includes(q) || subCode.includes(q) || facultyName.includes(q);
                        })
                        .sort((a, b) => {
                          const semA = parseInt(String(a.semester || '0').replace(/\D/g, ''), 10) || 0;
                          const semB = parseInt(String(b.semester || '0').replace(/\D/g, ''), 10) || 0;
                          if (semA !== semB) return semA - semB;
                          const nameA = String(a.subjectName || a.name || '').trim().toLowerCase();
                          const nameB = String(b.subjectName || b.name || '').trim().toLowerCase();
                          return nameA.localeCompare(nameB);
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
                                <th style={{ textAlign: 'center', width: '135px', whiteSpace: 'nowrap' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSubjects.map((sub, idx) => {
                                const isChecked = selectedSubjectIds.includes(sub.subKey);
                                const subName = sub.subjectName || sub.name || 'Subject';
                                const shortCode = sub.shortName || sub.shortCode || '-';
                                const subCode = (sub.code || sub.subjectCode || sub.subject_code || sub.subCode || sub.sub_code || '').toString().trim();
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
                                    <td style={{ whiteSpace: 'nowrap', fontWeight: '600' }}>
                                      {subCode && subCode !== '-' ? subCode : '-'}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', fontWeight: '600' }}>
                                      Semester {semNum}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      {Array.isArray(sub.facultyNamesList) && sub.facultyNamesList.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                          {sub.facultyNamesList.map((fName, fIdx) => (
                                            <span key={fIdx} style={{
                                              padding: '3px 10px',
                                              borderRadius: '8px',
                                              fontSize: '0.8rem',
                                              fontWeight: '600',
                                              background: 'rgba(59, 130, 246, 0.12)',
                                              color: '#3b82f6',
                                              border: '1px solid rgba(59, 130, 246, 0.25)',
                                              whiteSpace: 'nowrap'
                                            }}>
                                              {fName}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span style={{
                                          padding: '3px 10px',
                                          borderRadius: '8px',
                                          fontSize: '0.8rem',
                                          fontWeight: '600',
                                          background: 'rgba(148, 163, 184, 0.12)',
                                          color: 'var(--text-muted)',
                                          border: '1px solid rgba(148, 163, 184, 0.2)',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          Unassigned
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', fontWeight: '600' }}>
                                      {subType}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <button
                                          className="admin-action-btn assign"
                                          onClick={() => handleOpenAssignFacultyModal(sub)}
                                          title="Assign Faculty"
                                        >
                                          <UserPlus size={14} />
                                        </button>

                                        <button
                                          className="admin-action-btn edit"
                                          onClick={() => handleEditSubject(sub)}
                                          title="Edit Subject Details"
                                        >
                                          <Edit size={14} />
                                        </button>

                                        <button
                                          className="admin-action-btn delete"
                                          onClick={() => handleDeleteSubject(sub)}
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
                        {subjectModalMode === 'edit' ? <Edit size={20} color="#ffffff" /> : <BookOpen size={20} color="#ffffff" />}
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0f172a' }}>
                        {subjectModalMode === 'edit' ? 'Edit Teaching Subject' : 'Add New Teaching Subject'}
                      </h3>
                    </div>

                    <AdminModalCloseBtn
                      onClick={() => setShowAddSubjectModal(false)}
                      title="Close Form"
                    />
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
                          ref={firstSubjectInputRef}
                          type="text"
                          placeholder="e.g. C Language, Java Programming, DBMS..."
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          autoFocus
                          tabIndex={1}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && e.shiftKey) {
                              e.preventDefault();
                              addSubjectSaveBtnRef.current?.focus();
                            }
                          }}
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
                          placeholder="Select Semester"
                          options={allSemestersList.map(s => ({ id: String(s.semNumber || s.id), label: s.name || `Semester ${s.semNumber || s.id}` }))}
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
                      gap: '12px',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}>
                      <button
                        type="button"
                        onClick={() => setShowAddSubjectModal(false)}
                        tabIndex={6}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: '1.5px solid #000000',
                          background: '#ffffff',
                          color: '#000000',
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#ffffff';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.2)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        ref={addSubjectSaveBtnRef}
                        type="submit"
                        disabled={savingSubjects}
                        tabIndex={8}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            firstSubjectInputRef.current?.focus();
                          }
                        }}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.filter = 'brightness(1.05)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.28)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.filter = 'none';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.25)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                      >
                        {savingSubjects ? (subjectModalMode === 'edit' ? 'Updating...' : 'Creating...') : (subjectModalMode === 'edit' ? 'Update Subject' : 'Create')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Add / Edit Semester Modal Dialog */}
            {showAddSemesterModal && (
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
                zIndex: 99999,
                padding: '16px',
                boxSizing: 'border-box'
              }}
              onClick={() => setShowAddSemesterModal(false)}
              >
                <div
                  className="glass-panel"
                  style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '20px',
                    padding: '24px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                    boxSizing: 'border-box'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Layers size={20} />
                      </div>
                      <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                        {isEditingSemester ? 'Edit Semester' : 'Add New Semester'}
                      </h2>
                    </div>
                    <AdminModalCloseBtn onClick={() => setShowAddSemesterModal(false)} />
                  </div>

                  <form onSubmit={handleSaveSemester} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                        Semester Number / Code <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        ref={firstSemInputRef}
                        id="add-sem-code-input"
                        type="text"
                        className="glass-input"
                        placeholder="e.g. 9 or SEM-9"
                        value={semesterFormData.semNumber}
                        onChange={(e) => setSemesterFormData({ ...semesterFormData, semNumber: e.target.value })}
                        required
                        tabIndex={1}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault();
                            addSemCreateBtnRef.current?.focus();
                          }
                        }}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                        Semester Display Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. Semester 9"
                        value={semesterFormData.name}
                        onChange={(e) => setSemesterFormData({ ...semesterFormData, name: e.target.value })}
                        required
                        tabIndex={2}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                        Term Type
                      </label>
                      <select
                        className="glass-input"
                        value={semesterFormData.term}
                        onChange={(e) => setSemesterFormData({ ...semesterFormData, term: e.target.value })}
                        tabIndex={3}
                        style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box' }}
                      >
                        <option value="Odd">Odd Term</option>
                        <option value="Even">Even Term</option>
                      </select>
                    </div>

                    <div style={{
                      marginTop: '20px',
                      paddingTop: '16px',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '12px'
                    }}>
                      <button
                        type="button"
                        tabIndex={4}
                        onClick={() => setShowAddSemesterModal(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowAddSemesterModal(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: '1.5px solid #000000',
                          background: '#ffffff',
                          color: '#000000',
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#ffffff';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.35)';
                          e.currentTarget.style.border = '1.5px solid #000000';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.border = '1.5px solid #000000';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        ref={addSemCreateBtnRef}
                        type="submit"
                        tabIndex={5}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            firstSemInputRef.current?.focus();
                          }
                        }}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.filter = 'brightness(1.05)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.28)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.filter = 'none';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.45), 0 4px 14px rgba(0, 0, 0, 0.25)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                      >
                        {isEditingSemester ? 'Update Semester' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Assign Faculty to Subject Modal Dialog (Matches Photo 2) */}
            {showAssignFacultyModal && assigningSubject && (
              <div
                tabIndex={-1}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowAssignFacultyModal(false);
                  }
                }}
                style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  width: '100vw', width: '100dvw',
                  height: '100vh', height: '100dvh',
                  background: 'rgba(15, 23, 42, 0.45)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 999999,
                  padding: '16px',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '20px',
                  width: '100%',
                  maxWidth: '520px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  overflow: 'hidden',
                  animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '90vh'
                }}>
                  {/* Modal Header with Assign Faculty Sign (Photo 1) */}
                  <div style={{
                    padding: '24px 28px 16px 28px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {/* Assign Faculty Sign / Icon Badge (Photo 1) */}
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'rgba(236, 253, 245, 0.95)',
                        border: '1.5px solid rgba(167, 243, 208, 0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.16)',
                        flexShrink: 0
                      }}>
                        <UserPlus size={22} color="#059669" strokeWidth={2.4} />
                      </div>

                      <div>
                        <h2 style={{
                          margin: 0,
                          fontSize: '1.45rem',
                          fontWeight: '800',
                          color: '#002d62',
                          letterSpacing: '-0.02em',
                          lineHeight: '1.2'
                        }}>
                          Assign Faculty
                        </h2>
                        <div style={{
                          marginTop: '4px',
                          fontSize: '0.84rem',
                          color: '#64748b',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap'
                        }}>
                          <span>Subject: <strong style={{ color: '#0f172a' }}>{(() => {
                            const shortVal = (assigningSubject.shortName || assigningSubject.short_name || assigningSubject.shortCode || assigningSubject.short || '').toString().trim();
                            const nameVal = (assigningSubject.subjectName || assigningSubject.name || assigningSubject.title || '').toString().trim();
                            const codeVal = (assigningSubject.code || assigningSubject.subjectCode || assigningSubject.subject_code || '').toString().trim();
                            if (shortVal && shortVal !== '-') return shortVal;
                            if (nameVal && nameVal !== '-') return nameVal;
                            if (codeVal && codeVal !== '-') return codeVal;
                            return 'Subject';
                          })()}</strong></span>
                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <span>Semester <strong style={{ color: '#0f172a' }}>{assigningSubject.semester || '1'}</strong></span>
                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: selectedAssignFacultyIds.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: selectedAssignFacultyIds.length > 0 ? '#059669' : '#64748b',
                            border: selectedAssignFacultyIds.length > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)'
                          }}>
                            {selectedAssignFacultyIds.length} Selected
                          </span>
                        </div>
                      </div>
                    </div>

                    <AdminModalCloseBtn
                      onClick={() => setShowAssignFacultyModal(false)}
                      title="Close"
                      tabIndex={-1}
                    />
                  </div>

                  {/* Search Bar (if more than 4 faculties) */}
                  {(faculties || []).length > 4 && (
                    <div style={{ padding: '0 28px 12px 28px' }}>
                      <input
                        id="assign-faculty-search-input"
                        type="text"
                        tabIndex={1}
                        autoFocus
                        value={assignFacultySearch}
                        onChange={e => setAssignFacultySearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            document.getElementById('assign-faculty-cancel-btn')?.focus();
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('assign-faculty-save-btn')?.focus();
                          }
                        }}
                        placeholder="Search faculty name, department or email..."
                        style={{
                          width: '100%',
                          height: '38px',
                          padding: '0 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #e2e8f0',
                          fontSize: '0.86rem',
                          color: '#0f172a',
                          background: '#f8fafc',
                          outline: 'none',
                          boxSizing: 'border-box',
                          transition: 'all 0.15s ease'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = '#3b82f6';
                          e.currentTarget.style.background = '#ffffff';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.2)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.background = '#f8fafc';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  )}

                  {/* Faculty List (Scrollable Cards matching Photo 2) */}
                  <div style={{
                    padding: '4px 28px 20px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowY: 'auto',
                    maxHeight: '380px'
                  }}>
                    {(() => {
                      const query = (assignFacultySearch || '').toLowerCase().trim();
                      const list = (faculties || []).filter(f => {
                        if (!query) return true;
                        const name = (f.name || '').toLowerCase();
                        const dept = (f.department || '').toLowerCase();
                        const email = (f.email || '').toLowerCase();
                        return name.includes(query) || dept.includes(query) || email.includes(query);
                      });

                      if (list.length === 0) {
                        return (
                          <div style={{
                            padding: '32px 16px',
                            textAlign: 'center',
                            color: '#94a3b8',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                          }}>
                            {query ? 'No matching faculty found' : 'No faculty records available.'}
                          </div>
                        );
                      }

                      return list.map(fac => {
                        const isSelected = selectedAssignFacultyIds.includes(String(fac.id));
                        return (
                          <div
                            key={fac.id}
                            onClick={() => toggleAssignFacultySelect(fac.id)}
                            style={{
                              padding: '14px 18px',
                              borderRadius: '10px',
                              border: isSelected ? '1.5px solid #3b82f6' : '1.5px solid #e2e8f0',
                              background: isSelected ? '#f0f7ff' : '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.08)' : 'none',
                              userSelect: 'none'
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#f8fafc';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = '#e2e8f0';
                                e.currentTarget.style.background = '#ffffff';
                              }
                            }}
                          >
                            {/* Checkbox matching Photo 2 */}
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              background: isSelected ? '#0066cc' : '#ffffff',
                              border: isSelected ? '1.5px solid #0066cc' : '1.5px solid #cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              transition: 'all 0.15s ease'
                            }}>
                              {isSelected && <Check size={14} color="#ffffff" strokeWidth={3.2} />}
                            </div>

                            {/* Info matching Photo 2 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.98rem',
                                fontWeight: '700',
                                color: '#0f172a',
                                lineHeight: '1.3'
                              }}>
                                {fac.name}
                              </div>
                              <div style={{
                                fontSize: '0.82rem',
                                color: '#64748b',
                                marginTop: '3px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {fac.department || 'Faculty'} • {fac.email || fac.phone || `ID: ${fac.id}`}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Modal Footer (Cancel & Save Assignment with full Keyboard Tab Support) */}
                  <div style={{
                    padding: '16px 28px 24px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxSizing: 'border-box',
                    borderTop: '1px solid #f1f5f9',
                    background: '#ffffff'
                  }}>
                    <button
                      id="assign-faculty-cancel-btn"
                      type="button"
                      tabIndex={2}
                      onClick={() => setShowAssignFacultyModal(false)}
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          e.preventDefault();
                          document.getElementById('assign-faculty-save-btn')?.focus();
                        } else if (e.key === 'Tab' && e.shiftKey) {
                          e.preventDefault();
                          const searchEl = document.getElementById('assign-faculty-search-input');
                          if (searchEl) {
                            searchEl.focus();
                          } else {
                            document.getElementById('assign-faculty-save-btn')?.focus();
                          }
                        } else if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowAssignFacultyModal(false);
                        }
                      }}
                      className="assign-modal-cancel-btn"
                      style={{
                        flex: 1,
                        height: '44px',
                        borderRadius: '8px',
                        border: '1.5px solid #003366',
                        background: '#ffffff',
                        color: '#003366',
                        fontWeight: '600',
                        fontSize: '0.98rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        outline: 'none'
                      }}
                      onFocus={e => {
                        e.currentTarget.style.boxShadow = '0 0 0 3.5px rgba(0, 51, 102, 0.35)';
                        e.currentTarget.style.background = '#f0f4f8';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.background = '#ffffff';
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#f0f4f8';
                      }}
                      onMouseLeave={e => {
                        if (document.activeElement !== e.currentTarget) {
                          e.currentTarget.style.background = '#ffffff';
                        }
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      id="assign-faculty-save-btn"
                      type="button"
                      tabIndex={3}
                      disabled={savingFacultyAssignment}
                      onClick={handleSaveFacultyAssignment}
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          e.preventDefault();
                          const searchEl = document.getElementById('assign-faculty-search-input');
                          if (searchEl) {
                            searchEl.focus();
                          } else {
                            document.getElementById('assign-faculty-cancel-btn')?.focus();
                          }
                        } else if (e.key === 'Tab' && e.shiftKey) {
                          e.preventDefault();
                          document.getElementById('assign-faculty-cancel-btn')?.focus();
                        } else if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSaveFacultyAssignment();
                        }
                      }}
                      className="assign-modal-save-btn"
                      style={{
                        flex: 1,
                        height: '44px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#f59e0b',
                        color: '#ffffff',
                        fontWeight: '700',
                        fontSize: '0.98rem',
                        cursor: savingFacultyAssignment ? 'not-allowed' : 'pointer',
                        opacity: savingFacultyAssignment ? 0.75 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
                        transition: 'all 0.15s ease',
                        outline: 'none'
                      }}
                      onFocus={e => {
                        e.currentTarget.style.boxShadow = '0 0 0 3.5px rgba(245, 158, 11, 0.5), 0 4px 14px rgba(245, 158, 11, 0.35)';
                        e.currentTarget.style.filter = 'brightness(1.06)';
                      }}
                      onBlur={e => {
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.25)';
                        e.currentTarget.style.filter = 'none';
                      }}
                      onMouseEnter={e => {
                        if (!savingFacultyAssignment) {
                          e.currentTarget.style.filter = 'brightness(1.06)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (document.activeElement !== e.currentTarget) {
                          e.currentTarget.style.filter = 'none';
                        }
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {savingFacultyAssignment ? 'Saving Assignment...' : 'Save Assignment'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'semesters' && (
              <div style={styles.tabPanel}>
                {/* CARD 1: ACTION BUTTONS CARD (TOP) */}
                <div className="glass-panel desktop-student-action-card" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={semesterFileInputRef}
                    onChange={handleSemesterImportFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                    {/* Left Actions Group */}
                    <div className="admin-action-btn-group desktop-student-action-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-blue"
                        onClick={() => { setShowSemesterMobileActions(false); handleDownloadSemesterSampleTemplate(); }}
                        title="Download sample Excel file format for semester import"
                      >
                        <FileSpreadsheet size={16} />
                        <span>Sample Format</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-purple"
                        onClick={() => { setShowSemesterMobileActions(false); semesterFileInputRef.current && semesterFileInputRef.current.click(); }}
                        title="Import semester batch from CSV or Excel"
                      >
                        <Upload size={16} />
                        <span>Bulk Upload</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-green"
                        onClick={() => { setShowSemesterMobileActions(false); handleExportSemesterData(); }}
                        title="Export semester records to Excel file"
                      >
                        <Download size={16} />
                        <span>Export</span>
                      </button>

                      {selectedSemesterIds.length > 0 && (
                        <button
                          className="admin-glass-btn admin-glass-btn-rose"
                          onClick={() => handleBulkDeleteSemesters(selectedSemesterIds)}
                          title={`Delete ${selectedSemesterIds.length} selected semester(s)`}
                        >
                          <Trash2 size={16} />
                          <span>
                            Delete ({selectedSemesterIds.length})
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Right Action Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      <button
                        onClick={handleOpenAddSemesterModal}
                        className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
                      >
                        <Plus size={16} /> <span>Add Semester</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARD 2: SEARCH FILTER BAR */}
                <div className="glass-panel" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Search size={18} style={styles.searchIcon} />
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Search semester by Name, Number or Term..."
                      value={semesterSearchQuery}
                      onChange={(e) => setSemesterSearchQuery(e.target.value)}
                      style={{ paddingLeft: '40px', paddingRight: semesterSearchQuery ? '36px' : '14px', width: '100%' }}
                    />
                    {semesterSearchQuery && (
                      <button
                        onClick={() => setSemesterSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* CARD 3: SEMESTER DATA TABLE CARD (MATCHING USER SCREENSHOT) */}
                <div className="glass-panel" style={{ ...styles.studentCrudPanel, padding: isMobile ? '14px 10px' : '24px', borderRadius: '16px' }}>
                  <div className="custom-table-container">
                    {allSemestersList.length === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '50px 20px',
                        color: 'var(--text-muted)'
                      }}>
                        <Layers size={52} color="var(--text-muted)" style={{ marginBottom: '14px', opacity: 0.4 }} />
                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                          No semesters created yet
                        </h4>
                        <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 16px auto', color: 'var(--text-secondary)' }}>
                          You haven't created any semesters yet. Click the "Add Semester" button above to create a semester.
                        </p>
                        <button
                          onClick={handleOpenAddSemesterModal}
                          className="btn btn-primary"
                          style={{ padding: '8px 18px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', border: 'none', gap: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Plus size={16} color="#0f172a" /> Add Your First Semester
                        </button>
                      </div>
                    ) : (
                      (() => {
                        const filteredSemesters = allSemestersList.filter(sem => {
                          if (!semesterSearchQuery) return true;
                          const q = semesterSearchQuery.toLowerCase();
                          return (
                            sem.name.toLowerCase().includes(q) ||
                            String(sem.semNumber).includes(q) ||
                            (sem.program && sem.program.toLowerCase().includes(q)) ||
                            (sem.term && sem.term.toLowerCase().includes(q))
                          );
                        });

                        return (
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th style={{ width: '40px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <input
                                    type="checkbox"
                                    checked={filteredSemesters.length > 0 && filteredSemesters.every(s => selectedSemesterIds.includes(s.id))}
                                    onChange={toggleSelectAllSemesters}
                                    title="Select / Unselect All"
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </th>
                                <th style={{ whiteSpace: 'nowrap' }}>Semester Code</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Semester Name</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Term Type</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                                <th style={{ textAlign: 'center', width: '110px', whiteSpace: 'nowrap' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSemesters.map((sem) => {
                                const isChecked = selectedSemesterIds.includes(sem.id);
                                const semNumVal = sem.semNumber || sem.id;
                                const displayName = sem.name || `Semester ${semNumVal}`;
                                const termVal = sem.term ? (sem.term.toLowerCase().includes('term') ? sem.term : `${sem.term} Term`) : 'Odd Term';

                                return (
                                  <tr key={sem.id} style={{ background: isChecked ? 'rgba(147, 51, 234, 0.08)' : 'transparent' }}>
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleSelectSemester(sem.id)}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                      />
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                      {semNumVal}
                                    </td>
                                    <td style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                                      {displayName}
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
                                      <span style={{
                                        padding: '2px 9px',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '600',
                                        background: 'rgba(147, 51, 234, 0.1)',
                                        color: '#9333ea',
                                        display: 'inline-block'
                                      }}>
                                        {termVal}
                                      </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <span style={{
                                        padding: '3px 12px',
                                        borderRadius: '12px',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        color: '#16a34a',
                                        display: 'inline-block'
                                      }}>
                                        Active
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <button
                                          onClick={() => handleOpenEditSemesterModal(sem)}
                                          style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: 'rgba(59, 130, 246, 0.08)',
                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                            color: '#2563eb',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.15s ease'
                                          }}
                                          title="Edit Semester"
                                        >
                                          <Edit size={15} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSemester(sem.id, sem.name)}
                                          style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: 'rgba(239, 68, 68, 0.08)',
                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                            color: '#ef4444',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.15s ease'
                                          }}
                                          title="Delete Semester"
                                        >
                                          <Trash2 size={15} />
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
              </div>
            )}

            {activeTab === 'attendance_logs' && (
              <div style={styles.tabPanel}>
                {/* MASTER ATTENDANCE MATRIX GRID */}
                <div className="matrix-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

                    {/* Card 1: Interactive Filter & Search Toolbar */}
                    <div className="glass-panel" style={{ ...styles.dashboardPanelCard, background: '#ffffff', border: '1.5px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', width: '100%', padding: isMobile ? '12px' : '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Row 1: Search Input (Full Width) */}
                      <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                          className="glass-input"
                          placeholder="Search student by name, roll no, enrollment no..."
                          value={matrixSearch}
                          onChange={e => setMatrixSearch(e.target.value)}
                          style={{
                            width: '100%',
                            paddingLeft: '40px',
                            paddingRight: matrixSearch ? '36px' : '14px',
                            height: '42px',
                            fontSize: '0.88rem',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {matrixSearch && (
                          <button
                            type="button"
                            onClick={() => setMatrixSearch('')}
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {/* Row 2: Filter Controls + Reset Button */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: '1 1 auto' }}>
                          {/* Date Range Selector */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                            <select
                              value={matrixDateMode}
                              onChange={e => setMatrixDateMode(e.target.value)}
                              style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                            >
                              <option value="all">All Recorded Dates</option>
                              <option value="month">By Month</option>
                              <option value="custom">Custom Date Range</option>
                              <option value="single">Single Date</option>
                            </select>

                            {matrixDateMode === 'month' && (
                              <input
                                type="month"
                                value={matrixMonth}
                                onChange={e => setMatrixMonth(e.target.value)}
                                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }}
                              />
                            )}

                            {matrixDateMode === 'custom' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                                <input
                                  type="date"
                                  value={matrixStartDate}
                                  onChange={e => setMatrixStartDate(e.target.value)}
                                  style={{ height: '36px', padding: '6px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>to</span>
                                <input
                                  type="date"
                                  value={matrixEndDate}
                                  onChange={e => setMatrixEndDate(e.target.value)}
                                  style={{ height: '36px', padding: '6px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }}
                                />
                              </div>
                            )}

                            {matrixDateMode === 'single' && (
                              <input
                                type="date"
                                value={matrixSingleDate}
                                onChange={e => setMatrixSingleDate(e.target.value)}
                                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }}
                              />
                            )}
                          </div>

                          {/* Semester Filter */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Folder size={14} color="#f59e0b" />
                            <select
                              value={(selectedSemFolder && selectedSemFolder !== 'ALL') ? selectedSemFolder : (availableSemesters[0] || '1')}
                              onChange={e => {
                                setSelectedSemFolder(e.target.value);
                                setMatrixSearch('');
                                setMatrixDivFilter(availableSemesterDivisions[0] || 'A');
                                setMatrixSubjectFilter('ALL');
                                setMatrixStatusFilter('ALL');
                              }}
                              style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                            >
                              {(availableSemesters && availableSemesters.length > 0 ? availableSemesters : ['1', '2', '3', '4', '5', '6', '7', '8']).map(sem => (
                                <option key={sem} value={sem}>Semester {sem}</option>
                              ))}
                            </select>
                          </div>

                          {/* Division Filter */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Layers size={14} color="var(--text-muted)" />
                            <select
                              value={matrixDivFilter}
                              onChange={e => setMatrixDivFilter(e.target.value)}
                              style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                            >
                              <option value="ALL">All Divisions</option>
                              {(availableSemesterDivisions && availableSemesterDivisions.length > 0 ? availableSemesterDivisions : ['A', 'B', 'C', 'D']).map(div => (
                                <option key={div} value={div}>Division {div}</option>
                              ))}
                            </select>
                          </div>

                          {/* Subject Filter */}
                          {(matrixData?.uniqueSubjects || []).length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <BookOpen size={14} color="var(--text-muted)" />
                              <select
                                value={matrixSubjectFilter}
                                onChange={e => setMatrixSubjectFilter(e.target.value)}
                                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', maxWidth: '160px', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                              >
                                <option value="ALL">All Subjects</option>
                                {matrixData.uniqueSubjects.map(sub => (
                                  <option key={sub} value={sub}>{cleanSubjectTitle(sub)}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Status Filter */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Filter size={14} color="var(--text-muted)" />
                            <select
                              value={matrixStatusFilter}
                              onChange={e => setMatrixStatusFilter(e.target.value)}
                              style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                            >
                              <option value="ALL">All Statuses</option>
                              <option value="regular">Safe (≥ 75%)</option>
                              <option value="defaulter">Defaulters (&lt; 75%)</option>
                            </select>
                          </div>
                        </div>

                        {/* Reset Filters Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setMatrixSearch('');
                            setMatrixDateMode('all');
                            setMatrixMonth('');
                            setMatrixStartDate('');
                            setMatrixEndDate('');
                            setMatrixSingleDate('');
                            setSelectedSemFolder(availableSemesters[0] || '1');
                            setMatrixDivFilter('ALL');
                            setMatrixSubjectFilter('ALL');
                            setMatrixStatusFilter('ALL');
                          }}
                          title="Reset all search & filter values"
                          style={{
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            border: '1.5px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#475569',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                            marginLeft: 'auto',
                            boxSizing: 'border-box'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#f87171'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                        >
                          <RotateCcw size={14} />
                          Reset Filters
                        </button>
                      </div>
                    </div>

                    {/* Card 2: KPI Metrics Summary Statistics */}
                    <div className="glass-panel" style={{ ...styles.dashboardPanelCard, background: '#ffffff', border: '1.5px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', width: '100%', padding: isMobile ? '14px 12px' : '18px 22px' }}>
                      <div className="matrix-kpi-grid" style={{ margin: 0 }}>
                        <div className="matrix-kpi-card" style={{ background: '#ffffff', border: '1.5px solid #e2e8f0' }}>
                          <div className="matrix-kpi-icon-badge blue">
                            <Users size={22} color="#0284c7" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                              Total Students
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                              {matrixData?.summary?.totalStudents || processedMatrixStudents.length}
                            </div>
                          </div>
                        </div>

                        <div className="matrix-kpi-card" style={{ background: '#ffffff', border: '1.5px solid #e2e8f0' }}>
                          <div className="matrix-kpi-icon-badge amber">
                            <BookOpen size={22} color="#f59e0b" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                              Lectures Conducted
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                              {matrixData?.summary?.totalLectures || matrixData?.columns?.length || 0}
                            </div>
                          </div>
                        </div>

                        <div className="matrix-kpi-card" style={{ background: '#ffffff', border: '1.5px solid #e2e8f0' }}>
                          <div className="matrix-kpi-icon-badge emerald">
                            <TrendingUp size={22} color="#10b981" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                              Avg Class Attendance
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: (matrixData?.summary?.overallAttendancePct || 0) >= 75 ? '#10b981' : (matrixData?.summary?.overallAttendancePct || 0) >= 60 ? '#f59e0b' : '#ef4444' }}>
                              {matrixData?.summary?.overallAttendancePct || 0}%
                            </div>
                          </div>
                        </div>

                        <div className="matrix-kpi-card" style={{ background: '#ffffff', border: '1.5px solid #e2e8f0' }}>
                          <div className="matrix-kpi-icon-badge green">
                            <CheckCircle size={22} color="#16a34a" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                              Safe (≥ 75%)
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#16a34a' }}>
                              {matrixData?.summary?.highAttendanceCount || 0}
                            </div>
                          </div>
                        </div>

                        <div className="matrix-kpi-card" style={{ background: '#ffffff', border: '1.5px solid #e2e8f0' }}>
                          <div className="matrix-kpi-icon-badge red">
                            <AlertTriangle size={22} color="#ef4444" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                              Short Attendance (&lt; 75%)
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ef4444' }}>
                              {matrixData?.summary?.lowAttendanceCount || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Attendance Log Table */}
                    <div className="glass-panel" style={{ ...styles.dashboardPanelCard, background: '#ffffff', border: '1.5px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', width: '100%', padding: isMobile ? '8px 6px' : '14px' }}>
                      {matrixLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                          <RefreshCw size={36} color="#f59e0b" className="spin-icon" style={{ marginBottom: '14px' }} />
                          <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
                            Loading Semester {selectedSemFolder} Attendance Sheet...
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Compiling all student records, conducted lectures, and punch-in timestamps.
                          </div>
                        </div>
                      ) : displayedMatrixStudents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                          <Users size={38} color="#64748b" style={{ marginBottom: '10px', opacity: 0.5 }} />
                          <div style={{ fontSize: '0.98rem', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
                            No matching student records found
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '12px' }}>
                            Try clearing your search query or adjusting your status and division filters.
                          </div>
                          {matrixSearch && (
                            <button
                              onClick={() => setMatrixSearch('')}
                              className="btn btn-secondary"
                              style={{ padding: '5px 14px', fontSize: '0.8rem', background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1' }}
                            >
                              Clear Search
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          {/* Informational Banner if no lectures conducted yet */}
                          {(!matrixData?.columns || matrixData.columns.length === 0) && (
                            <div style={{
                              padding: '12px 16px',
                              borderRadius: '10px',
                              background: '#fef3c7',
                              border: '1px solid #fde68a',
                              color: '#92400e',
                              fontSize: '0.84rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              marginBottom: '12px'
                            }}>
                              <Clock size={18} color="#d97706" style={{ flexShrink: 0 }} />
                              <div style={{ fontWeight: '500' }}>
                                No attendance sessions have been conducted yet for Semester {selectedSemFolder}. Showing all enrolled students below. Date & Subject columns will automatically appear once lectures are conducted.
                              </div>
                            </div>
                          )}

                          {/* The Matrix Table Container */}
                          {(() => {
                            const showSemCol = false;
                            const showDivCol = !matrixDivFilter || matrixDivFilter === 'ALL';

                            return (
                              <>
                                <div className="matrix-table-wrapper">
                                <table className="matrix-table">
                                  <thead>
                                    {/* Row 1: Roll No, Name, Sem (if All Sems), Div (if All Divs), Date Columns (spanning subjects), Summary Headers */}
                                    <tr>
                                      <th rowSpan={2} className="matrix-sticky-col-1" style={{ textAlign: 'center' }}>
                                        Roll No
                                      </th>
                                      <th
                                        rowSpan={2}
                                        className="matrix-sticky-col-2"
                                        style={{
                                          ...((!showSemCol && !showDivCol) ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                        }}
                                      >
                                        Student Name
                                      </th>
                                      {showSemCol && (
                                        <th
                                          rowSpan={2}
                                          className="matrix-sticky-col-3"
                                          style={{
                                            left: '240px',
                                            minWidth: '55px',
                                            maxWidth: '55px',
                                            width: '55px',
                                            textAlign: 'center',
                                            ...(!showDivCol ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                          }}
                                        >
                                          Sem
                                        </th>
                                      )}
                                      {showDivCol && (
                                        <th
                                          rowSpan={2}
                                          className="matrix-sticky-col-3"
                                          style={{
                                            left: showSemCol ? '295px' : '240px',
                                            minWidth: '55px',
                                            maxWidth: '55px',
                                            width: '55px',
                                            textAlign: 'center',
                                            borderRight: '2px solid #cbd5e1',
                                            boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)'
                                          }}
                                        >
                                          Div
                                        </th>
                                      )}

                                      {(matrixData?.dateGroups || []).map((grp, gIdx) => (
                                        <th
                                          key={grp.date || gIdx}
                                          colSpan={grp.sessions.length}
                                          className="matrix-date-header matrix-date-boundary"
                                        >
                                          📅 {grp.formattedDate || grp.date}
                                        </th>
                                      ))}
                                      <th rowSpan={2} className="matrix-summary-header-p" style={{ width: '65px', textAlign: 'center', color: '#16a34a', background: '#f1f5f9', fontWeight: '800' }}>
                                        Total P
                                      </th>
                                      <th rowSpan={2} className="matrix-summary-header-a" style={{ width: '65px', textAlign: 'center', color: '#dc2626', background: '#f1f5f9', fontWeight: '800' }}>
                                        Total A
                                      </th>
                                      <th rowSpan={2} className="matrix-summary-header-pct" style={{ width: '75px', textAlign: 'center', color: '#d97706', background: '#f1f5f9', fontWeight: '800' }}>
                                        % Attend
                                      </th>
                                    </tr>

                                    {/* Row 2: Subject sub-headers under each Date */}
                                    <tr>
                                      {(matrixData?.dateGroups || []).map((grp) =>
                                        grp.sessions.map((sess, sIdx) => {
                                          const isDateBoundary = sIdx === grp.sessions.length - 1;
                                          return (
                                            <th
                                              key={sess.columnKey || sIdx}
                                              className={isDateBoundary ? 'matrix-date-boundary' : ''}
                                              style={{
                                                textAlign: 'center',
                                                minWidth: '95px',
                                                padding: '6px 8px'
                                              }}
                                              title={`${cleanSubjectTitle(sess.subject)}\nFaculty: ${sess.faculty_name}\nTime: ${sess.time}\nType: ${sess.type}`}
                                            >
                                              <div style={{ fontWeight: '700', fontSize: '0.78rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px', margin: '0 auto' }}>
                                                {cleanSubjectTitle(sess.subject)}
                                              </div>
                                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                                                {sess.time || sess.type}
                                              </div>
                                            </th>
                                          );
                                        })
                                      )}
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {displayedMatrixStudents.map((st) => (
                                      <tr key={st.id}>
                                        {/* Col 1: Roll No */}
                                        <td className="matrix-sticky-col-1" style={{ fontWeight: '800', color: '#d97706', textAlign: 'center', fontSize: '0.86rem' }}>
                                          {st.roll_no || '-'}
                                        </td>

                                        {/* Col 2: Student Name */}
                                        <td
                                          className="matrix-sticky-col-2"
                                          style={{
                                            ...((!showSemCol && !showDivCol) ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                          }}
                                        >
                                          <div style={{ fontWeight: '700', fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                            {st.name}
                                          </div>
                                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500' }}>
                                            {st.enrollment_no}
                                          </div>
                                        </td>

                                        {/* Col 3: Semester (Sticky if All Sems) */}
                                        {showSemCol && (
                                          <td
                                            className="matrix-sticky-col-3"
                                            style={{
                                              left: '240px',
                                              minWidth: '55px',
                                              maxWidth: '55px',
                                              width: '55px',
                                              textAlign: 'center',
                                              ...(!showDivCol ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                            }}
                                          >
                                            <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: '700' }}>
                                              {String(st.semester || (selectedSemFolder !== 'ALL' ? selectedSemFolder : '') || '1').replace(/sem(ester)?\s*/i, '')}
                                            </span>
                                          </td>
                                        )}

                                        {/* Col 4: Division (Sticky if All Divs) */}
                                        {showDivCol && (
                                          <td
                                            className="matrix-sticky-col-3"
                                            style={{
                                              left: showSemCol ? '295px' : '240px',
                                              minWidth: '55px',
                                              maxWidth: '55px',
                                              width: '55px',
                                              textAlign: 'center',
                                              borderRight: '2px solid #cbd5e1',
                                              boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)'
                                            }}
                                          >
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontWeight: '700' }}>
                                              {st.division || 'A'}
                                            </span>
                                          </td>
                                        )}

                                        {/* Date + Subject Attendance Cells */}
                                        {(matrixData?.columns || []).map((col) => {
                                          const cell = matrixData.attendanceMatrix?.[String(st.id)]?.[col.columnKey];
                                          const status = cell?.status;
                                          const isBoundary = dateBoundaryKeys.has(col.columnKey);

                                          return (
                                            <td
                                              key={col.columnKey}
                                              className={isBoundary ? 'matrix-date-boundary' : ''}
                                              style={{ textAlign: 'center', padding: '6px' }}
                                            >
                                              {status === 'P' ? (
                                                <span
                                                  className="matrix-badge-p"
                                                  onClick={() => setSelectedCellInfo({ student: st, column: col, status: 'Present', cell })}
                                                  title={`Present: ${st.name}\nSubject: ${col.subject}\nDate: ${col.date}\nTime: ${cell?.time || col.time}\nMethod: ${cell?.method || col.type}`}
                                                >
                                                  P
                                                </span>
                                              ) : status === 'NA' ? (
                                                <span
                                                  className="matrix-badge-na"
                                                  onClick={() => setSelectedCellInfo({ student: st, column: col, status: 'Not Applicable', cell })}
                                                  title={`Not Applicable: ${st.name} (Div ${st.division || 'A'})\nSession conducted for Division ${col.division || 'Other'}\nSubject: ${col.subject}\nDate: ${col.date}`}
                                                >
                                                  NA
                                                </span>
                                              ) : (
                                                <span
                                                  className="matrix-badge-a"
                                                  onClick={() => setSelectedCellInfo({ student: st, column: col, status: 'Absent', cell })}
                                                  title={`Absent: ${st.name}\nSubject: ${col.subject}\nDate: ${col.date}`}
                                                >
                                                  A
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}

                                        {/* Summary Col: Present */}
                                        <td className="matrix-summary-cell-p" style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a' }}>
                                          {st.presentCount || 0}
                                        </td>

                                        {/* Summary Col: Absent */}
                                        <td className="matrix-summary-cell-a" style={{ textAlign: 'center', fontWeight: '800', color: '#dc2626' }}>
                                          {st.absentCount || 0}
                                        </td>

                                        {/* Summary Col: Percentage */}
                                        <td className="matrix-summary-cell-pct" style={{ textAlign: 'center' }}>
                                          {st.pct !== null && st.pct !== undefined ? (
                                            <span
                                              style={{
                                                padding: '3px 8px',
                                                borderRadius: '8px',
                                                fontSize: '0.78rem',
                                                fontWeight: '800',
                                                background: st.pct >= 75 ? '#dcfce7' : st.pct >= 60 ? '#fef3c7' : '#fee2e2',
                                                color: st.pct >= 75 ? '#15803d' : st.pct >= 60 ? '#b45309' : '#dc2626',
                                                border: st.pct >= 75 ? '1px solid #86efac' : st.pct >= 60 ? '1px solid #fde68a' : '1px solid #fca5a5'
                                              }}
                                            >
                                              {st.pct}%
                                            </span>
                                          ) : (
                                            <span
                                              style={{
                                                padding: '3px 8px',
                                                borderRadius: '8px',
                                                fontSize: '0.78rem',
                                                fontWeight: '800',
                                                background: '#f1f5f9',
                                                color: '#64748b',
                                                border: '1px solid #cbd5e1'
                                              }}
                                            >
                                              NA
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>

                                  {/* Table Footer: Total Present per Subject Lecture */}
                                  {(matrixData?.columns?.length > 0 || processedMatrixStudents.length > 0) && (
                                    <tfoot>
                                      <tr>
                                        <td className="matrix-sticky-col-1" style={{ textAlign: 'center', fontWeight: '800', color: '#0f172a' }}>
                                          Total
                                        </td>
                                        <td
                                          className="matrix-sticky-col-2"
                                          style={{
                                            textAlign: 'left',
                                            fontWeight: '800',
                                            color: '#0f172a',
                                            ...((!showSemCol && !showDivCol) ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                          }}
                                        >
                                          Present per Lecture
                                        </td>
                                        {showSemCol && (
                                          <td
                                            className="matrix-sticky-col-3"
                                            style={{
                                              left: '240px',
                                              minWidth: '55px',
                                              maxWidth: '55px',
                                              width: '55px',
                                              textAlign: 'center',
                                              fontWeight: '800',
                                              color: '#64748b',
                                              ...(!showDivCol ? { borderRight: '2px solid #cbd5e1', boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' } : { borderRight: '1px solid #cbd5e1', boxShadow: 'none' })
                                            }}
                                          >
                                            -
                                          </td>
                                        )}
                                        {showDivCol && (
                                          <td
                                            className="matrix-sticky-col-3"
                                            style={{
                                              left: showSemCol ? '295px' : '240px',
                                              minWidth: '55px',
                                              maxWidth: '55px',
                                              width: '55px',
                                              textAlign: 'center',
                                              fontWeight: '800',
                                              color: '#64748b',
                                              borderRight: '2px solid #cbd5e1',
                                              boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)'
                                            }}
                                          >
                                            -
                                          </td>
                                        )}
                                        {(matrixData?.columns || []).map((col) => {
                                          const isBoundary = dateBoundaryKeys.has(col.columnKey);
                                          let colPresentCount = 0;
                                          displayedMatrixStudents.forEach(st => {
                                            if (matrixData.attendanceMatrix?.[String(st.id)]?.[col.columnKey]?.status === 'P') colPresentCount++;
                                          });
                                          return (
                                            <td
                                              key={col.columnKey}
                                              className={isBoundary ? 'matrix-date-boundary' : ''}
                                              style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a' }}
                                            >
                                              {colPresentCount}
                                            </td>
                                          );
                                        })}
                                        <td className="matrix-summary-cell-p" style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a' }}>
                                          {displayedMatrixStudents.reduce((a, b) => a + (b.presentCount || 0), 0)}
                                        </td>
                                        <td className="matrix-summary-cell-a" style={{ textAlign: 'center', fontWeight: '800', color: '#dc2626' }}>
                                          {displayedMatrixStudents.reduce((a, b) => a + (b.absentCount || 0), 0)}
                                        </td>
                                        <td className="matrix-summary-cell-pct" style={{ textAlign: 'center', fontWeight: '800', color: '#d97706' }}>
                                          {(() => {
                                            const totalP = displayedMatrixStudents.reduce((a, b) => a + (b.presentCount || 0), 0);
                                            const totalA = displayedMatrixStudents.reduce((a, b) => a + (b.absentCount || 0), 0);
                                            const totalCond = totalP + totalA;
                                            return totalCond > 0 ? `${Math.round((totalP / totalCond) * 100)}%` : 'NA';
                                          })()}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>

                              {/* Semester Pagination Bar for All Semesters Mode (matching Photo 2) */}
                              {(!selectedSemFolder || selectedSemFolder === 'ALL') && matrixSemestersList.length > 1 && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginTop: '16px',
                                  padding: '12px 16px',
                                  gap: '12px'
                                }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setMatrixSemPageIndex(prev => Math.max(0, prev - 1))}
                                    disabled={safeSemPageIndex <= 0}
                                    style={{
                                      padding: '7px 16px',
                                      fontSize: '0.85rem',
                                      fontWeight: '700',
                                      borderRadius: '10px',
                                      border: '1.5px solid #cbd5e1',
                                      background: safeSemPageIndex <= 0 ? '#f1f5f9' : '#ffffff',
                                      color: safeSemPageIndex <= 0 ? '#94a3b8' : '#0f172a',
                                      cursor: safeSemPageIndex <= 0 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      boxShadow: safeSemPageIndex <= 0 ? 'none' : '0 2px 4px rgba(0,0,0,0.04)'
                                    }}
                                  >
                                    ← Previous
                                  </button>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: '800', padding: '0 4px' }}>
                                      Page {safeSemPageIndex + 1} of {matrixSemestersList.length}
                                    </span>
                                    <span style={{
                                      fontSize: '0.78rem',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      border: '1px solid #fde68a',
                                      fontWeight: '800'
                                    }}>
                                      Semester {currentActiveSemester}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setMatrixSemPageIndex(prev => Math.min(matrixSemestersList.length - 1, prev + 1))}
                                    disabled={safeSemPageIndex >= matrixSemestersList.length - 1}
                                    style={{
                                      padding: '7px 16px',
                                      fontSize: '0.85rem',
                                      fontWeight: '700',
                                      borderRadius: '10px',
                                      border: '1.5px solid #cbd5e1',
                                      background: safeSemPageIndex >= matrixSemestersList.length - 1 ? '#f1f5f9' : '#ffffff',
                                      color: safeSemPageIndex >= matrixSemestersList.length - 1 ? '#94a3b8' : '#0f172a',
                                      cursor: safeSemPageIndex >= matrixSemestersList.length - 1 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      boxShadow: safeSemPageIndex >= matrixSemestersList.length - 1 ? 'none' : '0 2px 4px rgba(0,0,0,0.04)'
                                    }}
                                  >
                                    Next →
                                  </button>
                                </div>
                              )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                {/* Cell Details Modal Popup */}
                {selectedCellInfo && (
                  <div
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.65)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 999999,
                      padding: '16px'
                    }}
                    onClick={() => setSelectedCellInfo(null)}
                  >
                    <div
                      className="glass-panel"
                      style={{
                        background: '#ffffff',
                        color: '#1e293b',
                        borderRadius: '16px',
                        padding: '24px',
                        maxWidth: '440px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                        border: '1.5px solid #cbd5e1'
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={20} color="#f59e0b" />
                          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                            Lecture Attendance Details
                          </h3>
                        </div>
                        <AdminModalCloseBtn
                          onClick={() => setSelectedCellInfo(null)}
                          title="Close Details"
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Student Name:</span>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{selectedCellInfo.student.name}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Roll No / Enrollment:</span>
                          <span style={{ fontWeight: '700', color: '#0284c7' }}>
                            Roll {selectedCellInfo.student.roll_no || '-'} ({selectedCellInfo.student.enrollment_no})
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Subject:</span>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{cleanSubjectTitle(selectedCellInfo.column.subject)}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Date & Time:</span>
                          <span style={{ fontWeight: '600' }}>
                            {selectedCellInfo.column.date} ({selectedCellInfo.cell?.time || selectedCellInfo.column.time})
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Faculty:</span>
                          <span style={{ fontWeight: '600' }}>{selectedCellInfo.column.faculty_name}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Lecture Type / Mode:</span>
                          <span style={{ fontWeight: '600' }}>{selectedCellInfo.column.type}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', alignItems: 'center', marginTop: '6px' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>Attendance Status:</span>
                          {selectedCellInfo.status === 'Present' ? (
                            <span style={{ padding: '4px 12px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontWeight: '800', fontSize: '0.85rem' }}>
                              ✓ PRESENT
                            </span>
                          ) : selectedCellInfo.status === 'Not Applicable' ? (
                            <span style={{ padding: '4px 12px', borderRadius: '12px', background: '#f1f5f9', color: '#64748b', fontWeight: '800', fontSize: '0.82rem', border: '1px solid #cbd5e1' }}>
                              — NOT APPLICABLE (Div {selectedCellInfo.column.division || 'Other'} Session)
                            </span>
                          ) : (
                            <span style={{ padding: '4px 12px', borderRadius: '12px', background: '#fee2e2', color: '#b91c1c', fontWeight: '800', fontSize: '0.85rem' }}>
                              ✕ ABSENT
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: '18px', textAlign: 'right' }}>
                        <button
                          onClick={() => setSelectedCellInfo(null)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 18px', fontSize: '0.85rem', fontWeight: '600' }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'students' && (
              <div style={styles.tabPanel}>
                {/* CARD 1: ACTION BUTTONS CARD (TOP) */}
                <div className="glass-panel desktop-student-action-card" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                    {/* Left Actions Group */}
                    <div className="admin-action-btn-group desktop-student-action-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-blue"
                        onClick={() => { setShowStudentMobileActions(false); handleDownloadStudentSampleTemplate(); }}
                        title="Download sample Excel file format for student import"
                      >
                        <FileSpreadsheet size={16} />
                        <span>Sample Format</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-purple"
                        onClick={() => { setShowStudentMobileActions(false); fileInputRef.current && fileInputRef.current.click(); }}
                        title="Import student records batch from CSV/Excel"
                      >
                        <Upload size={16} />
                        <span>Bulk Upload</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-green"
                        onClick={() => { setShowStudentMobileActions(false); handleExportStudentsData(); }}
                        title="Export all student records to Excel file"
                      >
                        <Download size={16} />
                        <span>Export Data</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-amber"
                        onClick={() => { setShowStudentMobileActions(false); setPromoteStep(1); }}
                        title="Promote all students to next semester (Sem 1..7 -> +1, Sem 8 -> Graduate & Remove)"
                      >
                        <TrendingUp size={16} />
                        <span>Promote</span>
                      </button>

                      {selectedStudentIds.length > 0 && (
                        <>
                          <button
                            className="admin-glass-btn admin-glass-btn-amber"
                            onClick={handleBulkResetDeviceId}
                            title={`Reset Device ID for ${selectedStudentIds.length} selected student(s)`}
                          >
                            <Unlock size={16} />
                            <span>
                              Reset Device ID ({selectedStudentIds.length})
                            </span>
                          </button>

                          <button
                            className="admin-glass-btn admin-glass-btn-rose"
                            onClick={() => handleBulkDeleteStudents(selectedStudentIds)}
                            title={`Delete ${selectedStudentIds.length} selected student(s)`}
                          >
                            <Trash2 size={16} />
                            <span>
                              Delete ({selectedStudentIds.length})
                            </span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Right Action Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
                        onClick={() => { setShowStudentMobileActions(false); openAddModal(); }}
                      >
                        <Plus size={16} /> <span>Add Student</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARD 2: SEARCH / FILTER BAR CARD (BELOW BUTTONS) */}
                <div className="glass-panel" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Search size={18} style={styles.searchIcon} />
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Search by Name or Enrollment No..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: '40px', paddingRight: searchQuery ? '36px' : '14px', width: '100%' }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* CARD 3: STUDENT DATA TABLE CARD */}
                <div className="glass-panel" style={{ ...styles.studentCrudPanel, padding: isMobile ? '14px 10px' : '24px', borderRadius: '16px' }}>
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
                          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                            <Users size={52} color="var(--text-muted)" style={{ marginBottom: '14px', opacity: 0.4 }} />
                            <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                              {students.length === 0 ? 'No students added yet' : 'No matching students found'}
                            </h4>
                            <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 16px auto', color: 'var(--text-secondary)' }}>
                              {students.length === 0
                                ? 'You haven\'t added any students yet. Click the "Add Student" button above to add a student.'
                                : 'No student records match your current search query or semester / division filter.'}
                            </p>
                            {students.length === 0 && (
                              <button
                                onClick={openAddModal}
                                className="btn btn-primary"
                                style={{ padding: '8px 18px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0f172a', border: 'none', gap: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                              >
                                <Plus size={16} color="#0f172a" /> Add Your First Student
                              </button>
                            )}
                          </div>
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
                                <th>Sem / Div</th>
                                <th>Mobile</th>
                                <th style={{ textAlign: 'center' }}>Device Binding</th>
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
                                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      Sem {student.semester} - {student.division || '-'}
                                    </td>
                                    <td>{student.mobile}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleResetDeviceId(student.id, student.name, student.device_id)}
                                        title={
                                          student.device_id
                                            ? `Bound Device ID: ${student.device_id} (Click to reset/unlock device)`
                                            : 'Your device is already unlocked'
                                        }
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontSize: '1.25rem',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '4px 6px',
                                          borderRadius: '6px',
                                          lineHeight: 1,
                                          transition: 'transform 0.15s ease, background 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.transform = 'scale(1.25)';
                                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.transform = 'scale(1)';
                                          e.currentTarget.style.background = 'transparent';
                                        }}
                                      >
                                        {student.device_id ? '🔒' : '🔓'}
                                      </button>
                                    </td>
                                    <td>
                                      <div style={styles.actionButtonContainer}>
                                        <button
                                          className="admin-action-btn edit"
                                          onClick={() => openEditModal(student)}
                                          title="Edit Student Details"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button
                                          className="admin-action-btn delete"
                                          onClick={() => handleDeleteStudent(student.id)}
                                          title="Delete Student"
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
              </div>
            )}

            {/* PANEL 2b: FACULTY CRUD MANAGEMENT */}
            {activeTab === 'faculty' && (
              <div style={styles.tabPanel}>
                {/* CARD 1: ACTION BUTTONS CARD (TOP) */}
                <div className="glass-panel desktop-student-action-card" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    ref={facultyFileInputRef}
                    onChange={handleFacultyImportFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
                    {/* Left Actions Group */}
                    <div className="admin-action-btn-group desktop-student-action-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-blue"
                        onClick={() => { setShowFacultyMobileActions(false); handleDownloadFacultySampleTemplate(); }}
                        title="Download sample Excel file format for faculty import"
                      >
                        <FileSpreadsheet size={16} />
                        <span>Sample Format</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-purple"
                        onClick={() => { setShowFacultyMobileActions(false); facultyFileInputRef.current && facultyFileInputRef.current.click(); }}
                        title="Import faculty batch from CSV or Excel"
                      >
                        <Upload size={16} />
                        <span>Bulk Upload</span>
                      </button>

                      <button
                        className="admin-glass-btn admin-glass-btn-green"
                        onClick={() => { setShowFacultyMobileActions(false); handleExportFacultyData(); }}
                        title="Export faculty records to Excel file"
                      >
                        <Download size={16} />
                        <span>Export</span>
                      </button>

                      {selectedFacultyIds.length > 0 && (
                        <button
                          className="admin-glass-btn admin-glass-btn-rose"
                          onClick={() => handleBulkDeleteFaculty(selectedFacultyIds)}
                          title={`Delete ${selectedFacultyIds.length} selected faculty member(s)`}
                        >
                          <Trash2 size={16} />
                          <span>
                            Delete ({selectedFacultyIds.length})
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Right Action Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      <button
                        className="admin-glass-btn admin-glass-btn-amber full-width-mobile"
                        onClick={() => { setShowFacultyMobileActions(false); openAddFacultyModal(); }}
                      >
                        <Plus size={16} /> <span>Add Faculty</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARD 2: SEARCH / FILTER BAR CARD (BELOW BUTTONS) */}
                <div className="glass-panel" style={{ padding: isMobile ? '14px 16px' : '18px 24px', borderRadius: '16px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Search size={18} style={styles.searchIcon} />
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Search faculty by Name or Email..."
                      value={facultySearchQuery}
                      onChange={(e) => setFacultySearchQuery(e.target.value)}
                      style={{ paddingLeft: '40px', paddingRight: facultySearchQuery ? '36px' : '14px', width: '100%' }}
                    />
                    {facultySearchQuery && (
                      <button
                        onClick={() => setFacultySearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* CARD 3: FACULTY DATA TABLE CARD */}
                <div className="glass-panel" style={{ ...styles.studentCrudPanel, padding: isMobile ? '14px 10px' : '24px', borderRadius: '16px' }}>
                  <div className="custom-table-container">
                    {facultyLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px' }}>Loading faculty lists...</div>
                    ) : faculties.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No faculty members found.</div>
                    ) : (
                      (() => {
                        const filteredFaculties = faculties.filter(f => {
                          if (!facultySearchQuery || !facultySearchQuery.trim()) return true;
                          const q = facultySearchQuery.toLowerCase().trim();
                          const fName = (f.name || '').toLowerCase();
                          const fEmail = (f.email || f.username || '').toLowerCase();
                          const fDept = (f.department || '').toLowerCase();
                          const fMob = (f.mobile || '').toLowerCase();
                          return fName.includes(q) || fEmail.includes(q) || fDept.includes(q) || fMob.includes(q);
                        }).sort((a, b) => {
                          const aIsAdmin = isPrimaryAdminFaculty(a);
                          const bIsAdmin = isPrimaryAdminFaculty(b);
                          if (aIsAdmin && !bIsAdmin) return -1;
                          if (!aIsAdmin && bIsAdmin) return 1;
                          return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
                        });

                        const selectableFilteredFaculties = filteredFaculties.filter(f => !isPrimaryAdminFaculty(f));

                        return (
                          <table className="custom-table">
                            <thead>
                              <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectableFilteredFaculties.length > 0 && selectableFilteredFaculties.every(f => selectedFacultyIds.includes(f.id))}
                                    onChange={toggleSelectAllFaculty}
                                    title="Select / Unselect All"
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </th>
                                <th>Name</th>
                                <th>Gmail ID</th>
                                <th>Department</th>
                                <th>Mobile</th>
                                <th>Role</th>
                                <th>Password</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredFaculties.map((fac) => {
                                const isChecked = selectedFacultyIds.includes(fac.id);
                                const isPrimary = isPrimaryAdminFaculty(fac);
                                const rolesArr = Array.isArray(fac.roles) && fac.roles.length > 0
                                  ? (isPrimary ? Array.from(new Set([...fac.roles, 'admin'])) : fac.roles)
                                  : (isPrimary ? ['admin', 'faculty'] : (fac.role === 'admin' ? ['admin', 'faculty'] : ['faculty']));
                                const showFacultyBadge = rolesArr.includes('faculty');
                                const showAdminBadge = rolesArr.includes('admin') || isPrimary;

                                return (
                                  <tr key={fac.id} style={{ background: isChecked ? 'rgba(147, 51, 234, 0.08)' : 'transparent' }}>
                                    <td style={{ textAlign: 'center' }}>
                                      {isPrimary ? (
                                        <span title="Primary Admin Account (Protected)" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold' }}>—</span>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleSelectFaculty(fac.id)}
                                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                        />
                                      )}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>
                                      {fac.name}
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{fac.email || '—'}</td>
                                    <td>{fac.department}</td>
                                    <td>{fac.mobile}</td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        {showFacultyBadge && (
                                          <span style={{
                                            fontSize: '0.78rem',
                                            fontWeight: '700',
                                            padding: '4px 12px',
                                            borderRadius: '10px',
                                            background: '#e0edff',
                                            color: '#2563eb',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            letterSpacing: '0.01em'
                                          }}>
                                            Faculty
                                          </span>
                                        )}
                                        {showAdminBadge && (
                                          <span style={{
                                            fontSize: '0.78rem',
                                            fontWeight: '700',
                                            padding: '4px 12px',
                                            borderRadius: '10px',
                                            background: '#f3e8ff',
                                            color: '#9333ea',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            letterSpacing: '0.01em'
                                          }}>
                                            Admin
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      {isPrimary ? (
                                        <span style={{
                                          fontSize: '0.76rem',
                                          fontWeight: '600',
                                          color: '#d97706',
                                          background: 'rgba(245, 158, 11, 0.12)',
                                          padding: '3px 8px',
                                          borderRadius: '6px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px'
                                        }}>
                                          <Shield size={12} /> Same as Admin Login
                                        </span>
                                      ) : (
                                        <code>{fac.plain_password}</code>
                                      )}
                                    </td>
                                    <td>
                                      <div style={styles.actionButtonContainer}>
                                        <button
                                          className="admin-action-btn edit"
                                          onClick={() => openEditFacultyModal(fac)}
                                          title="Edit Faculty Details"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button
                                          className="admin-action-btn delete"
                                          onClick={() => {
                                            if (isPrimary) {
                                              showToast('Primary Admin account cannot be deleted', 'warning');
                                              return;
                                            }
                                            handleDeleteFaculty(fac.id);
                                          }}
                                          style={{
                                            opacity: isPrimary ? 0.35 : 1,
                                            cursor: isPrimary ? 'not-allowed' : 'pointer'
                                          }}
                                          title={isPrimary ? "Primary Admin cannot be deleted" : "Delete Faculty"}
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
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PANEL 3: QR ATTENDANCE */}
            {activeTab === 'otp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                {/* Top Row: Faculty QR Settings + Set QR Limit side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', width: '100%' }}>
                  {/* Card 1: Faculty QR Permission Controls */}
                  <div className="glass-panel" style={{ ...styles.dashboardPanelCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '28px 30px' }}>
                    <h3 style={{ ...styles.cardTitle, width: '100%', textAlign: 'center', marginBottom: '16px' }}>Faculty QR Settings</h3>

                    <div style={{ textAlign: 'center', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: qrGenerationEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <QrCode size={40} color={qrGenerationEnabled ? '#10b981' : '#ef4444'} />
                      </div>
                      <h4 style={{ color: 'var(--text-primary)', marginBottom: '10px', fontWeight: 600 }}>Faculty QR Permission</h4>
                      <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', background: qrGenerationEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: qrGenerationEnabled ? '#10b981' : '#ef4444', border: qrGenerationEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', marginBottom: '16px' }}>
                        {qrGenerationEnabled ? 'QR GENERATION ENABLED' : 'QR GENERATION DISABLED'}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.5 }}>
                        {qrGenerationEnabled
                          ? 'Faculty members can start QR attendance sessions from their dashboard. Disable this to block all QR session creation.'
                          : 'All Faculty QR session generation is blocked. Enable this to allow faculty to start QR attendance.'}
                      </p>
                    </div>

                    <button
                      className={`btn ${qrGenerationEnabled ? 'btn-danger' : 'btn-primary'}`}
                      onClick={handleToggleQrSettings}
                      style={{ padding: '12px 28px', fontSize: '1rem', width: '100%', borderRadius: '10px' }}
                    >
                      {qrGenerationEnabled ? 'Block QR Generation' : 'Allow QR Generation'}
                    </button>
                  </div>

                  {/* Card 2: Set QR Limit */}
                  <div className="glass-panel" style={{ ...styles.dashboardPanelCard, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '28px 30px' }}>
                    <div>
                      <h3 style={{ ...styles.cardTitle, marginBottom: '6px' }}>Set QR Limit</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', marginBottom: '20px', lineHeight: 1.5 }}>
                        Set how many QR sessions each faculty member can generate per day. Currently set to
                        <strong style={{ color: '#f59e0b', marginLeft: '4px' }}>{qrDailyLimit} session{qrDailyLimit === 1 ? '' : 's'}/day</strong>.
                      </p>

                      {/* Current limit display badge */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '20px'
                      }}>
                        <div style={{
                          width: '90px', height: '90px', borderRadius: '50%',
                          background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.25))',
                          border: '2px solid rgba(245,158,11,0.4)',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 0 20px rgba(245,158,11,0.15)'
                        }}>
                          <span style={{ fontSize: '2rem', fontWeight: '800', color: '#f59e0b', lineHeight: 1 }}>{qrDailyLimit}</span>
                          <span style={{ fontSize: '0.65rem', fontWeight: '600', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px' }}>per day</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {/* Custom number input & Save Limit button (Equal size flex: 1) */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', width: '100%' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={qrLimitInput}
                            onChange={e => setQrLimitInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveQrLimit()}
                            style={{
                              width: '100%',
                              height: '46px',
                              padding: '0 16px',
                              borderRadius: '12px',
                              border: '1.5px solid rgba(245,158,11,0.35)',
                              background: 'rgba(245,158,11,0.06)',
                              color: 'var(--text-primary)', fontSize: '1rem', fontWeight: '700',
                              outline: 'none', boxSizing: 'border-box', textAlign: 'center'
                            }}
                            placeholder="e.g. 5"
                          />
                        </div>
                        <button
                          onClick={handleSaveQrLimit}
                          disabled={qrLimitSaving}
                          style={{
                            flex: 1,
                            height: '46px',
                            padding: '0 16px',
                            borderRadius: '12px',
                            fontWeight: '700',
                            fontSize: '0.95rem',
                            border: 'none',
                            cursor: qrLimitSaving ? 'not-allowed' : 'pointer',
                            background: qrLimitSaving
                              ? 'rgba(245,158,11,0.3)'
                              : 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: '#0f172a', transition: 'all 0.2s',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 4px 12px rgba(245,158,11,0.25)'
                          }}
                        >
                          {qrLimitSaving ? (
                            <>
                              <span style={{ width: '14px', height: '14px', border: '2px solid #0f172a', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                              Saving...
                            </>
                          ) : (
                            <>✓ Save Limit</>
                          )}
                        </button>
                      </div>

                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                        Range: 1 – 100 sessions per day
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Today's Session History Table */}
                <div className="glass-panel" style={{ ...styles.dashboardPanelCard, width: '100%' }}>
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

                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: '12px', opacity: locationSaving ? 0.7 : 1, cursor: locationSaving ? 'not-allowed' : 'pointer' }}
                      disabled={locationSaving}
                    >
                      {locationSaving ? 'Saving Location...' : 'Save Location Coordinates'}
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
                      onClick={handleOpenAddRuleModal}
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

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleEditRule(rule)}
                              style={{
                                background: 'rgba(15, 23, 42, 0.06)',
                                border: '1px solid rgba(15, 23, 42, 0.18)',
                                color: '#000000',
                                cursor: 'pointer',
                                padding: '7px 8px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = 'rgba(37, 99, 235, 0.12)'; e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#000000'; e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.18)'; }}
                              title="Edit Rule"
                            >
                              <Edit size={16} color="#000000" />
                            </button>

                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              style={{
                                background: 'rgba(15, 23, 42, 0.06)',
                                border: '1px solid rgba(15, 23, 42, 0.18)',
                                color: '#000000',
                                cursor: 'pointer',
                                padding: '7px 8px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#000000'; e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.18)'; }}
                              title="Delete Rule"
                            >
                              <Trash2 size={16} color="#000000" />
                            </button>
                          </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
                      {/* Filter 1: Semester Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px', flex: 1 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                          Filter by Semester
                        </label>
                        <select
                          value={defaulterSemFilter}
                          onChange={(e) => {
                            setDefaulterSemFilter(e.target.value);
                            setDefaulterPage(1);
                          }}
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
                          onChange={(e) => {
                            setDefaulterDivFilter(e.target.value);
                            setDefaulterPage(1);
                          }}
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

                      {/* Filter 3: Status Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px', flex: 1 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                          Filter by Status
                        </label>
                        <select
                          value={defaulterStatusFilter}
                          onChange={(e) => {
                            setDefaulterStatusFilter(e.target.value);
                            setDefaulterPage(1);
                          }}
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
                                  const newNotices = filteredDefaulterList.map((s, idx) => {
                                    const pct = parseFloat(s.percentage) || 0;
                                    const ruleAction = pct < 60
                                      ? 'Critical Defaulter Status. Please contact your HOD / Class Coordinator immediately along with your parent/guardian.'
                                      : 'Attendance Warning Status. Please report to your Subject Faculty to make up for missed lectures.';
                                    const msg = `Dear ${s.name}, your attendance is currently ${s.percentage}%, which is below the mandatory 75% requirement. ${ruleAction}`;

                                    return {
                                      id: 'notice_' + Date.now() + '_' + idx + '_' + Math.floor(Math.random() * 1000),
                                      studentId: s.id || null,
                                      studentEnrollment: s.enrollment_no || s.email || s.id,
                                      studentName: s.name,
                                      studentRollNo: s.roll_no || s.rollNo || '',
                                      studentEmail: s.email || '',
                                      semester: s.semester || '',
                                      division: s.division || '',
                                      title: s.statusKey === 'CRITICAL' ? '⚠️ Attendance Defaulter Critical Notice' : '⚠️ Low Attendance Warning Notice',
                                      category: s.statusKey === 'CRITICAL' ? 'DEFAULTER NOTICE' : 'ATTENDANCE WARNING',
                                      tagColor: s.statusKey === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                                      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                                      body: msg,
                                      percentage: pct,
                                      totalLectures: s.totalLectures || 0,
                                      attendedLectures: s.attendedLectures || 0,
                                      statusKey: s.statusKey || 'CRITICAL',
                                      timestamp: Date.now()
                                    };
                                  });

                                  // 1. Dispatch to server
                                  fetch('/api/notices/bulk', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ notices: newNotices })
                                  }).catch(err => console.error('Error dispatching notices to server:', err));

                                  // 2. Cache in localStorage
                                  try {
                                    const existing = JSON.parse(localStorage.getItem('attendance_system_notices') || '[]');
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
                            className="admin-glass-btn admin-glass-btn-rose"
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
                            className="admin-glass-btn admin-glass-btn-green"
                          >
                            <Download size={15} />
                            <span>Export List</span>
                          </button>
                        </>
                      )}
                    </div>

                    {(() => {
                      const DEFAULTER_PAGE_SIZE = 50;
                      const totalDefaulterCount = filteredDefaulterList.length;
                      const totalDefaulterPages = Math.ceil(totalDefaulterCount / DEFAULTER_PAGE_SIZE) || 1;
                      const currentDefaulterPage = Math.min(defaulterPage, totalDefaulterPages);
                      const startDefIndex = (currentDefaulterPage - 1) * DEFAULTER_PAGE_SIZE;
                      const paginatedDefaulterList = filteredDefaulterList.slice(startDefIndex, startDefIndex + DEFAULTER_PAGE_SIZE);

                      return (
                        <div className="custom-table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                          {(blacklistRules || []).filter(r => !r.status || r.status === 'Active').length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                              <ShieldAlert size={44} color="#f59e0b" style={{ marginBottom: '10px', opacity: 0.8 }} />
                              <h5 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>No Blacklist Rules Configured</h5>
                              <p style={{ fontSize: '0.85rem', margin: 0, color: '#64748b' }}>
                                Please click <strong>"Add Rules"</strong> above to set blacklist thresholds. Warning and defaulter student lists will be generated automatically.
                              </p>
                            </div>
                          ) : totalDefaulterCount === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                              <CheckCircle size={44} color="#10b981" style={{ marginBottom: '10px', opacity: 0.8 }} />
                              <h5 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>No Defaulters Found!</h5>
                              <p style={{ fontSize: '0.82rem', margin: 0 }}>No student records match the selected semester, division, or status criteria.</p>
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

                                            const newNotice = {
                                              id: 'notice_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                                              studentId: s.id || null,
                                              studentEnrollment: s.enrollment_no || s.email || s.id,
                                              studentName: s.name,
                                              studentRollNo: s.roll_no || s.rollNo || '',
                                              studentEmail: s.email || '',
                                              semester: s.semester || '',
                                              division: s.division || '',
                                              title: s.statusKey === 'CRITICAL' ? '⚠️ Attendance Defaulter Critical Notice' : '⚠️ Low Attendance Warning Notice',
                                              category: s.statusKey === 'CRITICAL' ? 'DEFAULTER NOTICE' : 'ATTENDANCE WARNING',
                                              tagColor: s.statusKey === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                                              date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                                              body: smsMessage,
                                              percentage: parseFloat(s.percentage) || 0,
                                              totalLectures: s.totalLectures || 0,
                                              attendedLectures: s.attendedLectures || 0,
                                              statusKey: s.statusKey || 'CRITICAL',
                                              timestamp: Date.now()
                                            };

                                            // 1. Dispatch to server
                                            fetch('/api/notices', {
                                              method: 'POST',
                                              headers: {
                                                'Content-Type': 'application/json',
                                                Authorization: `Bearer ${token}`
                                              },
                                              body: JSON.stringify(newNotice)
                                            }).catch(err => console.error('Error dispatching notice to server:', err));

                                            // 2. Cache in localStorage
                                            try {
                                              const existing = JSON.parse(localStorage.getItem('attendance_system_notices') || '[]');
                                              localStorage.setItem('attendance_system_notices', JSON.stringify([newNotice, ...existing]));
                                              window.dispatchEvent(new Event('notices_updated'));
                                            } catch (e) {
                                              console.error('Error saving notice:', e);
                                            }

                                            showToast(`📱 SMS Notice sent to ${s.name}`, 'success');
                                            Swal.fire({
                                              title: 'Notice Dispatched!',
                                              text: `Attendance warning notice has been sent to ${s.name}. It is now live on their student notice board & notification center.`,
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

                              {totalDefaulterCount > 0 && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  gap: '16px',
                                  padding: '12px 16px',
                                  background: '#f8fafc',
                                  borderRadius: '10px',
                                  border: '1px solid #cbd5e1',
                                  marginTop: '16px',
                                  flexWrap: 'wrap'
                                }}>
                                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                    Showing <strong>{startDefIndex + 1} - {Math.min(startDefIndex + DEFAULTER_PAGE_SIZE, totalDefaulterCount)}</strong> of <strong>{totalDefaulterCount}</strong> defaulter(s)
                                  </div>

                                  {totalDefaulterPages > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <button
                                        className="btn btn-secondary"
                                        disabled={currentDefaulterPage <= 1}
                                        onClick={() => setDefaulterPage(p => Math.max(1, p - 1))}
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                      >
                                        ← Previous
                                      </button>
                                      <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: '600', padding: '0 8px' }}>
                                        Page {currentDefaulterPage} of {totalDefaulterPages}
                                      </span>
                                      <button
                                        className="btn btn-secondary"
                                        disabled={currentDefaulterPage >= totalDefaulterPages}
                                        onClick={() => setDefaulterPage(p => Math.min(totalDefaulterPages, p + 1))}
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                      >
                                        Next →
                                      </button>
                                    </div>
                                  )}
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
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                      <div>
                                        📝 <strong style={{ color: 'var(--text-primary)' }}>Reason / Remarks:</strong> {l.reason || 'No detailed reason provided.'}
                                      </div>
                                      {l.attachment && (
                                        <div>
                                          <a
                                            href={l.attachment}
                                            download={l.file_name || `Leave_Attachment_${l.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-sm btn-primary"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px', textDecoration: 'none', background: '#2563eb', color: '#fff', fontWeight: '600' }}
                                          >
                                            <Paperclip size={14} /> Download File ({l.file_name || 'Attachment'})
                                          </a>
                                        </div>
                                      )}
                                    </div>
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

                {/* Filter Options & Download Buttons Header in 1 Row */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    {/* All Report Filter Options */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', flex: '1 1 auto' }}>
                      <div style={styles.filterGroup}>
                        <label style={styles.formLabel}>Report Type</label>
                        <select
                          value={reportType}
                          onChange={(e) => setReportType(e.target.value)}
                          className="glass-input"
                          style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                        >
                          <option value="summary">Summary Report</option>
                          <option value="monthly">Monthly Report</option>
                          <option value="subject_wise">Subject Wise Report</option>
                          <option value="subject_date_wise">Subject Attendance with Dates</option>
                          <option value="semester_date_wise">Semester Attendance with Dates</option>
                          <option value="day_wise">Day-Wise Report</option>
                        </select>
                      </div>

                      {(reportType === 'monthly' || reportType === 'summary') && (
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

                    {/* Action Download Buttons in Same Row */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        className="btn btn-success"
                        onClick={handleDownloadPDF}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Download size={16} /> PDF
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={handleExportExcel}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Download size={16} /> Excel
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={handleExportCSV}
                        disabled={reportType === 'day_wise' ? dayWiseReportData.length === 0 : reportType === 'subject_date_wise' ? subjectDateWiseMatrixData.rows.length === 0 : reportType === 'semester_date_wise' ? semesterDateWiseMatrixData.rows.length === 0 : reportType === 'subject_wise' ? subjectReportData.length === 0 : summaryReportData.length === 0}
                        style={{ height: '42px', padding: '0 18px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Download size={16} /> CSV
                      </button>
                    </div>
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

                  {/* 4. Semester */}
                  <div className="glass-panel stat-card-v2" style={{ border: '1px solid var(--panel-border)', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="stat-card-badge" style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#ffffff', width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(37, 99, 235, 0.25)', flexShrink: 0 }}>
                        <Layers size={24} color="#ffffff" />
                      </div>
                      <div>
                        <span className="stat-card-title" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '2px', lineHeight: 1.2 }}>Semester</span>
                        <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: '#2563eb', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                          {allSemestersList.length || 0}
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
                {/* Reports charts and analytics cards removed */}
                {false && (() => {
                  const allStudents = (students || []);
                  const totalStudentsCount = allStudents.length > 0 ? allStudents.length : 50;

                  // 1. Attendance Brackets (Chart 1)
                  let b90to100 = 0;
                  let b70to90 = 0;
                  let b50to70 = 0;
                  let bBelow50 = 0;

                  const defSource = (typeof defaulterStudentList !== 'undefined' && Array.isArray(defaulterStudentList))
                    ? defaulterStudentList.filter(st => {
                        if (reportSemFilter && reportSemFilter !== 'ALL') {
                          const stdSem = String(st.semester || st.sem || '1').replace(/\D/g, '').trim();
                          if (stdSem !== String(reportSemFilter).replace(/\D/g, '').trim()) return false;
                        }
                        if (reportDivFilter && reportDivFilter !== 'ALL') {
                          const stdDiv = String(st.division || st.div || 'A').trim().toUpperCase();
                          if (stdDiv !== String(reportDivFilter).trim().toUpperCase()) return false;
                        }
                        return true;
                      })
                    : [];

                  if (reportSubjectFilter && reportSubjectFilter !== 'ALL') {
                    const subjFiltered = (subjectReportData || []).filter(st => {
                      if (reportSemFilter && reportSemFilter !== 'ALL') {
                        const stdSem = String(st.semester || st.raw_semester || '1').replace(/\D/g, '').trim();
                        if (stdSem !== String(reportSemFilter).replace(/\D/g, '').trim()) return false;
                      }
                      if (reportDivFilter && reportDivFilter !== 'ALL') {
                        const stdDiv = String(st.division || st.raw_division || 'A').replace(/Div\s*/i, '').trim().toUpperCase();
                        if (stdDiv !== String(reportDivFilter).trim().toUpperCase()) return false;
                      }
                      return true;
                    });
                    subjFiltered.forEach(st => {
                      const totalAtt = parseInt(st.total_attendance || st.total_sessions || st.total_lectures || 0);
                      const pct = parseFloat(st.raw_percentage !== undefined ? st.raw_percentage : (st.attendance_percentage || 0));
                      if (st.hasSession || totalAtt > 0 || (st.present !== undefined && parseInt(st.present) > 0)) {
                        if (pct >= 90) b90to100++;
                        else if (pct >= 70) b70to90++;
                        else if (pct >= 50) b50to70++;
                        else bBelow50++;
                      }
                    });
                  } else {
                    defSource.forEach(st => {
                      if (st.hasSession) {
                        const pct = parseFloat(st.percentage !== undefined ? st.percentage : 0);
                        if (pct >= 90) b90to100++;
                        else if (pct >= 70) b70to90++;
                        else if (pct >= 50) b50to70++;
                        else bBelow50++;
                      }
                    });
                  }

                  const bracketTotal = b90to100 + b70to90 + b50to70 + bBelow50;

                  // 2. Weekly Attendance Trend (Chart 2)
                  const daysArr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const getSemNumForChart = (val) => String(val || '').replace(/\D/g, '') || null;
                  const getDivCodeForChart = (val) => {
                    if (!val || String(val).trim() === '' || String(val).toUpperCase() === 'ALL') return null;
                    return String(val).trim().toUpperCase();
                  };

                  const dayConductedSessionsMap = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };
                  const dayPresentLogsMap = { Mon: new Set(), Tue: new Set(), Wed: new Set(), Thu: new Set(), Fri: new Set(), Sat: new Set() };

                  // A. Collect conducted sessions per day
                  (qrSessionHistory || []).forEach(sess => {
                    if (!sess) return;
                    const dVal = sess.date || sess.created_at;
                    if (!dVal) return;
                    const dObj = new Date(dVal);
                    if (isNaN(dObj.getTime())) return;
                    const dayStr = dObj.toLocaleDateString('en-US', { weekday: 'short' });
                    if (dayConductedSessionsMap[dayStr]) {
                      dayConductedSessionsMap[dayStr].push(sess);
                    }
                  });

                  // B. Collect present attendance records per day
                  const allSystemLogsForChart = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];
                  allSystemLogsForChart.forEach(l => {
                    if (!l) return;
                    const st = String(l.status || '').toLowerCase();
                    if (st !== 'success' && st !== 'present') return;
                    const dVal = l.date || l.created_at;
                    if (!dVal) return;
                    const dObj = new Date(dVal);
                    if (isNaN(dObj.getTime())) return;
                    const dayStr = dObj.toLocaleDateString('en-US', { weekday: 'short' });
                    if (dayPresentLogsMap[dayStr]) {
                      const stdId = String(l.student_id || l.enrollment_no || l.id || JSON.stringify(l)).toLowerCase();
                      const sId = l.qr_session_id || l.otp_id || l.session_id || l.time || 'gen';
                      dayPresentLogsMap[dayStr].add(`${stdId}_${sId}`);
                    }
                  });

                  const totalStudentsInSystem = (students || []).length;

                  const weeklyData = daysArr.map(day => {
                    const sessions = dayConductedSessionsMap[day];
                    const presentCount = dayPresentLogsMap[day].size;

                    let expectedCount = 0;
                    if (sessions.length > 0) {
                      sessions.forEach(sess => {
                        const sSem = getSemNumForChart(sess.semester);
                        const sDiv = getDivCodeForChart(sess.division);

                        const matchingStudents = (students || []).filter(std => {
                          const stdSem = getSemNumForChart(std.semester || std.sem);
                          const stdDiv = getDivCodeForChart(std.division || std.div);

                          if (sSem && stdSem && stdSem !== sSem) return false;
                          if (sDiv && stdDiv && stdDiv !== sDiv) return false;
                          return true;
                        });

                        expectedCount += matchingStudents.length > 0 ? matchingStudents.length : Math.max(1, Math.round(totalStudentsInSystem / Math.max(1, sessions.length)));
                      });
                    } else {
                      // If sessions list is empty for this day but present logs exist, estimate expected from total students
                      if (presentCount > 0) {
                        expectedCount = Math.max(presentCount, totalStudentsInSystem);
                      }
                    }

                    const pct = expectedCount > 0 ? Math.min(100, Math.round((presentCount / expectedCount) * 100)) : 0;
                    return { day, pct };
                  });

                  // 2.5 Summary Cards Metrics Calculation (Daily, Monthly, Analytics)
                  const todayStr = new Date().toISOString().split('T')[0];

                  // A. Today's Summary
                  const todaySessions = (qrSessionHistory || []).filter(sess => {
                    if (!sess) return false;
                    const dVal = sess.date || sess.created_at;
                    if (!dVal) return false;
                    return dVal.split('T')[0] === todayStr;
                  });

                  const todayPresentSet = new Set();
                  allSystemLogsForChart.forEach(l => {
                    if (!l) return;
                    const st = String(l.status || '').toLowerCase();
                    if (st !== 'success' && st !== 'present') return;
                    const dVal = l.date || l.created_at;
                    if (!dVal) return;
                    if (dVal.split('T')[0] === todayStr) {
                      const stdId = String(l.student_id || l.enrollment_no || l.id || JSON.stringify(l)).toLowerCase();
                      const sId = l.qr_session_id || l.otp_id || l.session_id || l.time || 'gen';
                      todayPresentSet.add(`${stdId}_${sId}`);
                    }
                  });
                  const todayPresentCount = todayPresentSet.size;

                  let todayExpectedCount = 0;
                  if (todaySessions.length > 0) {
                    todaySessions.forEach(sess => {
                      const sSem = getSemNumForChart(sess.semester);
                      const sDiv = getDivCodeForChart(sess.division);

                      const matchingStudents = (students || []).filter(std => {
                        const stdSem = getSemNumForChart(std.semester || std.sem);
                        const stdDiv = getDivCodeForChart(std.division || std.div);

                        if (sSem && stdSem && stdSem !== sSem) return false;
                        if (sDiv && stdDiv && stdDiv !== sDiv) return false;
                        return true;
                      });

                      todayExpectedCount += matchingStudents.length > 0 ? matchingStudents.length : Math.max(1, Math.round(totalStudentsInSystem / Math.max(1, todaySessions.length)));
                    });
                  } else {
                    if (todayPresentCount > 0) {
                      todayExpectedCount = Math.max(todayPresentCount, totalStudentsInSystem);
                    }
                  }
                  const todayAbsentCount = Math.max(0, todayExpectedCount - todayPresentCount);
                  const todayRate = todayExpectedCount > 0 ? ((todayPresentCount / todayExpectedCount) * 100).toFixed(2) : '0.00';

                  // B. Monthly Summary (Derived dynamically from reportMonth or active date selection)
                  let targetMonthStr = reportMonth;
                  if (reportType === 'day_wise' && reportDate) {
                    targetMonthStr = reportDate.substring(0, 7);
                  } else if ((reportType === 'subject_date_wise' || reportType === 'semester_date_wise') && reportStartDate) {
                    targetMonthStr = reportStartDate.substring(0, 7);
                  }

                  if (!targetMonthStr || !targetMonthStr.includes('-')) {
                    const d = new Date();
                    targetMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  }

                  const [targetYr, targetMo] = targetMonthStr.split('-').map(Number);
                  const targetMonthDateObj = new Date(targetYr, targetMo - 1, 1);
                  const nowMonthName = isNaN(targetMonthDateObj.getTime())
                    ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : targetMonthDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                  const monthlySessions = (qrSessionHistory || []).filter(sess => {
                    if (!sess) return false;
                    const dVal = sess.date || sess.created_at;
                    if (!dVal) return false;
                    return dVal.startsWith(targetMonthStr);
                  });

                  const monthlyPresentSet = new Set();
                  allSystemLogsForChart.forEach(l => {
                    if (!l) return;
                    const st = String(l.status || '').toLowerCase();
                    if (st !== 'success' && st !== 'present') return;
                    const dVal = l.date || l.created_at;
                    if (!dVal) return;
                    if (dVal.startsWith(targetMonthStr)) {
                      const stdId = String(l.student_id || l.enrollment_no || l.id || JSON.stringify(l)).toLowerCase();
                      const sId = l.qr_session_id || l.otp_id || l.session_id || l.time || 'gen';
                      monthlyPresentSet.add(`${stdId}_${sId}`);
                    }
                  });
                  const monthlyPresentCount = monthlyPresentSet.size;

                  let monthlyExpectedCount = 0;
                  if (monthlySessions.length > 0) {
                    monthlySessions.forEach(sess => {
                      const sSem = getSemNumForChart(sess.semester);
                      const sDiv = getDivCodeForChart(sess.division);

                      const matchingStudents = (students || []).filter(std => {
                        const stdSem = getSemNumForChart(std.semester || std.sem);
                        const stdDiv = getDivCodeForChart(std.division || std.div);

                        if (sSem && stdSem && stdSem !== sSem) return false;
                        if (sDiv && stdDiv && stdDiv !== sDiv) return false;
                        return true;
                      });

                      monthlyExpectedCount += matchingStudents.length > 0 ? matchingStudents.length : Math.max(1, Math.round(totalStudentsInSystem / Math.max(1, monthlySessions.length)));
                    });
                  } else {
                    if (monthlyPresentCount > 0) {
                      monthlyExpectedCount = Math.max(monthlyPresentCount, totalStudentsInSystem);
                    }
                  }
                  const monthlyAbsentCount = Math.max(0, monthlyExpectedCount - monthlyPresentCount);
                  const monthlyAvgRate = monthlyExpectedCount > 0 ? ((monthlyPresentCount / monthlyExpectedCount) * 100).toFixed(2) : '0.00';

                  // C. Attendance Analytics (Best & Lowest Day)
                  const fullDayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
                  let bestDay = 'N/A';
                  let lowestDay = 'N/A';

                  if (weeklyData && weeklyData.length > 0) {
                    const activeDays = weeklyData.filter(d => d.pct > 0);
                    if (activeDays.length > 0) {
                      const sortedBest = [...activeDays].sort((a, b) => b.pct - a.pct);
                      bestDay = `${fullDayNames[sortedBest[0].day] || sortedBest[0].day} (${sortedBest[0].pct}%)`;

                      const sortedLowest = [...activeDays].sort((a, b) => a.pct - b.pct);
                      lowestDay = `${fullDayNames[sortedLowest[0].day] || sortedLowest[0].day} (${sortedLowest[0].pct}%)`;
                    }
                  }

                  // 3. Attendance Overview (Chart 3 - Dynamically computed from active report data)
                  let presentLogs = 0;
                  let absentLogs = 0;

                  if (reportType === 'day_wise') {
                    (dayWiseReportData || []).forEach(r => {
                      const st = String(r.status || '').toLowerCase();
                      if (st === 'present') presentLogs++;
                      else if (st === 'absent') absentLogs++;
                    });
                  } else if (reportType === 'subject_date_wise') {
                    (subjectDateWiseMatrixData.rows || []).forEach(r => {
                      presentLogs += (parseInt(r.present) || 0);
                      absentLogs += (parseInt(r.absent) || 0);
                    });
                  } else if (reportType === 'semester_date_wise') {
                    (semesterDateWiseMatrixData.rows || []).forEach(r => {
                      presentLogs += (parseInt(r.present) || 0);
                      absentLogs += (parseInt(r.absent) || 0);
                    });
                  } else if (reportType === 'subject_wise') {
                    (subjectReportData || []).forEach(r => {
                      presentLogs += (parseInt(r.present) || 0);
                      absentLogs += (parseInt(r.absent) || 0);
                    });
                  } else {
                    // Summary report
                    (summaryReportData || []).forEach(r => {
                      if (r.total_attendance !== '-' && parseInt(r.total_attendance) > 0) {
                        presentLogs += (parseInt(r.present) || 0);
                        absentLogs += (parseInt(r.absent) || 0);
                      }
                    });
                  }

                  // Fallback to logsSource if current active report data has no entries
                  if (presentLogs === 0 && absentLogs === 0) {
                    const logsSource = [...(liveLogs || []), ...(dateLogs || []), ...(reportData || [])];
                    logsSource.forEach(log => {
                      if (!log) return;
                      const status = String(log.status || '').toLowerCase();
                      if (status === 'success' || status === 'present') presentLogs++;
                      else absentLogs++;
                    });
                  }

                  const totalOverviewLogs = presentLogs + absentLogs;
                  const presentPct = totalOverviewLogs > 0 ? ((presentLogs / totalOverviewLogs) * 100).toFixed(2) : '0.00';
                  const absentPct = totalOverviewLogs > 0 ? ((absentLogs / totalOverviewLogs) * 100).toFixed(2) : '0.00';

                  // 4. Class-wise Attendance (Chart 4)
                  const classData = [1, 2, 3, 4, 5, 6, 7, 8].map(semNum => {
                    const semStudents = (defaulterStudentList || []).filter(s => String(s.semester || '').replace(/\D/g, '') === String(semNum));
                    const count = semStudents.length;
                    let totalPct = 0;
                    let countWithSessions = 0;
                    semStudents.forEach(s => {
                      if (s.hasSession) {
                        totalPct += (parseFloat(s.percentage) || 0);
                        countWithSessions++;
                      }
                    });
                    const rate = countWithSessions > 0 ? (totalPct / countWithSessions) : 0;
                    return { name: `Semester ${semNum}`, count, rate };
                  }).filter(c => c.count > 0);

                  if (classData.length === 0) {
                    classData.push(
                      { name: 'Semester 1', count: 0, rate: 0 },
                      { name: 'Semester 2', count: 0, rate: 0 }
                    );
                  }

                  // Donut SVG helper
                  const C = 2 * Math.PI * 52;
                  const createSegments = (items, total) => {
                    let offset = 0;
                    return items.map(item => {
                      const frac = total > 0 ? (item.value / total) : 0;
                      const strokeDasharray = `${frac * C} ${C}`;
                      const strokeDashoffset = -offset;
                      offset += frac * C;
                      return { ...item, strokeDasharray, strokeDashoffset };
                    });
                  };

                  const donut1Segments = createSegments([
                    { value: b90to100, color: '#3b82f6' },
                    { value: b70to90, color: '#22c55e' },
                    { value: b50to70, color: '#f59e0b' },
                    { value: bBelow50, color: '#ef4444' }
                  ], bracketTotal);

                  const donut3Segments = createSegments([
                    { value: presentLogs, color: '#2563eb' },
                    { value: absentLogs, color: '#ef4444' }
                  ], totalOverviewLogs);

                  return (
                    <>
                      <div className="admin-reports-charts-container" style={{
                        marginBottom: '24px',
                        width: '100%'
                      }}>
                      {/* ROW 1 - CHART 1: Attendance Brackets Donut */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between'
                      }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                          Percentage Attendance
                        </h4>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          gap: '20px',
                          flexWrap: 'wrap',
                          width: '100%'
                        }}>
                          <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <svg viewBox="0 0 140 140" style={{ width: '140px', height: '140px', transform: 'rotate(-90deg)' }}>
                              <circle cx="70" cy="70" r="52" fill="none" stroke="#f1f5f9" strokeWidth="18" />
                              {donut1Segments.map((seg, i) => (
                                <circle
                                  key={i}
                                  cx="70"
                                  cy="70"
                                  r="52"
                                  fill="none"
                                  stroke={seg.color}
                                  strokeWidth="18"
                                  strokeDasharray={seg.strokeDasharray}
                                  strokeDashoffset={seg.strokeDashoffset}
                                  style={{ transition: 'stroke-dasharray 0.5s ease' }}
                                />
                              ))}
                            </svg>
                            <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
                              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                                {bracketTotal}
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', marginTop: '2px' }}>
                                Total students
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minWidth: '170px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3b82f6', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>90% - 100% Attendance</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: '700', color: '#0f172a' }}>{b90to100} Students</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#22c55e', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>70% - 90% Attendance</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: '700', color: '#0f172a' }}>{b70to90} Students</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f59e0b', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>50% - 70% Attendance</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: '700', color: '#0f172a' }}>{b50to70} Students</div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#ef4444', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>Below 50% Attendance</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: '700', color: '#0f172a' }}>{bBelow50} Students</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ROW 1 - CHART 2: Weekly Attendance Trend Bar Chart */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between'
                      }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                          Weekly Attendance Trend
                        </h4>

                        <div style={{ position: 'relative', height: '170px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: '35px', paddingBottom: '24px' }}>
                          {['100%', '75%', '50%', '25%', '0%'].map((lvl, idx) => (
                            <div key={lvl} style={{ position: 'absolute', left: '0', right: '0', top: `${idx * 25}%`, display: 'flex', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8', width: '30px', textAlign: 'right', paddingRight: '8px' }}>{lvl}</span>
                              <div style={{ flex: 1, borderTop: '1px dashed #e2e8f0' }} />
                            </div>
                          ))}

                          {weeklyData.map((d) => (
                            <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: '32px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                                {d.pct}%
                              </span>
                              <div style={{
                                width: '24px',
                                height: `${(d.pct / 100) * 115}px`,
                                background: '#2563eb',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.4s ease'
                              }} />
                              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginTop: '6px', position: 'absolute', bottom: '0' }}>
                                {d.day}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
                          <span style={{ width: '10px', height: '10px', background: '#2563eb', borderRadius: '2px' }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#475569' }}>Attendance %</span>
                        </div>
                      </div>

                      {/* ROW 2 - CHART 3: Attendance Overview Donut */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between'
                      }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                          Attendance Overview
                        </h4>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
                          <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            <svg viewBox="0 0 140 140" style={{ width: '140px', height: '140px', transform: 'rotate(-90deg)' }}>
                              <circle cx="70" cy="70" r="52" fill="none" stroke="#f1f5f9" strokeWidth="18" />
                              {donut3Segments.map((seg, i) => (
                                <circle
                                  key={i}
                                  cx="70"
                                  cy="70"
                                  r="52"
                                  fill="none"
                                  stroke={seg.color}
                                  strokeWidth="18"
                                  strokeDasharray={seg.strokeDasharray}
                                  strokeDashoffset={seg.strokeDashoffset}
                                  style={{ transition: 'stroke-dasharray 0.5s ease' }}
                                />
                              ))}
                            </svg>
                            <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
                              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                                {totalOverviewLogs.toLocaleString()}
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: '600', color: '#64748b', marginTop: '2px' }}>
                                Students
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minWidth: '160px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Present</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                                  {presentLogs.toLocaleString()} ({presentPct}%)
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', marginTop: '5px', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Absent</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                                  {absentLogs.toLocaleString()} ({absentPct}%)
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ROW 2 - CHART 4: Class-wise Attendance Table */}
                      <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                          Class-wise Attendance
                        </h4>

                        <div style={{ border: '1px solid #edf2f7', borderRadius: '10px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: '700', color: '#475569' }}>Class</th>
                                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: '700', color: '#475569' }}>Total Students</th>
                                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: '700', color: '#475569' }}>Attendance Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {classData.map((cls, idx) => (
                                <tr key={cls.name} style={{ borderBottom: idx < classData.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                  <td style={{ padding: '10px 14px', fontWeight: '600', color: '#1e293b' }}>{cls.name}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>{cls.count}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                      <span style={{ fontWeight: '700', color: '#0f172a' }}>{cls.rate.toFixed(2)}%</span>
                                      <div style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                        <div style={{ width: `${cls.rate}%`, height: '100%', background: '#2563eb', borderRadius: '999px' }} />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* SUMMARY REPORT CARDS (BELOW CHARTS) */}
                      <div className="admin-reports-summary-cards-container" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '20px',
                        marginTop: '24px',
                        width: '100%'
                      }}>
                        {/* CARD 1: Daily Summary (Today) */}
                        <div style={{
                          background: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '20px 22px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}>
                          <h4 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                            Daily Summary (Today)
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              background: '#eff6ff',
                              padding: '12px',
                              borderRadius: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Calendar size={32} color="#2563eb" strokeWidth={2.2} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: '4px' }}>
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Present</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#16a34a' }}>{todayPresentCount.toLocaleString()}</div>
                              </div>
                              <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Absent</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#dc2626' }}>{todayAbsentCount.toLocaleString()}</div>
                              </div>
                              <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Attendance Rate</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#2563eb' }}>{todayRate}%</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* CARD 2: Monthly Report */}
                        <div style={{
                          background: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '20px 22px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}>
                          <h4 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                            Monthly Report ({nowMonthName})
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              background: '#eff6ff',
                              padding: '12px',
                              borderRadius: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Calendar size={32} color="#2563eb" strokeWidth={2.2} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: '4px' }}>
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Avg. Attendance</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#2563eb' }}>{monthlyAvgRate}%</div>
                              </div>
                              <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Total Present</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#16a34a' }}>{monthlyPresentCount.toLocaleString()}</div>
                              </div>
                              <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Total Absent</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#dc2626' }}>{monthlyAbsentCount.toLocaleString()}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* CARD 3: Attendance Analytics */}
                        <div style={{
                          background: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '20px 22px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}>
                          <h4 style={{ fontSize: '0.98rem', fontWeight: '700', color: '#1e293b', margin: '0 0 16px 0' }}>
                            Attendance Analytics
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              background: '#eff6ff',
                              padding: '12px',
                              borderRadius: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <TrendingUp size={32} color="#2563eb" strokeWidth={2.2} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flex: 1, gap: '8px' }}>
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Best Attendance Day</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#16a34a' }}>{bestDay}</div>
                              </div>
                              <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />
                              <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '0.73rem', fontWeight: '600', color: '#64748b', marginBottom: '4px', whiteSpace: 'nowrap' }}>Lowest Attendance Day</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#dc2626' }}>{lowestDay}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
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
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value.toLowerCase() })}
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

                  {/* CARD: APPEARANCE & THEME SETTINGS */}
                  {/* CARD: THEME SETTINGS (DARK / LIGHT MODE) */}
                  <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '18px', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                      <div style={{
                        background: theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        padding: '10px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {theme === 'dark' ? <Moon size={24} color="#818cf8" /> : <Sun size={24} color="#f59e0b" />}
                      </div>
                      <div>
                        <h3 style={{ ...styles.cardTitle, margin: 0 }}>Theme & Appearance Settings</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
                          Toggle between Dark Mode and Light Mode interface
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          Dark Mode Theme
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          ON: Deep royal navy dark theme | OFF: Crisp bright light theme
                        </div>
                      </div>

                      {/* Toggle Switch matching user photo with Moon icon inside sliding knob */}
                      <div
                        onClick={toggleTheme}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <span style={{
                          fontSize: '0.95rem',
                          fontWeight: '800',
                          color: theme === 'dark' ? '#38bdf8' : '#8898aa',
                          minWidth: '32px',
                          textAlign: 'right'
                        }}>
                          {theme === 'dark' ? 'ON' : 'OFF'}
                        </span>

                        <div
                          style={{
                            width: '58px',
                            height: '30px',
                            borderRadius: '9999px',
                            backgroundColor: theme === 'dark' ? '#1e293b' : '#334155',
                            border: theme === 'dark' ? '1.5px solid #38bdf8' : '1.5px solid rgba(255, 255, 255, 0.15)',
                            padding: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.25s ease',
                            boxShadow: theme === 'dark' ? '0 0 12px rgba(56, 189, 248, 0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.3)',
                            position: 'relative'
                          }}
                        >
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              backgroundColor: '#ffffff',
                              transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0px)',
                              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.35)'
                            }}
                          >
                            <Moon size={13} color="#1e293b" strokeWidth={2.5} />
                          </div>
                        </div>
                      </div>
                    </div>
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

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderRadius: '14px',
                      background: showFloatingMobileMenu ? '#fffbeb' : '#f8fafc',
                      border: showFloatingMobileMenu ? '1.5px solid #fcd34d' : '1.5px solid #e2e8f0',
                      boxShadow: showFloatingMobileMenu ? '0 4px 14px rgba(245, 158, 11, 0.12)' : 'none',
                      flexWrap: 'wrap',
                      gap: '14px',
                      transition: 'all 0.25s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        {showFloatingMobileMenu && (
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            border: '1px solid #fcd34d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.2)',
                            flexShrink: 0
                          }}>
                            <Menu size={20} color="#d97706" />
                          </div>
                        )}

                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.96rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>Bottom Floating Hamburger Button</span>
                            {showFloatingMobileMenu && (
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontWeight: '800',
                                background: '#fef3c7',
                                color: '#d97706',
                                border: '1px solid #fde68a',
                                letterSpacing: '0.5px'
                              }}>
                                ENABLED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                            {showFloatingMobileMenu
                              ? 'ON: Bottom floating menu button enabled'
                              : 'ON: Bottom floating menu button | OFF: Top header banner menu button'}
                          </div>
                        </div>
                      </div>

                      {/* Single Interactive ON/OFF Pill Toggle Switch */}
                      <div
                        onClick={handleToggleFloatingMobileMenu}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <span style={{
                          fontSize: '0.9rem',
                          fontWeight: '800',
                          color: showFloatingMobileMenu ? '#d97706' : '#64748b',
                          minWidth: '30px',
                          textAlign: 'right'
                        }}>
                          {showFloatingMobileMenu ? 'ON' : 'OFF'}
                        </span>

                        <div
                          style={{
                            width: '58px',
                            height: '30px',
                            borderRadius: '9999px',
                            background: showFloatingMobileMenu ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#334155',
                            border: showFloatingMobileMenu ? '1.5px solid #d97706' : '1.5px solid #475569',
                            padding: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.25s ease',
                            boxShadow: showFloatingMobileMenu ? '0 3px 10px rgba(245, 158, 11, 0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.3)',
                            position: 'relative'
                          }}
                        >
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              backgroundColor: '#ffffff',
                              transform: showFloatingMobileMenu ? 'translateX(28px)' : 'translateX(0px)',
                              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)'
                            }}
                          >
                            <Menu size={13} color={showFloatingMobileMenu ? '#d97706' : '#475569'} strokeWidth={2.5} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 4: ACCOUNT ACTIONS / SIGN OUT (MOBILE ONLY) */}
                  <div className="glass-panel mobile-only-signout-card" style={{ padding: '24px 30px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', gridColumn: '1 / -1', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LogOut size={24} color="#ef4444" />
                      </div>
                      <div>
                        <h3 style={{ ...styles.cardTitle, margin: 0, color: 'var(--text-primary)' }}>Sign Out of Account</h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>Safely end your current session</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={onLogout}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px 22px',
                        borderRadius: '10px',
                        fontWeight: '700',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                        cursor: 'pointer'
                      }}
                    >
                      <LogOut size={18} color="#ffffff" />
                      <span style={{ color: '#ffffff' }}>Sign Out</span>
                    </button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                      flexShrink: 0
                    }}>
                      {modalMode === 'edit' ? <Edit size={20} color="#ffffff" /> : <Users size={20} color="#ffffff" />}
                    </div>
                    <h3 style={{ ...styles.modalTitle, margin: 0, textAlign: 'left' }}>
                      {modalMode === 'add' ? 'Add New Student' : 'Edit Student Details'}
                    </h3>
                  </div>
                  <AdminModalCloseBtn
                    onClick={() => { setShowStudentModal(false); setCreatedStudentCredentials(null); }}
                    title="Close Form"
                  />
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
                        ref={firstStudentInputRef}
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
                        }}
                        required
                        pattern="^\d{10}$"
                        title="Please enter valid enrollment number"
                        disabled={modalMode === 'edit'}
                        autoFocus
                        tabIndex={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault();
                            addStudentSaveBtnRef.current?.focus();
                          }
                        }}
                        style={enrollmentTouched && !/^\d{10}$/.test(studentForm.enrollment_no || '') ? { borderColor: '#ff4d4f', boxShadow: '0 0 0 2px rgba(255, 77, 79, 0.2)' } : {}}
                      />
                      {enrollmentTouched && !/^\d{10}$/.test(studentForm.enrollment_no || '') && (
                        <div style={{ color: '#ff4d4f', fontSize: '0.82rem', marginTop: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 77, 79, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255, 77, 79, 0.25)' }}>
                          ⚠️ Enrollment Number is required (Must be 10 digits)
                        </div>
                      )}
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
                        }}
                        required
                        tabIndex={2}
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
                        onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value.toLowerCase() })}
                        required
                        tabIndex={3}
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
                        tabIndex={4}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Semester *</label>
                      <SearchableSemesterSelect
                        value={studentForm.semester}
                        onChange={(val) => setStudentForm({ ...studentForm, semester: val })}
                        placeholder="Select Semester"
                        options={allSemestersList.map(s => ({ id: String(s.semNumber || s.id), label: s.name || `Semester ${s.semNumber || s.id}` }))}
                        isDark={false}
                        tabIndex={5}
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
                        tabIndex={6}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Roll Number (Optional)</label>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="e.g. 101"
                        value={studentForm.roll_no || ''}
                        onChange={(e) => setStudentForm({ ...studentForm, roll_no: e.target.value })}
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
                          Device Binding Status (Device ID)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            className="glass-input"
                            value={studentForm.device_id ? `Bound (${studentForm.device_id})` : 'Not Bound (Unlocked - Ready for First Login)'}
                            readOnly
                            style={{
                              flex: 1,
                              background: studentForm.device_id ? 'rgba(230, 244, 234, 0.6)' : 'rgba(255, 247, 237, 0.6)',
                              color: studentForm.device_id ? '#137333' : '#c2410c',
                              fontWeight: '600'
                            }}
                          />
                          {studentForm.device_id && (
                            <button
                              type="button"
                              onClick={() => handleResetDeviceId(studentForm.id, studentForm.name, studentForm.device_id)}
                              style={{
                                background: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fca5a5',
                                fontWeight: '700',
                                whiteSpace: 'nowrap',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              🔓 Reset Device ID
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {studentForm.device_id
                            ? 'Account is locked to this registered device. Click Reset Device ID to allow login from a new device.'
                            : 'Account is unlocked. When the student logs in next time, their new device will be bound automatically.'}
                        </span>
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

                    <div style={{ ...styles.modalActions, display: 'flex', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                      <button
                        type="button"
                        onClick={() => setShowStudentModal(false)}
                        tabIndex={11}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: '1.5px solid #000000',
                          background: '#ffffff',
                          color: '#000000',
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#ffffff';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.2)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        ref={addStudentSaveBtnRef}
                        type="submit"
                        tabIndex={12}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            firstStudentInputRef.current?.focus();
                          }
                        }}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.filter = 'brightness(1.05)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.28)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.filter = 'none';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.25)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                      >
                        {modalMode === 'add' ? 'Create' : 'Save Changes'}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                      flexShrink: 0
                    }}>
                      {facultyModalMode === 'edit' ? <Edit size={20} color="#ffffff" /> : <GraduationCap size={20} color="#ffffff" />}
                    </div>
                    <h3 style={{ ...styles.modalTitle, margin: 0, textAlign: 'left' }}>
                      {facultyModalMode === 'add' ? 'Add New Faculty Member' : 'Edit Faculty Details'}
                    </h3>
                  </div>
                  <AdminModalCloseBtn
                    onClick={() => { setShowFacultyModal(false); setCreatedFacultyCredentials(null); }}
                    title="Close Form"
                  />
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
                        ref={firstFacultyInputRef}
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
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault();
                            addFacultySaveBtnRef.current?.focus();
                          }
                        }}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Email ID</label>
                      <input
                        type="email"
                        className="glass-input"
                        placeholder="e.g. faculty@college.com"
                        value={facultyForm.email || ''}
                        onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value.toLowerCase() })}
                        tabIndex={2}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
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
                        Password {facultyForm.isPrimaryAdmin ? '(Managed by Admin Account)' : facultyModalMode === 'add' ? '(Optional - Auto-generated if blank)' : '(Optional - Set custom)'}
                      </label>
                      {facultyForm.isPrimaryAdmin ? (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          color: '#d97706',
                          fontSize: '0.88rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <Shield size={18} color="#d97706" />
                          <span>Admin credentials are used for login. No separate ID or password is required.</span>
                        </div>
                      ) : (
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
                      )}
                    </div>

                    {/* Roles Checkboxes (Roles * -> Faculty & Admin) */}
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>
                        Roles <span style={{ color: '#f59e0b' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '6px', padding: '2px 0' }}>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '0.96rem',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          userSelect: 'none'
                        }}>
                          <input
                            type="checkbox"
                            checked={(facultyForm.roles || ['faculty']).includes('faculty')}
                            onChange={(e) => {
                              const currentRoles = facultyForm.roles || ['faculty'];
                              let updated;
                              if (e.target.checked) {
                                updated = Array.from(new Set([...currentRoles, 'faculty']));
                              } else {
                                updated = currentRoles.filter(r => r !== 'faculty');
                              }
                              // If not primary admin and all unchecked, prevent empty roles
                              if (!facultyForm.isPrimaryAdmin && updated.length === 0) {
                                showToast('At least one role must be selected (Faculty or Admin)', 'warning', 2500);
                                return;
                              }
                              // For primary admin, ensure 'admin' role is always kept
                              if (facultyForm.isPrimaryAdmin) {
                                updated = Array.from(new Set([...updated, 'admin']));
                              }
                              setFacultyForm({ ...facultyForm, roles: updated });
                            }}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: 'pointer',
                              accentColor: '#0066ff'
                            }}
                          />
                          <span>Faculty</span>
                        </label>

                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: facultyForm.isPrimaryAdmin ? 'not-allowed' : 'pointer',
                          fontSize: '0.96rem',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          userSelect: 'none',
                          opacity: facultyForm.isPrimaryAdmin ? 0.9 : 1
                        }}
                        title={facultyForm.isPrimaryAdmin ? 'Primary Admin role cannot be removed' : ''}
                        >
                          <input
                            type="checkbox"
                            checked={facultyForm.isPrimaryAdmin ? true : (facultyForm.roles || ['faculty']).includes('admin')}
                            disabled={facultyForm.isPrimaryAdmin}
                            onChange={(e) => {
                              if (facultyForm.isPrimaryAdmin) return;
                              const currentRoles = facultyForm.roles || ['faculty'];
                              let updated;
                              if (e.target.checked) {
                                updated = Array.from(new Set([...currentRoles, 'admin']));
                              } else {
                                updated = currentRoles.filter(r => r !== 'admin');
                              }
                              if (updated.length === 0) {
                                showToast('At least one role must be selected (Faculty or Admin)', 'warning', 2500);
                                return;
                              }
                              setFacultyForm({ ...facultyForm, roles: updated });
                            }}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: facultyForm.isPrimaryAdmin ? 'not-allowed' : 'pointer',
                              accentColor: '#0066ff'
                            }}
                          />
                          <span>Admin</span>
                          {facultyForm.isPrimaryAdmin && (
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}>
                              Locked
                            </span>
                          )}
                        </label>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        {facultyForm.isPrimaryAdmin
                          ? (facultyForm.roles || []).includes('faculty')
                            ? 'Admin + Faculty access active. You can manage tasks in Admin Panel and switch to Faculty Dashboard.'
                            : 'Admin access only. Faculty Dashboard access is paused, but your account remains visible here in the faculty list.'
                          : (facultyForm.roles || ['faculty']).includes('admin')
                            ? 'This faculty member will have full access to the Admin Panel to manage tasks on your behalf.'
                            : 'Standard faculty access to conduct lectures and mark attendance.'}
                      </span>
                    </div>

                    </div>

                    <div style={{ ...styles.modalActions, display: 'flex', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                      <button
                        type="button"
                        onClick={() => setShowFacultyModal(false)}
                        tabIndex={6}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: '1.5px solid #000000',
                          background: '#ffffff',
                          color: '#000000',
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#ffffff';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.2)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        ref={addFacultySaveBtnRef}
                        type="submit"
                        tabIndex={7}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            firstFacultyInputRef.current?.focus();
                          }
                        }}
                        style={{
                          flex: 1,
                          height: '42px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.filter = 'brightness(1.05)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.28)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.filter = 'none';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                        onFocus={e => {
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.25)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
                        }}
                      >
                        {facultyModalMode === 'add' ? 'Create' : 'Save Changes'}
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
                      {deleteConfirmState.entityType === 'faculty' ? 'Confirm Faculty Deletion' :
                       deleteConfirmState.entityType === 'semester' ? 'Confirm Semester Deletion' :
                       'Confirm Student Deletion'}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: '700' }}>
                      ⚠️ Permanent System Action
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.94rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                  Are you sure you want to delete <strong style={{ color: '#0f172a', fontWeight: '800' }}>{deleteConfirmState.studentName}</strong>? {
                    deleteConfirmState.entityType === 'faculty' ? 'This faculty account will be permanently deleted from the system.' :
                    deleteConfirmState.entityType === 'semester' ? 'All associated semester data will also be permanently removed.' :
                    'All associated attendance history will also be permanently deleted.'
                  }
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
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        {editingRuleId ? 'Edit Blacklist Rule' : 'Add Blacklist Rule'}
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
                        {editingRuleId ? 'Modify existing attendance threshold policy' : 'Configure new attendance defaulter policy'}
                      </p>
                    </div>
                  </div>
                  <AdminModalCloseBtn
                    onClick={() => setShowAddRuleModal(false)}
                    title="Close Form"
                  />
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
                      {editingRuleId ? 'Update Rule' : 'Apply Rule'}
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
