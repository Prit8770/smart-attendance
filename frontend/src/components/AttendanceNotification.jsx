import React, { useEffect, useRef, useState } from 'react';

/**
 * AttendanceNotification - Premium redesigned popup
 * Props:
 *  - type: 'success' | 'error'
 *  - title: string
 *  - message: string
 *  - onClose: () => void
 *  - duration: number (ms, default 3000) — auto dismisses after this time
 */
export default function AttendanceNotification({ type, title, message, onClose, duration = 3000 }) {
  const [phase, setPhase] = useState('enter'); // enter | visible | exit

  // Store onClose in a ref so changing parent inline functions don't reset our timers
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    // Step 1: show after tiny delay for mount animation
    const visibleTimer = setTimeout(() => setPhase('visible'), 50);
    // Step 2: start exit animation after `duration` ms
    const exitTimer = setTimeout(() => setPhase('exit'), duration);
    // Step 3: fully unmount after exit animation finishes
    const closeTimer = setTimeout(() => onCloseRef.current && onCloseRef.current(), duration + 550);

    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← run ONCE on mount only — timers must never reset

  const isSuccess = type === 'success';
  const accent     = isSuccess ? '#22d3a5' : '#f87171';
  const accentDark = isSuccess ? '#0d9372' : '#b91c1c';

  /* ── Overlay ── */
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: phase === 'exit' ? 'rgba(0,0,0,0)' : 'rgba(8,8,18,0.72)',
    backdropFilter: phase === 'exit' ? 'blur(0px)' : 'blur(16px)',
    WebkitBackdropFilter: phase === 'exit' ? 'blur(0px)' : 'blur(16px)',
    transition: 'background 0.5s ease, backdrop-filter 0.5s ease',
    padding: '20px',
  };

  /* ── Card ── */
  const cardStyle = {
    position: 'relative',
    width: '100%',
    maxWidth: '370px',
    background: isSuccess
      ? 'linear-gradient(160deg, #061612 0%, #0a2a22 55%, #071a15 100%)'
      : 'linear-gradient(160deg, #160606 0%, #2a0a0a 55%, #1a0707 100%)',
    border: `1.5px solid ${isSuccess ? 'rgba(34,211,165,0.28)' : 'rgba(248,113,113,0.28)'}`,
    borderRadius: '28px',
    overflow: 'hidden',
    textAlign: 'center',
    boxShadow: isSuccess
      ? '0 48px 120px rgba(0,0,0,0.75), 0 0 80px rgba(34,211,165,0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
      : '0 48px 120px rgba(0,0,0,0.75), 0 0 80px rgba(248,113,113,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
    transform: phase === 'enter'
      ? 'scale(0.55) translateY(60px)'
      : phase === 'exit'
      ? 'scale(0.78) translateY(-28px)'
      : 'scale(1) translateY(0)',
    opacity: (phase === 'enter' || phase === 'exit') ? 0 : 1,
    transition: 'transform 0.58s cubic-bezier(0.175, 0.885, 0.32, 1.42), opacity 0.48s ease',
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&family=Inter:wght@400;500&display=swap');

        @keyframes _an_iconPop {
          0%   { transform: scale(0) rotate(-25deg); opacity: 0; }
          72%  { transform: scale(1.15) rotate(4deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes _an_checkDraw {
          0%   { stroke-dashoffset: 90; opacity: 0; }
          20%  { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes _an_crossL {
          0%   { stroke-dashoffset: 60; opacity: 0; }
          20%  { opacity: 1; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes _an_crossR {
          0%   { stroke-dashoffset: 60; opacity: 0; }
          40%  { opacity: 1; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes _an_fadeUp {
          0%   { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes _an_progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        @keyframes _an_glowSuccess {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,211,165,0.0); }
          50%      { box-shadow: 0 0 28px 8px rgba(34,211,165,0.28); }
        }
        @keyframes _an_glowError {
          0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.0); }
          50%      { box-shadow: 0 0 28px 8px rgba(248,113,113,0.28); }
        }
        @keyframes _an_ringPulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(1.7); opacity: 0;   }
        }
        @keyframes _an_shimmer {
          0%   { transform: translateX(-150%); }
          100% { transform: translateX(150%); }
        }

        /* ── Icon ── */
        ._an_iconWrap {
          position: relative;
          width: 90px;
          height: 90px;
          margin: 0 auto 20px;
        }
        ._an_iconCircle {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }
        ._an_iconCircle.success {
          background: radial-gradient(circle at 30% 30%, rgba(34,211,165,0.22), rgba(13,147,114,0.08));
          border: 2px solid rgba(34,211,165,0.5);
          animation: _an_iconPop 0.62s cubic-bezier(0.175,0.885,0.32,1.4) 0.06s both,
                     _an_glowSuccess 2.4s ease-in-out 0.7s infinite;
        }
        ._an_iconCircle.error {
          background: radial-gradient(circle at 30% 30%, rgba(248,113,113,0.22), rgba(185,28,28,0.08));
          border: 2px solid rgba(248,113,113,0.5);
          animation: _an_iconPop 0.62s cubic-bezier(0.175,0.885,0.32,1.4) 0.06s both,
                     _an_glowError 2.4s ease-in-out 0.7s infinite;
        }
        ._an_ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2.5px solid currentColor;
          animation: _an_ringPulse 1.9s ease-out 0.6s infinite;
        }
        ._an_ring.success { color: rgba(34,211,165,0.55); }
        ._an_ring.error   { color: rgba(248,113,113,0.55); }

        /* ── Badge ── */
        ._an_badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 14px;
          border-radius: 999px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 18px;
          animation: _an_fadeUp 0.4s ease 0.18s both;
        }
        ._an_badge.success {
          background: rgba(34,211,165,0.1);
          border: 1px solid rgba(34,211,165,0.28);
          color: #22d3a5;
        }
        ._an_badge.error {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.28);
          color: #f87171;
        }
        ._an_badgeDot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        /* ── Text ── */
        ._an_title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.5rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.025em;
          line-height: 1.2;
          margin-bottom: 9px;
          animation: _an_fadeUp 0.4s ease 0.3s both;
        }
        ._an_msg {
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.58);
          line-height: 1.65;
          animation: _an_fadeUp 0.4s ease 0.4s both;
          max-width: 270px;
          margin: 0 auto;
        }

        /* ── Divider ── */
        ._an_divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          animation: _an_fadeUp 0.3s ease 0.48s both;
        }

        /* ── Timer row ── */
        ._an_timerRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 28px 10px;
          animation: _an_fadeUp 0.3s ease 0.52s both;
        }
        ._an_timerLabel {
          font-family: 'Inter', sans-serif;
          font-size: 0.7rem;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.02em;
        }
        ._an_dots { display: flex; gap: 4px; align-items: center; }
        ._an_dot  {
          width: 5px; height: 5px;
          border-radius: 50%;
        }

        /* ── Progress ── */
        ._an_progressTrack {
          margin: 0 28px 28px;
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.07);
          overflow: hidden;
          animation: _an_fadeUp 0.3s ease 0.55s both;
        }
        ._an_progressBar {
          height: 100%;
          border-radius: 999px;
          position: relative;
          overflow: hidden;
        }
        ._an_progressBar::after {
          content: '';
          position: absolute;
          top: 0; bottom: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
          animation: _an_shimmer 1.6s ease-in-out infinite;
        }

        /* ── Close ── */
        ._an_closeBtn {
          position: absolute;
          top: 14px; right: 14px;
          width: 30px; height: 30px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.38);
          font-size: 1.1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
          z-index: 10;
          line-height: 1;
          animation: _an_fadeUp 0.3s ease 0.6s both;
        }
        ._an_closeBtn:hover { background: rgba(255,255,255,0.16); color: #fff; }
      `}</style>

      <div style={overlayStyle} onClick={onClose}>
        <div style={cardStyle} onClick={e => e.stopPropagation()}>

          {/* Close button */}
          <button className="_an_closeBtn" onClick={onClose} title="Close">×</button>

          {/* Banner / top section */}
          <div style={{ padding: '40px 28px 28px', position: 'relative', overflow: 'hidden' }}>
            {/* Soft glow blob behind icon */}
            <div style={{
              position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
              width: 200, height: 200, borderRadius: '50%',
              background: isSuccess ? 'rgba(34,211,165,0.1)' : 'rgba(248,113,113,0.1)',
              filter: 'blur(50px)', pointerEvents: 'none',
            }} />

            {/* Status badge */}
            <div className={`_an_badge ${type}`}>
              <span className="_an_badgeDot" />
              {isSuccess ? 'Attendance Recorded' : 'Attendance Failed'}
            </div>

            {/* Icon */}
            <div className="_an_iconWrap">
              <div className={`_an_iconCircle ${type}`}>
                {isSuccess ? (
                  <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
                    <path
                      d="M10 23L19 32L36 15"
                      stroke={accent}
                      strokeWidth="4.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="90"
                      strokeDashoffset="90"
                      style={{ animation: '_an_checkDraw 0.68s cubic-bezier(0.4,0,0.2,1) 0.28s forwards' }}
                    />
                  </svg>
                ) : (
                  <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
                    <path
                      d="M14 14L32 32"
                      stroke={accent}
                      strokeWidth="4.2"
                      strokeLinecap="round"
                      strokeDasharray="60"
                      strokeDashoffset="60"
                      style={{ animation: '_an_crossL 0.46s ease 0.22s forwards' }}
                    />
                    <path
                      d="M32 14L14 32"
                      stroke={accent}
                      strokeWidth="4.2"
                      strokeLinecap="round"
                      strokeDasharray="60"
                      strokeDashoffset="60"
                      style={{ animation: '_an_crossR 0.52s ease 0.18s forwards' }}
                    />
                  </svg>
                )}
              </div>
              {/* Pulsing ring */}
              <div className={`_an_ring ${type}`} />
            </div>

            {/* Title */}
            <div className="_an_title">{title}</div>

            {/* Message */}
            <div className="_an_msg">{message}</div>
          </div>

          {/* Divider */}
          <div className="_an_divider" />

          {/* Timer row */}
          <div className="_an_timerRow">
            <span className="_an_timerLabel">Auto-closing…</span>
            <div className="_an_dots">
              {[0.9, 0.6, 0.35].map((op, i) => (
                <div key={i} className="_an_dot" style={{ background: accent, opacity: op }} />
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="_an_progressTrack">
            <div
              className="_an_progressBar"
              style={{
                background: `linear-gradient(90deg, ${accentDark}, ${accent})`,
                animation: `_an_progress ${duration}ms linear 60ms both`,
              }}
            />
          </div>

        </div>
      </div>
    </>
  );
}
