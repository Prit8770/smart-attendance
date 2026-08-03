import React, { useState, useEffect, useRef } from 'react';
import { LogOut, User, MapPin, Navigation, History, CheckCircle2, XCircle, RefreshCw, Smartphone, Sun, Moon, QrCode, Camera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function StudentDashboard({ user, token, onLogout, theme, toggleTheme }) {
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
  const [attendanceData, setAttendanceData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);

  // Scanner States
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrCodeRef = useRef(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const studentMarkerRef = useRef(null);

  // Haversine formula to compute distance in meters on client side for display
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
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

    return R * c; // Distance in meters
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
  const fetchHistory = async () => {
    setHistoryLoading(true);
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
      setHistoryLoading(false);
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

  useEffect(() => {
    fetchCollegeLocation();
    fetchHistory();
    fetchStudentTrend();
  }, []);

  // Automatically pre-fetch and watch GPS location in background
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      return;
    }

    setLocLoading(true);
    setLocError('');

    // Fetch immediately
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

    // Watch position in background
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

  // Lock account and logout student if they switch tabs, minimize, or close the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onLogout();
      }
    };

    const handleBeforeUnload = () => {
      fetch('/api/auth/student/lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        keepalive: true
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [token, onLogout]);

  // Initialize Student Map ONCE when college location is loaded
  useEffect(() => {
    if (!collegeLoc || !mapContainerRef.current || !window.L) return;

    if (mapRef.current) {
      try {
        mapRef.current.off();
        mapRef.current.remove();
      } catch (e) {}
      mapRef.current = null;
      studentMarkerRef.current = null;
    }

    const centerLat = collegeLoc.latitude;
    const centerLon = collegeLoc.longitude;
    const radius = collegeLoc.radius || 200;

    const map = window.L.map(mapContainerRef.current, {
      dragging: true,
      zoomControl: true,
      scrollWheelZoom: false
    }).setView([centerLat, centerLon], 16);

    mapRef.current = map;

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const collegeMarker = window.L.marker([centerLat, centerLon], {
      title: "College Campus Center"
    }).addTo(map);
    collegeMarker.bindPopup("<b>College Campus Center</b>");

    window.L.circle([centerLat, centerLon], {
      color: '#9333ea',
      fillColor: '#9333ea',
      fillOpacity: 0.12,
      radius: radius
    }).addTo(map);

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
        studentMarkerRef.current = null;
      }
    };
  }, [collegeLoc]);

  // Dynamically update ONLY student position marker without destroying the map
  useEffect(() => {
    if (!mapRef.current || !location || !window.L) return;

    const studentLat = location.latitude;
    const studentLon = location.longitude;

    if (studentMarkerRef.current) {
      studentMarkerRef.current.setLatLng([studentLat, studentLon]);
    } else {
      studentMarkerRef.current = window.L.circleMarker([studentLat, studentLon], {
        radius: 8,
        fillColor: '#2563eb',
        color: 'var(--text-primary)',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(mapRef.current);
      studentMarkerRef.current.bindPopup("<b>Your GPS Position</b>");
    }

    if (collegeLoc) {
      try {
        const bounds = window.L.latLngBounds([
          [collegeLoc.latitude, collegeLoc.longitude],
          [studentLat, studentLon]
        ]);
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      } catch (e) {}
    }
  }, [location, collegeLoc]);

  // Request browser Geolocation manual refresh
  const handleGetLocation = () => {
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
      fetchHistory();
      fetchStudentTrend();
    } catch (err) {
      setMessage({ text: err.message, type: 'danger' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Camera QR Scanner control methods
  const startScanner = () => {
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
          setScannerError('Could not parse scanned QR Code. Make sure it is the attendance QR.');
        }
      };

      // Try starting with environment (back) camera first
      html5QrCode.start(
        { facingMode: 'environment' },
        scanConfig,
        handleScanSuccess,
        () => {} // Silent verbose errors
      ).catch(err => {
        console.warn('Environment camera failed, falling back to front camera:', err);
        // Fallback to user (front) camera (required for laptop testing!)
        return html5QrCode.start(
          { facingMode: 'user' },
          scanConfig,
          handleScanSuccess,
          () => {}
        );
      }).catch(err2 => {
        console.error('All camera starts failed:', err2);
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
    setScannerOpen(false);
  };

  const renderRadialGauge = () => {
    const pct = attendanceData ? attendanceData.currentAttendance : 100.0;
    const radius = 40;
    const stroke = 8;
    const normRadius = radius - stroke * 2;
    const circumference = normRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (pct / 100) * circumference;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '160px' }}>
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
              stroke="#9333ea"
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
            {pct >= 75 ? 'Good Standing' : 'Low Attendance'}
          </strong>
        </div>
      </div>
    );
  };

  const renderTrendGraph = () => {
    if (!attendanceData || !attendanceData.trend || attendanceData.trend.length === 0) {
      return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No trend data available.</div>;
    }

    const points = attendanceData.trend;
    const width = 350;
    const height = 130;
    const padding = 15;
    
    // Map points to SVG coordinates
    const coords = points.map((p, idx) => {
      const x = points.length > 1
        ? padding + (idx / (points.length - 1)) * (width - 2 * padding)
        : width / 2;
      const y = height - padding - (p.percentage / 100) * (height - 2 * padding);
      return { x, y, val: p.percentage, label: p.label };
    });

    let linePath = '';
    let areaPath = '';
    
    if (coords.length > 0) {
      linePath = `M ${coords[0].x} ${coords[0].y} ` + coords.slice(1).map(c => `L ${c.x} ${c.y}`).join(' ');
      areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - padding} L ${coords[0].x} ${height - padding} Z`;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '280px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span>Attendance Trend</span>
          <span>Lectures (OTPs) →</span>
        </div>
        <div style={{ position: 'relative', width: '100%', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9333ea" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#9333ea" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
            <line x1={padding} y1={height/2} x2={width - padding} y2={height/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.1)" />

            {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}
            {linePath && <path d={linePath} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(168, 85, 247, 0.5))' }} />}

            {coords.map((c, idx) => (
              <g key={idx}>
                <circle cx={c.x} cy={c.y} r="3.5" fill="#fff" stroke="#9333ea" strokeWidth="2" />
                {idx === coords.length - 1 && (
                  <text x={c.x} y={c.y - 8} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">
                    {c.val}%
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header className="glass-panel" style={styles.header}>
        <div style={styles.logoGroup}>
          <Smartphone size={24} color="#9333ea" />
          <h1 style={styles.headerTitle}>Student Portal</h1>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.welcomeText}>Welcome, <strong>{user.name}</strong></span>
          <button className="btn btn-secondary" onClick={toggleTheme} style={{ padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Toggle Light/Dark Mode">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="btn btn-secondary" onClick={onLogout} style={styles.logoutBtn}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <div className="responsive-grid-2col">
        {/* Left Side: Submit Panel */}
        <div style={styles.leftCol}>
          {/* Profile Card */}
          <div className="glass-panel" style={styles.profileCard}>
            <div style={styles.profileHeader}>
              <div style={styles.avatar}>
                <User size={24} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{user.name}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: {user.enrollment_no}</span>
              </div>
            </div>
            <div style={styles.profileDetails} className="student-profile-details">
              <div style={styles.detailRow} className="student-profile-item">
                <span style={styles.detailLabel}>Course</span>
                <strong style={styles.detailValue}>{user.course}</strong>
              </div>
              <div style={styles.detailRow} className="student-profile-item">
                <span style={styles.detailLabel}>Semester</span>
                <strong style={styles.detailValue}>Sem {user.semester}</strong>
              </div>
              <div style={styles.detailRow} className="student-profile-item student-profile-item-full">
                <span style={styles.detailLabel}>Mobile</span>
                <strong style={styles.detailValue}>{user.mobile}</strong>
              </div>
            </div>
          </div>

          {/* Submission Form */}
          <div className="glass-panel" style={styles.attendanceFormCard}>
            <h2 style={styles.sectionTitle}>Submit QR Attendance</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {message.text && (
                <div style={{
                  ...styles.statusAlert,
                  ...(message.type === 'success' ? styles.statusSuccess : styles.statusDanger)
                }}>
                  {message.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* QR Scanner Area */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Camera QR Scanner</label>
                
                {scannerOpen ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: '100%' }}>
                    <div id="qr-reader-container" style={{ width: '100%', maxWidth: '320px', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', background: '#000' }} />
                    {scannerError && (
                      <div className="status-badge failed" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem', width: '100%', maxWidth: '320px', textAlign: 'center' }}>
                        {scannerError}
                      </div>
                    )}
                    <button className="btn btn-secondary" onClick={stopScanner} style={{ width: '100%', maxWidth: '320px' }}>
                      Cancel Scan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={startScanner}
                    disabled={submitLoading || !location}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px' }}
                  >
                    <Camera size={18} />
                    {submitLoading ? 'Processing Scan...' : 'Scan Attendance QR'}
                  </button>
                )}
                
                {!location && (
                  <p style={{ fontSize: '0.78rem', color: '#f87171', marginTop: '6px', textAlign: 'center' }}>
                    Waiting for GPS location lock before you can scan.
                  </p>
                )}
              </div>

              {/* GPS Field */}
              <div style={styles.formGroup}>
                <div className="mobile-stack-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={styles.formLabel}>GPS Location Verification</label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleGetLocation}
                    disabled={locLoading}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', gap: '4px' }}
                  >
                    <RefreshCw size={10} className={locLoading ? 'spin-slow' : ''} />
                    Refresh GPS
                  </button>
                </div>

                {locError && <div style={styles.gpsError}>{locError}</div>}

                {location && (
                  <div className="student-location-grid">
                    <div style={styles.locationStat}>
                      <span>Latitude</span>
                      <strong style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{location.latitude.toFixed(6)}</strong>
                    </div>
                    <div style={styles.locationStat}>
                      <span>Longitude</span>
                      <strong style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{location.longitude.toFixed(6)}</strong>
                    </div>
                    {distance !== null && (
                      <div className="student-location-stat-full" style={{
                        ...styles.locationStat,
                        gridColumn: 'span 2',
                        background: distance <= (collegeLoc?.radius || 200.0) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        borderColor: distance <= (collegeLoc?.radius || 200.0) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                      }}>
                        <span>Distance to College Center</span>
                        <strong style={{
                          color: distance <= (collegeLoc?.radius || 200.0) ? '#34d399' : '#f87171',
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '6px',
                          wordBreak: 'break-word',
                          fontSize: '0.88rem'
                        }}>
                          <Navigation size={14} style={{ flexShrink: 0 }} />
                          <span>{distance.toFixed(1)} meters ({distance <= (collegeLoc?.radius || 200.0) ? 'Within Range' : 'Out of Range'})</span>
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Leaflet Live Map Display */}
              {collegeLoc && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <label style={styles.formLabel}>Campus Verification Map (Read-Only)</label>
                  <div 
                    ref={mapContainerRef} 
                    style={{ width: '100%', height: '220px', minHeight: '220px', borderRadius: '10px', zIndex: 0 }}
                  >
                    {!window.L && <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>Loading verification map...</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: History logs & Analytics */}
        <div style={styles.rightCol}>
          {/* Attendance Analytics Gauge and Graph */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={styles.sectionTitle}>Attendance Analytics</h2>
            {trendLoading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading analytics...</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
                {renderRadialGauge()}
                {renderTrendGraph()}
              </div>
            )}
          </div>

          <div className="glass-panel" style={styles.historyCard}>
            <div className="mobile-stack-header" style={styles.historyHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={20} color="#9333ea" />
                <h2 style={styles.sectionTitle}>Attendance History</h2>
              </div>
              <button className="btn btn-secondary" onClick={fetchHistory} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Refresh
              </button>
            </div>

            <div className="custom-table-container">
              {historyLoading ? (
                <div style={styles.loadingState}>Loading history logs...</div>
              ) : history.length === 0 ? (
                <div style={styles.emptyState}>No attendance records found yet.</div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Session/OTP</th>
                      <th>Distance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>{row.time}</td>
                        <td>
                          {row.qr_session_id ? (
                            <span className="status-badge success" style={{ fontSize: '0.75rem', background: 'rgba(147,51,234,0.15)', color: '#a855f7', border: '1px solid rgba(147,51,234,0.3)' }}>
                              QR Session #{row.qr_session_id}
                            </span>
                          ) : (
                            <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                              {row.otp || 'N/A'} (OTP)
                            </code>
                          )}
                        </td>
                        <td>{row.distance}m</td>
                        <td>
                          <span className={`status-badge ${row.status.toLowerCase()}`}>
                            {row.status === 'Success' ? 'Accepted' : 'Rejected'}
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
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box'
  },
  header: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    width: '100%',
    boxSizing: 'border-box'
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
    gap: '16px',
    flexWrap: 'wrap'
  },
  welcomeText: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)'
  },
  logoutBtn: {
    padding: '8px 14px',
    fontSize: '0.85rem'
  },
  // Layouts
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  profileCard: {
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--border-light)'
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px var(--primary-glow)'
  },
  profileDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    width: '100%',
    boxSizing: 'border-box'
  },
  detailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
    overflowWrap: 'break-word',
    wordBreak: 'break-word'
  },
  detailLabel: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  detailValue: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    minWidth: 0,
    overflowWrap: 'break-word',
    wordBreak: 'break-word'
  },
  // Styles continued
  attendanceFormCard: {
    padding: '24px'
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.2rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '20px'
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
  otpInput: {
    fontSize: '1.5rem',
    fontWeight: '700',
    letterSpacing: '0.3em',
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    padding: '12px'
  },
  locationControls: {
    display: 'flex',
    gap: '10px'
  },
  gpsError: {
    fontSize: '0.85rem',
    color: '#f87171',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    padding: '8px 12px',
    borderRadius: '6px',
    marginTop: '6px'
  },
  locationGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '12px'
  },
  locationStat: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  statusAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '500'
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
  historyCard: {
    padding: '24px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px'
  },
  loadingState: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--text-secondary)'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--text-muted)'
  }
};


