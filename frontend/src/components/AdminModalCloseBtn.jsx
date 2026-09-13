import React, { useState } from 'react';
import { X } from 'lucide-react';

/**
 * AdminModalCloseBtn
 * Premium dark squircle close button inspired by HDHub4u card close design.
 * - Default: Dark charcoal squircle with muted slate-gray X (Photo 2)
 * - Hover / Active / Click: Turns white and spins clockwise to the right once (Photo 3)
 */
const AdminModalCloseBtn = ({
  onClick,
  title = 'Close Form',
  size = 17,
  className = '',
  style = {}
}) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isClosing) return;

    setIsClosing(true);
    // Smooth right-side clockwise rotation completes, then close the form modal
    setTimeout(() => {
      onClick?.(e);
      setIsClosing(false);
    }, 180);
  };

  return (
    <button
      type="button"
      className={`admin-modal-close-btn ${isClosing ? 'is-closing' : ''} ${className}`.trim()}
      onClick={handleClick}
      title={title}
      aria-label={title}
      style={style}
    >
      <span className="admin-modal-close-icon">
        <X size={size} strokeWidth={2.4} />
      </span>
    </button>
  );
};

export default AdminModalCloseBtn;
