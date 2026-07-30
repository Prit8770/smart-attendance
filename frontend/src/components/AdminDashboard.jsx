import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, KeyRound, QrCode, MapPin, BarChart3, Download, Plus, Search, 
  Trash2, Edit, CheckCircle, XCircle, Clock, ShieldAlert, LogOut, RefreshCw,
  Sun, Moon, GraduationCap
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

export default function AdminDashboard({ user, token, onLogout, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'students', 'otp', 'location', 'reports'
  const [activeStatsList, setActiveStatsList] = useState(null); // null, 'total', 'present', 'absent', 'qrsessions'
  
  // Dashboard Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    qrSessionsGenerated: 0,
    activeQrSession: null,
    trend: []
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Student CRUD State
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [createdStudentCredentials, setCreatedStudentCredentials] = useState(null); // Save generated credentials
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Faculty CRUD State
  const [faculties, setFaculties] = useState([]);
  const [facultySearchQuery, setFacultySearchQuery] = useState('');
  const [facultyForm, setFacultyForm] = useState({
    id: null,
    employee_no: '',
    name: '',
    department: '',
    mobile: '',
    password: ''
  });
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [facultyModalMode, setFacultyModalMode] = useState('add'); // 'add' or 'edit'
  const [createdFacultyCredentials, setCreatedFacultyCredentials] = useState(null); // Save generated credentials
  const [facultyLoading, setFacultyLoading] = useState(false);


  // QR Session Manager State
  const [qrSessionHistory, setQrSessionHistory] = useState([]);
  const [activeQrSessionDetails, setActiveQrSessionDetails] = useState(null);
  const [qrSessionTimer, setQrSessionTimer] = useState(0);
  const [tokenIndex, setTokenIndex] = useState(0);
  const [qrCodeTimer, setQrCodeTimer] = useState(20);
  const [qrGenerationEnabled, setQrGenerationEnabled] = useState(true);
  const qrCanvasRef = useRef(null);

  // College Location State
  const [locationForm, setLocationForm] = useState({
    latitude: 23.0225,
    longitude: 72.5714,
    radius: 200
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

  // Attendance live monitor & reports
  const [liveLogs, setLiveLogs] = useState([]);
  const [reportType, setReportType] = useState('today'); // 'today', 'yesterday', 'monthly', 'student_wise'
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportData, setReportData] = useState([]);
  const [reportFilterSem, setReportFilterSem] = useState('');
  const [reportFilterName, setReportFilterName] = useState('');
  const [reportFilterEnroll, setReportFilterEnroll] = useState('');

  const filteredReportData = reportData.filter(row => {
    const matchSem = reportFilterSem ? String(row.semester) === reportFilterSem : true;
    const matchName = reportFilterName ? row.name.toLowerCase().includes(reportFilterName.toLowerCase()) : true;
    const matchEnroll = reportFilterEnroll ? row.enrollment_no.toLowerCase().includes(reportFilterEnroll.toLowerCase()) : true;
    return matchSem && matchName && matchEnroll;
  });

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

  // Fetch student records
  const fetchStudents = async () => {
    setStudentsLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
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
      const res = await fetch('http://localhost:5000/api/faculty', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFaculties(data);
      }
    } catch (err) {
      console.error('Error fetching faculties:', err);
    } finally {
      setFacultyLoading(false);
    }
  };

  // Fetch active QR session and Today's History
  const fetchQrData = async () => {
    try {
      // 1. Fetch active QR session
      const resActive = await fetch('http://localhost:5000/api/qr/active', {
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

      // 2. Fetch today's QR history
      const resToday = await fetch('http://localhost:5000/api/qr/today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resToday.ok) {
        const historyData = await resToday.json();
        setQrSessionHistory(historyData || []);
      }
    } catch (err) {
      console.error('Error fetching QR data:', err);
    }
  };

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

  const handleToggleQrSettings = async () => {
    try {
      const nextState = !qrGenerationEnabled;
      const res = await fetch('http://localhost:5000/api/qr/toggle-settings', {
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

  // Fetch College Location
  const fetchLocation = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/location', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLocationForm({
          latitude: data.latitude,
          longitude: data.longitude,
          radius: data.radius
        });
      }
    } catch (err) {
      console.error('Error fetching college location:', err);
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
      // start of current month
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
    fetchLiveLogs();
    fetchStudents();
    fetchQrData();
    fetchFaculties();
    fetchQrSettings();
  }, []);

  // Dynamic Polling for Stats & Live Logs (Poll every 3s during active QR session, else 15s)
  useEffect(() => {
    const isSessionActive = stats.activeQrSession !== null || activeQrSessionDetails !== null;
    const intervalTime = isSessionActive ? 3000 : 15000;
    
    const interval = setInterval(() => {
      fetchStats();
      fetchLiveLogs();
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
          const idx = Math.min(5, Math.floor(elapsed / 20));
          setTokenIndex(idx);
          setQrCodeTimer(20 - (elapsed % 20));
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
  }, [reportType, reportStudentId]);

  // Leaflet Map Initialization & Sync
  useEffect(() => {
    if (activeTab === 'location' && mapContainerRef.current) {
      // Destroy existing map if initialized
      if (mapRef.current) {
        mapRef.current.remove();
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
  }, [activeTab]);

  // Update map layer on radius or coordinates change
  const handleLocationInputChange = (field, value) => {
    setLocationForm(prev => {
      const updated = { ...prev, [field]: value };
      if (mapRef.current && window.L) {
        const lat = parseFloat(updated.latitude) || 23.0225;
        const lon = parseFloat(updated.longitude) || 72.5714;
        const rad = parseFloat(updated.radius) || 200;

        mapRef.current.setView([lat, lon]);
        
        // Remove all layers except tiles
        mapRef.current.eachLayer((layer) => {
          if (layer instanceof window.L.Marker || layer instanceof window.L.Circle) {
            mapRef.current.removeLayer(layer);
          }
        });

        // Redraw
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
  };

  // Submit Location updates
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    setLocationMessage('');
    try {
      const res = await fetch('http://localhost:5000/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(locationForm)
      });
      if (res.ok) {
        setLocationMessage('Location configuration saved successfully!');
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

  // Start QR Session logic
  const handleStartQrSession = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/qr/start-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActiveQrSessionDetails(data.session);
        setQrSessionTimer(120);
        setTokenIndex(0);
        setQrCodeTimer(20);
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
      const response = await fetch('http://localhost:5000/api/students/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ students: studentsList })
      });
      const data = await response.json();
      if (response.ok) {
        let msg = `Successfully imported ${data.successCount} students!`;
        if (data.errors && data.errors.length > 0) {
          msg += `\nErrors:\n` + data.errors.slice(0, 5).join('\n');
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

            if (header.includes('enrollment') || header.includes('enroll') || header.includes('no')) {
              stuObj.enrollment_no = val;
            } else if (header.includes('name')) {
              stuObj.name = val;
            } else if (header.includes('course') || header.includes('dept')) {
              stuObj.course = val;
            } else if (header.includes('semester') || header.includes('sem')) {
              stuObj.semester = val;
            } else if (header.includes('mobile') || header.includes('phone')) {
              stuObj.mobile = val;
            } else if (header.includes('password') || header.includes('pass')) {
              stuObj.password = val;
            }
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
    } else if (fileType === 'xlsx') {
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

              if (header.includes('enrollment') || header.includes('enroll') || header.includes('no')) {
                stuObj.enrollment_no = val;
              } else if (header.includes('name')) {
                stuObj.name = val;
              } else if (header.includes('course') || header.includes('dept')) {
                stuObj.course = val;
              } else if (header.includes('semester') || header.includes('sem')) {
                stuObj.semester = val;
              } else if (header.includes('mobile') || header.includes('phone')) {
                stuObj.mobile = val;
              } else if (header.includes('password') || header.includes('pass')) {
                stuObj.password = val;
              }
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

  // Student CRUD Submission
  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setCreatedStudentCredentials(null);

    const isEdit = modalMode === 'edit';
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit 
      ? `http://localhost:5000/api/students/${studentForm.id}`
      : 'http://localhost:5000/api/students';

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
        throw new Error(data.error || 'Action failed.');
      }

      if (!isEdit) {
        // Show the generated credentials modal details
        setCreatedStudentCredentials({
          username: data.student.username,
          password: data.student.generatedPassword
        });
      }

      fetchStudents();
      fetchStats();

      if (isEdit) {
        setShowStudentModal(false);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Student
  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Are you sure you want to delete this student and their entire history?')) return;

    try {
      const res = await fetch(`http://localhost:5000/api/students/${studentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchStudents();
        fetchStats();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete student.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setModalMode('add');
    setStudentForm({
      id: null,
      enrollment_no: '',
      name: '',
      course: '',
      semester: '',
      mobile: '',
      password: ''
    });
    setCreatedStudentCredentials(null);
    setShowStudentModal(true);
  };

  // Open Edit Modal
  const openEditModal = (student) => {
    setModalMode('edit');
    setStudentForm({
      id: student.id,
      enrollment_no: student.enrollment_no,
      name: student.name,
      course: student.course,
      semester: student.semester,
      mobile: student.mobile,
      password: '',
      resetPassword: false
    });
    setCreatedStudentCredentials(null);
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
      password: ''
    });
    setCreatedFacultyCredentials(null);
    setShowFacultyModal(true);
  };

  const openEditFacultyModal = (faculty) => {
    setFacultyModalMode('edit');
    setFacultyForm({
      id: faculty.id,
      employee_no: faculty.employee_no,
      name: faculty.name,
      department: faculty.department,
      mobile: faculty.mobile,
      password: ''
    });
    setCreatedFacultyCredentials(null);
    setShowFacultyModal(true);
  };

  const handleSaveFaculty = async (e) => {
    e.preventDefault();
    const isEdit = facultyModalMode === 'edit';
    const url = isEdit 
      ? `http://localhost:5000/api/faculty/${facultyForm.id}`
      : 'http://localhost:5000/api/faculty';
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
      const res = await fetch(`http://localhost:5000/api/faculty/${facultyId}`, {
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
      const res = await fetch(`http://localhost:5000/api/faculty/${facultyId}`, {
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
    doc.text(`Report Scope: ${reportType.toUpperCase()}`, 14, 28);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 34);

    // Filter information
    if (reportType === 'student_wise' && reportStudentId) {
      const stu = students.find(s => s.id === parseInt(reportStudentId));
      if (stu) {
        doc.text(`Student: ${stu.name} (${stu.enrollment_no})`, 14, 40);
        doc.text(`Course/Sem: ${stu.course} - Sem ${stu.semester}`, 14, 46);
      }
    }

    const tableColumn = ['Enrollment No', 'Name', 'Course/Sem', 'Session/OTP', 'Date', 'Time', 'Distance', 'Status'];
    const tableRows = [];

    filteredReportData.forEach((row) => {
      tableRows.push([
        row.enrollment_no,
        row.name,
        `${row.course} - S${row.semester}`,
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
        7: { fontStyle: 'bold' } // bold status
      }
    });

    doc.save(`Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const cleanData = filteredReportData.map(row => ({
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Session/OTP': row.qr_session_id ? `QR Session #${row.qr_session_id}` : `${row.otp || 'N/A'} (OTP)`,
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance,
      'Status': row.status === 'Success' ? 'Present' : 'Rejected'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    const cleanData = filteredReportData.map(row => ({
      'Enrollment No': row.enrollment_no,
      'Name': row.name,
      'Course': row.course,
      'Semester': row.semester,
      'Session/OTP': row.qr_session_id ? `QR Session #${row.qr_session_id}` : `${row.otp || 'N/A'} (OTP)`,
      'Date': row.date,
      'Time': row.time,
      'Distance (m)': row.distance,
      'Status': row.status === 'Success' ? 'Present' : 'Rejected'
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance logs');
    XLSX.writeFile(workbook, `Attendance_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.enrollment_no.includes(searchQuery)
  );

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header className="glass-panel" style={styles.header}>
        <div style={styles.logoGroup}>
          <ShieldAlert size={24} color="#9333ea" />
          <h1 style={styles.headerTitle}>College Admin Dashboard</h1>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.welcomeText}>Welcome, <strong>Admin</strong></span>
          <button className="btn btn-secondary" onClick={toggleTheme} style={{ padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Toggle Light/Dark Mode">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="btn btn-secondary" onClick={onLogout} style={styles.logoutBtn}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="glass-panel" style={styles.tabNavbar}>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'dashboard' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart3 size={16} />
          Dashboard
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'students' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('students')}
        >
          <Users size={16} />
          Students
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'faculty' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('faculty')}
        >
          <GraduationCap size={16} />
          Faculty
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'otp' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('otp')}
        >
          <QrCode size={16} />
          QR Attendance
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'location' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('location')}
        >
          <MapPin size={16} />
          College Location
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'reports' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('reports')}
        >
          <Download size={16} />
          Reports
        </button>
        <button 
          style={{ ...styles.navTab, ...(activeTab === 'settings' ? styles.navTabActive : {}) }}
          onClick={() => setActiveTab('settings')}
        >
          <KeyRound size={16} />
          Change Password
        </button>
      </div>

      {/* Main Tab Panels */}
      <main style={styles.mainContent}>
        
        {/* PANEL 1: DASHBOARD MONITOR */}
        {activeTab === 'dashboard' && (
          <div style={styles.tabPanel}>
            {/* Stats Overview */}
            <div className="dashboard-grid">
              <div 
                className="glass-panel stat-card" 
                style={{ cursor: 'pointer', border: activeStatsList === 'total' ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)' }} 
                onClick={() => setActiveStatsList(prev => prev === 'total' ? null : 'total')}
              >
                <div className="stat-card-info">
                  <h4>Total Students</h4>
                  <p>{statsLoading ? '...' : stats.totalStudents}</p>
                </div>
                <div className="stat-card-icon" style={{ background: 'rgba(37, 99, 235, 0.15)' }}>
                  <Users size={24} color="#3b82f6" />
                </div>
              </div>

              <div 
                className="glass-panel stat-card" 
                style={{ cursor: 'pointer', border: activeStatsList === 'present' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.08)' }} 
                onClick={() => setActiveStatsList(prev => prev === 'present' ? null : 'present')}
              >
                <div className="stat-card-info">
                  <h4>Present Today</h4>
                  <p style={{ color: '#10b981' }}>{statsLoading ? '...' : stats.presentToday}</p>
                </div>
                <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                  <CheckCircle size={24} color="#10b981" />
                </div>
              </div>

              <div 
                className="glass-panel stat-card" 
                style={{ cursor: 'pointer', border: activeStatsList === 'absent' ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.08)' }} 
                onClick={() => setActiveStatsList(prev => prev === 'absent' ? null : 'absent')}
              >
                <div className="stat-card-info">
                  <h4>Absent Today</h4>
                  <p style={{ color: '#ef4444' }}>{statsLoading ? '...' : stats.absentToday}</p>
                </div>
                <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                  <XCircle size={24} color="#ef4444" />
                </div>
              </div>

              <div 
                className="glass-panel stat-card" 
                style={{ cursor: 'pointer', border: activeStatsList === 'qrsessions' ? '1.5px solid #9333ea' : '1px solid rgba(255,255,255,0.08)' }} 
                onClick={() => setActiveStatsList(prev => prev === 'qrsessions' ? null : 'qrsessions')}
              >
                <div className="stat-card-info">
                  <h4>QR Sessions Run</h4>
                  <p>{statsLoading ? '...' : stats.qrSessionsGenerated}</p>
                </div>
                <div className="stat-card-icon" style={{ background: 'rgba(147, 51, 234, 0.15)' }}>
                  <QrCode size={24} color="#9333ea" />
                </div>
              </div>

              <div 
                className="glass-panel stat-card" 
                style={{ cursor: 'pointer', border: activeStatsList === 'total_faculty' ? '1.5px solid #eab308' : '1px solid rgba(255,255,255,0.08)' }} 
                onClick={() => setActiveStatsList(prev => prev === 'total_faculty' ? null : 'total_faculty')}
              >
                <div className="stat-card-info">
                  <h4>Total Faculty</h4>
                  <p>{statsLoading ? '...' : (stats.totalFaculty || 0)}</p>
                </div>
                <div className="stat-card-icon" style={{ background: 'rgba(234, 179, 8, 0.15)' }}>
                  <GraduationCap size={24} color="#eab308" />
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
                    {activeStatsList === 'present' && 'Present Students List (Today)'}
                    {activeStatsList === 'absent' && 'Absent Students List (Today)'}
                    {activeStatsList === 'qrsessions' && "Today's Generated QR Sessions"}
                  </h3>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setActiveStatsList(null)} 
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                  >
                    Close Panel
                  </button>
                </div>

                <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table className="custom-table">
                    {activeStatsList === 'total' && (
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
                          {students.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No students registered.</td></tr>
                          ) : (
                            students.map(s => (
                              <tr key={s.id}>
                                <td>{s.enrollment_no}</td>
                                <td>{s.name}</td>
                                <td>{s.course}</td>
                                <td>Sem {s.semester}</td>
                                <td>{s.mobile}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </>
                    )}

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

                    {activeStatsList === 'present' && (
                      <>
                        <thead>
                          <tr>
                            <th>Enrollment No</th>
                            <th>Name</th>
                            <th>Course</th>
                            <th>Semester</th>
                            <th>Mobile No</th>
                            <th>Time Checked In</th>
                            <th>Distance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const presentLogs = liveLogs.filter(log => log.status === 'Success');
                            if (presentLogs.length === 0) {
                              return <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No students checked in successfully today yet.</td></tr>;
                            }
                            return presentLogs.map(log => (
                              <tr key={log.id}>
                                <td>{log.enrollment_no}</td>
                                <td>{log.name}</td>
                                <td>{log.course}</td>
                                <td>Sem {log.semester}</td>
                                <td>{log.mobile || '-'}</td>
                                <td>{log.time}</td>
                                <td>{log.distance ? `${Math.round(log.distance)}m` : '-'}</td>
                              </tr>
                            ));
                          })()}
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
                            <th>Created At</th>
                            <th>Expires At</th>
                            <th>Present Students Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qrSessionHistory.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No QR sessions run today.</td></tr>
                          ) : (
                            qrSessionHistory.map(sess => (
                              <tr key={sess.id}>
                                <td>Session #{sess.id}</td>
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
              </div>
            )}

            {/* OTP Active & Live Monitor Row */}
            <div style={styles.dashboardRow}>
              {/* Active QR Session Card */}
              <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 1, minWidth: '300px' }}>
                <h3 style={styles.cardTitle}>Active QR Session</h3>
                <div style={styles.activeOtpContainer}>
                  {stats.activeQrSession || activeQrSessionDetails ? (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Clock size={16} /> Session Active
                      </p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                        Scan count updates in real-time.
                      </p>
                      <button className="btn btn-secondary" style={{ marginTop: '14px' }} onClick={() => setActiveTab('otp')}>
                        View QR Display
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>No active QR session.</p>
                      <button className="btn btn-primary" onClick={() => setActiveTab('otp')}>
                        Start QR Attendance
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Attendance Live Monitor */}
              <div className="glass-panel" style={{ ...styles.dashboardPanelCard, flex: 2, minWidth: '350px' }}>
                <div style={styles.cardHeaderWithAction}>
                  <h3 style={styles.cardTitle}>Live Attendance Monitor (Today)</h3>
                  <button className="btn btn-secondary" onClick={fetchLiveLogs} style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                    <RefreshCw size={12} /> Reload
                  </button>
                </div>

                <div className="custom-table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {liveLogs.length === 0 ? (
                    <div style={styles.emptyTableState}>Waiting for students to submit attendance...</div>
                  ) : (
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Enrollment</th>
                          <th>Name</th>
                          <th>Time</th>
                          <th>Distance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.enrollment_no}</td>
                            <td>{log.name}</td>
                            <td>{log.time}</td>
                            <td>{log.distance}m</td>
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
            </div>
          </div>
        )}

        {/* PANEL 2: STUDENT CRUD MANAGEMENT */}
        {activeTab === 'students' && (
          <div style={styles.tabPanel} className="glass-panel" style={styles.studentCrudPanel}>
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
              <div style={{ display: 'flex', gap: '10px' }}>
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
              </div>
            </div>

            <div className="custom-table-container">
              {studentsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading student lists...</div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No students found.</div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Enrollment No</th>
                      <th>Name</th>
                      <th>Course</th>
                      <th>Semester</th>
                      <th>Mobile</th>
                      <th>Username</th>
                      <th>Password</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => (
                      <tr key={student.id}>
                        <td>{student.enrollment_no}</td>
                        <td style={{ fontWeight: 600 }}>{student.name}</td>
                        <td>{student.course}</td>
                        <td>Sem {student.semester}</td>
                        <td>{student.mobile}</td>
                        <td><code>{student.username}</code></td>
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
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* PANEL 2b: FACULTY CRUD MANAGEMENT */}
        {activeTab === 'faculty' && (
          <div style={styles.tabPanel} className="glass-panel" style={styles.studentCrudPanel}>
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
            <div style={styles.tabPanel} style={styles.otpDashboardRow}>
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
                        {/* 20-second progress bar */}
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                          <div style={{ height: '100%', width: `${(qrCodeTimer / 20) * 100}%`, background: 'linear-gradient(90deg, #9333ea, #a855f7)', transition: 'width 1s linear' }}></div>
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
                    <div style={{ ...styles.cardHeaderWithAction, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
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
          <div style={styles.tabPanel} style={styles.locationDashboardRow}>
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
          <div style={styles.tabPanel} className="glass-panel" style={styles.reportsPanel}>
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
                  <option value="yesterday">Yesterday's Attendance</option>
                  <option value="monthly">Current Month Summary</option>
                  <option value="student_wise">Student Specific Report</option>
                </select>
              </div>

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

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <button 
                  className="btn btn-success" 
                  onClick={handleDownloadPDF}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> PDF
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleExportExcel}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> Excel
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleExportCSV}
                  disabled={filteredReportData.length === 0 || (reportType === 'student_wise' && !reportStudentId)}
                  style={{ height: '42px' }}
                >
                  <Download size={16} /> CSV
                </button>
              </div>
            </div>

            {/* Quick Filters */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px', padding: '16px', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={styles.inputGroup}>
                <label style={styles.formLabel}>Filter by Sem</label>
                <input 
                  type="text" 
                  placeholder="e.g. 3" 
                  className="glass-input" 
                  value={reportFilterSem} 
                  onChange={e => setReportFilterSem(e.target.value)} 
                />
              </div>
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

        {/* PANEL 6: ADMIN PASSWORD CHANGE */}
        {activeTab === 'settings' && (
          <div style={styles.tabPanel} className="glass-panel" style={{ padding: '30px', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={styles.cardTitle}>Change Admin Password</h3>
            
            {settingsMessage.text && (
              <div style={{
                ...styles.statusAlert,
                ...(settingsMessage.type === 'success' ? styles.statusSuccess : styles.statusDanger),
                marginBottom: '10px'
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
                    placeholder="e.g. 210020119001"
                    value={studentForm.enrollment_no}
                    onChange={(e) => setStudentForm({ ...studentForm, enrollment_no: e.target.value.trim() })}
                    required
                    disabled={modalMode === 'edit'}
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
                  <label style={styles.formLabel}>Mobile Number</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. 9876543210"
                    value={studentForm.mobile}
                    onChange={(e) => setStudentForm({ ...studentForm, mobile: e.target.value.trim() })}
                    required
                  />
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
                <button className="btn btn-primary" onClick={() => setShowFacultyModal(false)} style={{ width: '100%', marginTop: '20px' }}>
                  Close and Continue
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
    gap: '24px'
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
    background: 'rgba(147, 51, 234, 0.2)',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    color: 'var(--text-primary)',
    textShadow: '0 0 10px rgba(147, 51, 234, 0.4)'
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
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999
  },
  modalContent: {
    width: '100%',
    maxWidth: '480px',
    padding: '30px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
  },
  modalTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '20px',
    textAlign: 'center'
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '16px'
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
