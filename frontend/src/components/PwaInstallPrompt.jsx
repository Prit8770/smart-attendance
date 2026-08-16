import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    // If any account is logged in, do not show PWA prompt
    if (localStorage.getItem('attendance_user')) {
      setShowPrompt(false);
      setShowIosTip(false);
      return;
    }

    // Check if already installed in standalone display mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for Chrome/Android/Edge beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      if (localStorage.getItem('attendance_user')) return;
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS and not standalone, show iOS install banner after 3 seconds
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        if (!localStorage.getItem('attendance_user')) {
          setShowIosTip(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  // Strictly do not render if any account is logged in
  if (typeof window !== 'undefined' && localStorage.getItem('attendance_user')) {
    return null;
  }

  if (!showPrompt && !showIosTip) {
    return null;
  }

  return (
    <div style={styles.bannerContainer}>
      <div className="glass-panel" style={styles.bannerCard}>
        <div style={styles.leftGroup}>
          <div style={styles.appIconWrapper}>
            <Smartphone size={24} color="#f59e0b" />
          </div>
          <div>
            <h4 style={styles.title}>Install Smart Attendance App</h4>
            <p style={styles.subtitle}>
              {isIos
                ? 'Tap Share icon below and select "Add to Home Screen"'
                : 'Install as an app for fast offline access & native experience.'}
            </p>
          </div>
        </div>

        <div style={styles.actionGroup}>
          {showPrompt && (
            <button className="btn btn-primary" onClick={handleInstallClick} style={styles.installBtn}>
              <Download size={16} />
              Install App
            </button>
          )}
          {showIosTip && (
            <div style={styles.iosBadge}>
              <Share size={14} color="#60a5fa" />
              <span>Share → Add to Home Screen</span>
            </div>
          )}
          <button
            onClick={() => { setShowPrompt(false); setShowIosTip(false); }}
            style={styles.closeBtn}
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  bannerContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    width: '92%',
    maxWidth: '560px'
  },
  bannerCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderRadius: '16px',
    background: 'rgba(3, 25, 54, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
    gap: '12px',
    flexWrap: 'wrap'
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: '1',
    minWidth: '220px'
  },
  appIconWrapper: {
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#fff',
    margin: 0
  },
  subtitle: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    margin: '2px 0 0 0'
  },
  actionGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  installBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap'
  },
  iosBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    background: 'rgba(37, 99, 235, 0.15)',
    border: '1px solid rgba(37, 99, 235, 0.3)',
    color: '#60a5fa',
    fontSize: '0.78rem',
    fontWeight: '500'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
