import React from 'react';
import { CheckCircle, ShieldAlert, Info, X } from 'lucide-react';

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      maxWidth: '420px',
      width: 'calc(100vw - 48px)',
      pointerEvents: 'none'
    }}>
      {toasts.map(toast => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        const bg = isError 
          ? 'linear-gradient(135deg, rgba(220, 38, 38, 0.45) 0%, rgba(185, 28, 28, 0.35) 100%)' 
          : isWarning 
            ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.45) 0%, rgba(217, 119, 6, 0.35) 100%)' 
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.45) 0%, rgba(5, 150, 105, 0.35) 100%)';

        const borderColor = isError 
          ? 'rgba(248, 113, 113, 0.85)' 
          : isWarning 
            ? 'rgba(254, 240, 138, 0.85)' 
            : 'rgba(110, 231, 183, 0.85)';

        const shadow = isError
          ? '0 12px 32px rgba(220, 38, 38, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.75)'
          : isWarning
            ? '0 12px 32px rgba(245, 158, 11, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.75)'
            : '0 12px 32px rgba(16, 185, 129, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.75)';

        const IconComponent = isError || isWarning 
          ? ShieldAlert 
          : CheckCircle;

        return (
          <div
            key={toast.id}
            className="toast-notification-item"
            style={{
              pointerEvents: 'auto',
              background: bg,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1.5px solid ${borderColor}`,
              boxShadow: shadow,
              borderRadius: '14px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#ffffff',
              fontSize: '0.92rem',
              fontWeight: '600',
              lineHeight: '1.45',
              letterSpacing: '0.01em',
              animation: 'toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <IconComponent size={22} color={isWarning ? '#fef08a' : '#ffffff'} style={{ flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
            <div style={{ flex: 1, wordBreak: 'break-word', color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', fontWeight: '600' }}>
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s',
                marginLeft: '6px',
                flexShrink: 0
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)'; }}
              title="Close Notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
