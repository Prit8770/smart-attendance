import React from 'react';
import { CheckCircle, ShieldAlert, X } from 'lucide-react';

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      id="toast-container-root"
      className="toast-container-wrapper"
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        left: 'auto',
        bottom: 'auto',
        zIndex: 10000000,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '420px',
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none'
      }}
    >
      {toasts.map(toast => {
        const isSuccess = toast.type === 'success';

        // Transparent Red Glassmorphism for errors & warnings as requested
        const bg = isSuccess
          ? 'linear-gradient(135deg, rgba(209, 250, 229, 0.88) 0%, rgba(167, 243, 208, 0.78) 100%)'
          : 'linear-gradient(135deg, rgba(254, 226, 226, 0.88) 0%, rgba(252, 165, 165, 0.78) 100%)';

        const borderColor = isSuccess
          ? 'rgba(16, 185, 129, 0.5)'
          : 'rgba(239, 68, 68, 0.5)';

        const textColor = '#000000'; // Black text color as requested!

        const iconColor = isSuccess
          ? '#059669'
          : '#dc2626';

        const shadow = isSuccess
          ? '0 12px 32px rgba(16, 185, 129, 0.25)'
          : '0 12px 32px rgba(220, 38, 38, 0.25)';

        const IconComponent = isSuccess
          ? CheckCircle
          : ShieldAlert;

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
              color: textColor,
              fontSize: '0.92rem',
              fontWeight: '700',
              lineHeight: '1.45',
              letterSpacing: '0.01em',
              animation: 'toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <IconComponent size={22} color={iconColor} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, wordBreak: 'break-word', color: textColor, fontWeight: '700' }}>
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'rgba(0, 0, 0, 0.08)',
                border: 'none',
                color: textColor,
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
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.08)'; }}
              title="Close Notification"
            >
              <X size={16} color={textColor} />
            </button>
          </div>
        );
      })}
    </div>
  );
}


