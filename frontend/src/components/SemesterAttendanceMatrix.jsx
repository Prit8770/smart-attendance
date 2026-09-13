import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, X, RotateCcw, RefreshCw, Folder, Layers, BookOpen,
  Filter, Calendar, Users, TrendingUp, CheckCircle, AlertTriangle,
  Clock, FileText, ArrowLeft, ArrowUpDown
} from 'lucide-react';
import AdminModalCloseBtn from './AdminModalCloseBtn';

/**
 * Clean Subject Title helper (removes codes like (101), [102], etc.)
 */
const cleanSubjectTitle = (sub) => {
  if (!sub) return 'Subject';
  return String(sub).replace(/\s*[\(\[][^()\[\]]*[\)\]]/g, '').trim() || sub;
};

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

/**
 * SemesterAttendanceMatrix
 * Renders the Master Student Absent & Present Grid Table for a given semester.
 * Matches Photo 2 layout and Admin Attendance Logs Matrix Table.
 */
export default function SemesterAttendanceMatrix({
  semNumber,
  token,
  onBack,
  isMobile = false,
  availableSemesters = [],
  assignedSubjects = [],
  studentsList = [],
  liveLogs = [],
  dateLogs = [],
  qrSessionHistory = []
}) {
  // Semester State
  const [selectedSem, setSelectedSem] = useState(() => {
    return semNumber ? String(semNumber) : 'ALL';
  });

  // Keep selectedSem synced if parent prop semNumber changes
  useEffect(() => {
    if (semNumber) {
      setSelectedSem(String(semNumber));
    }
  }, [semNumber]);

  // Matrix Data & Loading State
  const [matrixData, setMatrixData] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Filters State
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
  const [selectedCellInfo, setSelectedCellInfo] = useState(null);

  // Fetch Semester Matrix Data from Backend API
  const fetchSemesterMatrix = async (targetSemNumber) => {
    const sem = (!targetSemNumber || targetSemNumber === 'ALL') ? 'ALL' : targetSemNumber;
    setMatrixLoading(true);

    try {
      let query = `?semester=${sem}`;
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
        fallbackCompileMatrix(sem);
      }
    } catch (err) {
      console.error('Error fetching semester matrix:', err);
      fallbackCompileMatrix(sem);
    } finally {
      setMatrixLoading(false);
    }
  };

  // Client-side fallback if backend route fails
  const fallbackCompileMatrix = (sem) => {
    const isAll = !sem || sem === 'ALL';
    const targetSemClean = isAll ? 'ALL' : String(sem).replace(/\D/g, '');

    const semStudents = (studentsList || []).filter(s => {
      if (isAll) return true;
      return String(s.semester || '').replace(/\D/g, '') === targetSemClean;
    });

    semStudents.sort((a, b) => {
      const divA = String(a.division || 'A').trim().toUpperCase();
      const divB = String(b.division || 'A').trim().toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

      const rA = parseInt(String(a.roll_no || '').replace(/\D/g, ''), 10);
      const rB = parseInt(String(b.roll_no || '').replace(/\D/g, ''), 10);
      if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
      return String(a.roll_no || '').localeCompare(String(b.roll_no || ''), undefined, { numeric: true });
    });

    const semLogs = [...(liveLogs || []), ...(dateLogs || [])].filter(l => {
      if (!l) return false;
      const st = String(l.status || '').toLowerCase();
      if (st !== 'success' && st !== 'present') return false;
      if (isAll) return true;
      const lSem = String(l.semester || l.students?.semester || '').replace(/\D/g, '');
      return lSem === targetSemClean;
    });

    const sessionMap = new Map();
    (qrSessionHistory || []).forEach(sess => {
      const sSem = String(sess.semester || '').replace(/\D/g, '');
      if (isAll || sSem === targetSemClean) {
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

    semStudents.forEach(st => {
      attendanceMatrix[String(st.id)] = {};
      const studentDiv = String(st.division || 'A').trim().toUpperCase();

      columns.forEach(col => {
        const sessDiv = String(col.division || 'ALL').trim().toUpperCase();
        const isApplicable = sessDiv === 'ALL' || sessDiv === '' || studentDiv === sessDiv;

        const hasLog = semLogs.some(l => {
          const matchStudent = String(l.student_id) === String(st.id) ||
            String(l.enrollment_no || '').toLowerCase() === String(st.enrollment_no || '').toLowerCase();
          const lDate = getLocalDateStr(l.date || l.timestamp || l.created_at);
          return matchStudent && lDate === col.date;
        });

        if (hasLog) {
          attendanceMatrix[String(st.id)][col.columnKey] = { status: 'P', time: col.time, method: col.type };
        } else if (isApplicable) {
          attendanceMatrix[String(st.id)][col.columnKey] = { status: 'A', time: col.time, method: col.type };
        } else {
          attendanceMatrix[String(st.id)][col.columnKey] = { status: 'NA', time: col.time, method: col.type, targetDivision: col.division };
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

    setMatrixData({
      semester: sem,
      totalStudents: semStudents.length,
      columns,
      dateGroups: Array.from(dateGroupsMap.values()),
      uniqueSubjects: Array.from(new Set(columns.map(c => c.subject))),
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

  // Re-fetch when semester or filters change
  useEffect(() => {
    fetchSemesterMatrix(selectedSem);
  }, [selectedSem, matrixDateMode, matrixMonth, matrixStartDate, matrixEndDate, matrixSingleDate, matrixDivFilter, matrixSubjectFilter]);

  // Available semesters for filter dropdown (Strictly assigned semesters if in Faculty mode)
  const allSemestersList = useMemo(() => {
    if (availableSemesters && Array.isArray(availableSemesters) && availableSemesters.length > 0) {
      const semSet = new Set();
      availableSemesters.forEach(s => {
        const num = String(s).replace(/\D/g, '').trim();
        if (num) semSet.add(num);
      });
      if (semSet.size > 0) {
        return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
      }
    }

    // Fallback (Admin mode: include all semesters present in students cohort)
    const semSet = new Set();
    (studentsList || []).forEach(s => {
      const num = String(s.semester || '').replace(/\D/g, '').trim();
      if (num) semSet.add(num);
    });
    if (semSet.size === 0) {
      ['1', '2', '3', '4', '5', '6', '7', '8'].forEach(n => semSet.add(n));
    }
    return Array.from(semSet).sort((a, b) => Number(a) - Number(b));
  }, [availableSemesters, studentsList]);

  // Auto-sync selectedSem if allSemestersList has exactly 1 semester
  useEffect(() => {
    if (allSemestersList.length === 1 && selectedSem !== allSemestersList[0]) {
      setSelectedSem(allSemestersList[0]);
    }
  }, [allSemestersList]);

  // Dynamic list of available subjects for subject filter dropdown (Strictly assigned subjects for this faculty)
  const availableFilterSubjects = useMemo(() => {
    if (assignedSubjects && Array.isArray(assignedSubjects) && assignedSubjects.length > 0) {
      const targetSem = (selectedSem && selectedSem !== 'ALL') ? String(selectedSem).replace(/\D/g, '').trim() : null;

      // Filter assigned subjects by selected semester if a specific semester is picked
      const matchingAssigned = assignedSubjects.filter(sub => {
        if (!sub) return false;
        if (!targetSem) return true; // All assigned semesters
        const subSem = String(sub.semester || '').replace(/\D/g, '').trim();
        return !subSem || subSem === targetSem;
      });

      const subSet = new Set();
      matchingAssigned.forEach(sub => {
        const rawName = sub.subjectName || sub.name || (typeof sub === 'string' ? sub : '');
        const clean = cleanSubjectTitle(rawName);
        if (clean && clean !== 'Subject') {
          subSet.add(clean);
        }
      });

      const list = Array.from(subSet).sort();
      if (list.length > 0) {
        return list;
      }
    }

    // Fallback: use uniqueSubjects from matrixData (e.g. for Admin Dashboard)
    return (matrixData?.uniqueSubjects || []).map(s => cleanSubjectTitle(s)).filter(Boolean);
  }, [assignedSubjects, selectedSem, matrixData?.uniqueSubjects]);

  // Reset subject filter if current value is invalid
  useEffect(() => {
    if (matrixSubjectFilter !== 'ALL' && !availableFilterSubjects.includes(matrixSubjectFilter)) {
      setMatrixSubjectFilter('ALL');
    }
  }, [availableFilterSubjects, matrixSubjectFilter]);

  // Filtered Matrix Data based on faculty assigned subjects and selected subject filter
  const displayMatrixData = useMemo(() => {
    if (!matrixData) return null;

    let filteredColumns = matrixData.columns || [];

    // If faculty assigned subjects provided, only keep columns matching those subjects
    if (assignedSubjects && Array.isArray(assignedSubjects) && assignedSubjects.length > 0) {
      const allowedSubs = new Set();
      const targetSem = (selectedSem && selectedSem !== 'ALL') ? String(selectedSem).replace(/\D/g, '').trim() : null;

      assignedSubjects.forEach(s => {
        if (!s) return;
        const subSem = String(s.semester || '').replace(/\D/g, '').trim();
        if (targetSem && subSem && subSem !== targetSem) return;
        const name = cleanSubjectTitle(s.subjectName || s.name || (typeof s === 'string' ? s : '')).toLowerCase();
        if (name && name !== 'subject') allowedSubs.add(name);
      });

      if (allowedSubs.size > 0) {
        filteredColumns = filteredColumns.filter(col => {
          const colSub = cleanSubjectTitle(col.subject).toLowerCase();
          return allowedSubs.has(colSub);
        });
      }
    }

    // If user selected a specific subject filter from dropdown
    if (matrixSubjectFilter && matrixSubjectFilter !== 'ALL') {
      const targetClean = cleanSubjectTitle(matrixSubjectFilter).toLowerCase();
      filteredColumns = filteredColumns.filter(col => {
        return cleanSubjectTitle(col.subject).toLowerCase() === targetClean;
      });
    }

    // Rebuild dateGroups
    const dateGroupsMap = new Map();
    filteredColumns.forEach(col => {
      if (!dateGroupsMap.has(col.date)) {
        let fDate = col.date;
        try {
          fDate = new Date(col.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        } catch(e) {}
        dateGroupsMap.set(col.date, {
          date: col.date,
          formattedDate: fDate,
          sessions: []
        });
      }
      dateGroupsMap.get(col.date).sessions.push(col);
    });

    return {
      ...matrixData,
      columns: filteredColumns,
      dateGroups: Array.from(dateGroupsMap.values())
    };
  }, [matrixData, assignedSubjects, selectedSem, matrixSubjectFilter]);

  // Process and sort students for the matrix table
  const processedMatrixStudents = useMemo(() => {
    if (!matrixData || !matrixData.students) return [];

    const activeCols = displayMatrixData?.columns || [];

    let list = matrixData.students.map(st => {
      const rowAttendance = matrixData.attendanceMatrix?.[String(st.id)] || {};
      let presentCount = 0;
      let absentCount = 0;
      let applicableCount = 0;

      activeCols.forEach(col => {
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
      const pct = finalApplicable > 0 ? Math.round((finalPresent / finalApplicable) * 100) : (activeCols.length === 0 ? (st.pct !== undefined ? st.pct : 0) : 100);

      return {
        ...st,
        presentCount: finalPresent,
        absentCount: finalAbsent,
        applicableCount: finalApplicable,
        totalConducted: finalApplicable,
        pct
      };
    });

    // If availableSemesters is passed (Faculty mode), restrict students to assigned semesters when selectedSem is ALL
    if (availableSemesters && Array.isArray(availableSemesters) && availableSemesters.length > 0) {
      const allowedSemSet = new Set(availableSemesters.map(s => String(s).replace(/\D/g, '').trim()));
      list = list.filter(st => {
        const sSem = String(st.semester || '').replace(/\D/g, '').trim();
        return allowedSemSet.has(sSem);
      });
    }

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

    // 4. Sorting (Semester, Division, then user sort choice)
    list.sort((a, b) => {
      const semA = parseInt(String(a.semester || '').replace(/\D/g, ''), 10) || 0;
      const semB = parseInt(String(b.semester || '').replace(/\D/g, ''), 10) || 0;
      if (semA !== semB) return semA - semB;

      const divA = String(a.division || 'A').trim().toUpperCase();
      const divB = String(b.division || 'A').trim().toUpperCase();
      if (divA !== divB) return divA.localeCompare(divB);

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
  }, [matrixData, displayMatrixData, availableSemesters, matrixSearch, matrixDivFilter, matrixStatusFilter, matrixSortBy]);

  // Keys representing the last session of each date group (to draw the yellow boundary line)
  const dateBoundaryKeys = useMemo(() => {
    const keys = new Set();
    const dateGroups = displayMatrixData?.dateGroups || [];
    dateGroups.forEach((grp) => {
      if (grp.sessions?.length > 0) {
        const lastSession = grp.sessions[grp.sessions.length - 1];
        if (lastSession?.columnKey) keys.add(lastSession.columnKey);
      }
    });
    return keys;
  }, [displayMatrixData?.dateGroups]);

  // Dynamic divisions list for this semester
  const availableSemesterDivisions = useMemo(() => {
    if (matrixData?.availableDivisions && Array.isArray(matrixData.availableDivisions) && matrixData.availableDivisions.length > 0) {
      return matrixData.availableDivisions;
    }
    const divs = new Set();
    const targetSemClean = String(selectedSem || '').replace(/\D/g, '');

    (studentsList || []).forEach(s => {
      const sSem = String(s.semester || '').replace(/\D/g, '');
      if (sSem === targetSemClean && s.division && String(s.division).trim()) {
        divs.add(String(s.division).trim().toUpperCase());
      }
    });

    (matrixData?.students || []).forEach(s => {
      if (s.division && String(s.division).trim()) divs.add(String(s.division).trim().toUpperCase());
    });

    (displayMatrixData?.columns || []).forEach(c => {
      if (c.division && c.division !== 'ALL' && String(c.division).trim()) divs.add(String(c.division).trim().toUpperCase());
    });

    const sorted = Array.from(divs).sort();
    return sorted.length > 0 ? sorted : ['A', 'B'];
  }, [matrixData, displayMatrixData, selectedSem, studentsList]);

  // Reset all filters
  const handleResetFilters = () => {
    setMatrixSearch('');
    setMatrixDateMode('all');
    setMatrixMonth('');
    setMatrixStartDate('');
    setMatrixEndDate('');
    setMatrixSingleDate('');
    setSelectedSem(allSemestersList.length === 1 ? allSemestersList[0] : 'ALL');
    setMatrixDivFilter('ALL');
    setMatrixSubjectFilter('ALL');
    setMatrixStatusFilter('ALL');
    setMatrixSortBy('roll_asc');
  };

  // Determine sticky column positions (matching Photo 2 exactly: Roll No, Name, Sem, Div)
  const showSemCol = true;
  const showDivCol = true;

  return (
    <div className="matrix-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

      {/* Card 1: Interactive Filter & Search Toolbar */}
      <div
        className="glass-panel"
        style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          width: '100%',
          padding: isMobile ? '12px' : '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxSizing: 'border-box'
        }}
      >
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
              <Calendar size={14} color="#f59e0b" />
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
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
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
                value={selectedSem || 'ALL'}
                onChange={e => {
                  setSelectedSem(e.target.value);
                  setMatrixSearch('');
                  setMatrixDivFilter('ALL');
                  setMatrixSubjectFilter('ALL');
                  setMatrixStatusFilter('ALL');
                }}
                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
              >
                {allSemestersList.length > 1 && (
                  <option value="ALL">
                    {availableSemesters && availableSemesters.length > 0 ? 'All Assigned Semesters' : 'All Semesters'}
                  </option>
                )}
                {allSemestersList.map(sem => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>

            {/* Division Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="#64748b" />
              <select
                value={matrixDivFilter}
                onChange={e => setMatrixDivFilter(e.target.value)}
                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
              >
                <option value="ALL">All Divisions</option>
                {availableSemesterDivisions.map(div => (
                  <option key={div} value={div}>Division {div}</option>
                ))}
              </select>
            </div>

            {/* Subject Filter (Strictly Assigned Subjects if in Faculty Mode) */}
            {availableFilterSubjects.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={14} color="#64748b" />
                <select
                  value={matrixSubjectFilter}
                  onChange={e => setMatrixSubjectFilter(e.target.value)}
                  style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', maxWidth: '200px', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
                >
                  <option value="ALL">All Subjects</option>
                  {availableFilterSubjects.map(sub => (
                    <option key={sub} value={sub}>{cleanSubjectTitle(sub)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} color="#64748b" />
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

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowUpDown size={14} color="#64748b" />
              <select
                value={matrixSortBy}
                onChange={e => setMatrixSortBy(e.target.value)}
                style={{ height: '36px', padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '600', background: '#ffffff', color: '#1e293b', cursor: 'pointer', boxSizing: 'border-box', outline: 'none' }}
              >
                <option value="roll_asc">Roll No (Ascending)</option>
                <option value="roll_desc">Roll No (Descending)</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="pct_desc">Attendance % (High to Low)</option>
                <option value="pct_asc">Attendance % (Low to High)</option>
              </select>
            </div>
          </div>

          {/* Reset Filters Button */}
          <button
            type="button"
            onClick={handleResetFilters}
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
      <div
        className="glass-panel"
        style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          width: '100%',
          padding: isMobile ? '14px 12px' : '18px 22px',
          boxSizing: 'border-box'
        }}
      >
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
                {processedMatrixStudents.length}
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
                {displayMatrixData?.columns?.length || 0}
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
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: (processedMatrixStudents.length > 0 ? Math.round(processedMatrixStudents.reduce((a, b) => a + (b.pct || 0), 0) / processedMatrixStudents.length) : 0) >= 75 ? '#10b981' : (processedMatrixStudents.length > 0 ? Math.round(processedMatrixStudents.reduce((a, b) => a + (b.pct || 0), 0) / processedMatrixStudents.length) : 0) >= 60 ? '#f59e0b' : '#ef4444' }}>
                {processedMatrixStudents.length > 0 ? Math.round(processedMatrixStudents.reduce((a, b) => a + (b.pct || 0), 0) / processedMatrixStudents.length) : 0}%
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
                {processedMatrixStudents.filter(s => (s.pct || 0) >= 75).length}
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
                {processedMatrixStudents.filter(s => (s.pct || 0) < 75).length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Master Attendance Log Table */}
      <div
        className="glass-panel"
        style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          width: '100%',
          padding: isMobile ? '8px 6px' : '14px',
          boxSizing: 'border-box'
        }}
      >
        {matrixLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <RefreshCw size={36} color="#f59e0b" className="spin-icon" style={{ marginBottom: '14px' }} />
            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
              Loading Semester {selectedSem} Attendance Sheet...
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Compiling all student records, conducted lectures, and punch-in timestamps.
            </div>
          </div>
        ) : processedMatrixStudents.length === 0 ? (
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
                  No attendance sessions have been conducted yet for Semester {selectedSem}. Showing all enrolled students below. Date & Subject columns will automatically appear once lectures are conducted.
                </div>
              </div>
            )}

            {/* The Matrix Table Container (Matches Photo 2 Exactly) */}
            <div className="matrix-table-wrapper">
              <table className="matrix-table">
                <thead>
                  {/* Row 1: Roll No, Name, Sem, Div, Date Columns (spanning subjects), Summary Headers */}
                  <tr>
                    <th rowSpan={2} className="matrix-sticky-col-1" style={{ textAlign: 'center' }}>
                      Roll No
                    </th>
                    <th
                      rowSpan={2}
                      className="matrix-sticky-col-2"
                      style={{ borderRight: '1px solid #cbd5e1', boxShadow: 'none' }}
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
                          borderRight: '1px solid #cbd5e1',
                          boxShadow: 'none'
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
                          left: '295px',
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

                    {(displayMatrixData?.dateGroups || []).map((grp, gIdx) => (
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
                    {(displayMatrixData?.dateGroups || []).map((grp) =>
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
                  {processedMatrixStudents.map((st) => (
                    <tr key={st.id}>
                      {/* Col 1: Roll No (Bold Amber text, centered) */}
                      <td className="matrix-sticky-col-1" style={{ fontWeight: '800', color: '#d97706', textAlign: 'center', fontSize: '0.86rem' }}>
                        {st.roll_no || '-'}
                      </td>

                      {/* Col 2: Student Name (+ Enrollment underneath) */}
                      <td
                        className="matrix-sticky-col-2"
                        style={{ borderRight: '1px solid #cbd5e1', boxShadow: 'none' }}
                      >
                        <div style={{ fontWeight: '700', fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                          {st.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500' }}>
                          {st.enrollment_no}
                        </div>
                      </td>

                      {/* Col 3: Semester Badge (Amber pill) */}
                      {showSemCol && (
                        <td
                          className="matrix-sticky-col-3"
                          style={{
                            left: '240px',
                            minWidth: '55px',
                            maxWidth: '55px',
                            width: '55px',
                            textAlign: 'center',
                            borderRight: '1px solid #cbd5e1',
                            boxShadow: 'none'
                          }}
                        >
                          <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: '700' }}>
                            {String(st.semester || selectedSem || '1').replace(/sem(ester)?\s*/i, '')}
                          </span>
                        </td>
                      )}

                      {/* Col 4: Division Badge (Slate pill) */}
                      {showDivCol && (
                        <td
                          className="matrix-sticky-col-3"
                          style={{
                            left: '295px',
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
                      {(displayMatrixData?.columns || []).map((col) => {
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
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            background: (st.pct || 0) >= 75 ? '#dcfce7' : (st.pct || 0) >= 60 ? '#fef3c7' : '#fee2e2',
                            color: (st.pct || 0) >= 75 ? '#15803d' : (st.pct || 0) >= 60 ? '#b45309' : '#dc2626',
                            border: (st.pct || 0) >= 75 ? '1px solid #86efac' : (st.pct || 0) >= 60 ? '1px solid #fde68a' : '1px solid #fca5a5'
                          }}
                        >
                          {st.pct || 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Table Footer: Total Present per Subject Lecture */}
                {(displayMatrixData?.columns?.length > 0 || processedMatrixStudents.length > 0) && (
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
                          borderRight: '1px solid #cbd5e1',
                          boxShadow: 'none'
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
                            borderRight: '1px solid #cbd5e1',
                            boxShadow: 'none'
                          }}
                        >
                          -
                        </td>
                      )}
                      {showDivCol && (
                        <td
                          className="matrix-sticky-col-3"
                          style={{
                            left: '295px',
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
                      {(displayMatrixData?.columns || []).map((col) => {
                        const isBoundary = dateBoundaryKeys.has(col.columnKey);
                        let colPresentCount = 0;
                        processedMatrixStudents.forEach(st => {
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
                        {processedMatrixStudents.reduce((a, b) => a + (b.presentCount || 0), 0)}
                      </td>
                      <td className="matrix-summary-cell-a" style={{ textAlign: 'center', fontWeight: '800', color: '#dc2626' }}>
                        {processedMatrixStudents.reduce((a, b) => a + (b.absentCount || 0), 0)}
                      </td>
                      <td className="matrix-summary-cell-pct" style={{ textAlign: 'center', fontWeight: '800', color: '#d97706' }}>
                        {processedMatrixStudents.length > 0 ? Math.round(processedMatrixStudents.reduce((a, b) => a + (b.pct || 0), 0) / processedMatrixStudents.length) : 0}%
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
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
                style={{ padding: '6px 18px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
