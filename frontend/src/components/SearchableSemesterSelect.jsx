import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const SearchableSemesterSelect = ({
  value,
  onChange,
  placeholder = "Select Semester (1-8)",
  isDark = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef(null);

  const semesters = [
    { id: '1', label: 'Semester 1' },
    { id: '2', label: 'Semester 2' },
    { id: '3', label: 'Semester 3' },
    { id: '4', label: 'Semester 4' },
    { id: '5', label: 'Semester 5' },
    { id: '6', label: 'Semester 6' },
    { id: '7', label: 'Semester 7' },
    { id: '8', label: 'Semester 8' }
  ];

  // Synchronize inputText with selected value when closed or value changes
  useEffect(() => {
    if (!isOpen) {
      const match = semesters.find(s => String(s.id) === String(value));
      setInputText(match ? match.label : (value ? `Semester ${value}` : ''));
    }
  }, [value, isOpen]);

  // Reset highlighted index when typing
  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputText]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter 1-8 semesters based on input text
  const filtered = semesters.filter(s => {
    if (!inputText || !isOpen) return true;
    const cleanSearch = inputText.toLowerCase().trim();
    const cleanNum = cleanSearch.replace(/\D/g, '');
    return (
      s.label.toLowerCase().includes(cleanSearch) ||
      (cleanNum && s.id === cleanNum)
    );
  });

  const handleSelectOption = (semId) => {
    onChange(semId);
    const match = semesters.find(s => String(s.id) === String(semId));
    setInputText(match ? match.label : `Semester ${semId}`);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered.length > 0) {
        e.preventDefault();
        const selected = filtered[highlightedIndex] || filtered[0];
        handleSelectOption(selected.id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) {
        const cleanNum = inputText.trim().replace(/\D/g, '');
        if (cleanNum >= '1' && cleanNum <= '8') {
          handleSelectOption(cleanNum);
        } else if (filtered.length > 0) {
          handleSelectOption(filtered[0].id);
        } else {
          const match = semesters.find(s => String(s.id) === String(value));
          setInputText(match ? match.label : (value ? `Semester ${value}` : ''));
        }
        setIsOpen(false);
      }
    }, 150);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {/* Main Semester Input Box - User types directly here */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={inputText}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            const val = e.target.value;
            setInputText(val);
            setIsOpen(true);
            const digit = val.trim().replace(/\D/g, '');
            if (digit >= '1' && digit <= '8') {
              onChange(digit);
            }
          }}
          style={{
            width: '100%',
            padding: '10px 36px 10px 14px',
            borderRadius: '10px',
            border: isOpen
              ? '1.5px solid #f59e0b'
              : (isDark ? '1px solid rgba(255,255,255,0.15)' : '1.5px solid #cbd5e1'),
            background: isDark ? '#0f172a' : '#f8fafc',
            color: isDark ? 'var(--text-primary)' : '#0f172a',
            fontSize: '0.88rem',
            fontWeight: '500',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: isOpen ? '0 0 0 3px rgba(245, 158, 11, 0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        />
        <ChevronDown
          size={16}
          color={isDark ? 'var(--text-secondary)' : '#64748b'}
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: `translateY(-50%) ${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}`,
            transition: 'transform 0.2s ease',
            cursor: 'pointer'
          }}
        />
      </div>

      {/* Direct Dropdown Options List */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: isDark ? '#1e293b' : '#ffffff',
            border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
            borderRadius: '12px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
            zIndex: 10005,
            padding: '6px',
            maxHeight: '200px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center' }}>
              No matching semester (Use 1-8)
            </div>
          ) : (
            filtered.map((sem, idx) => {
              const isSelected = String(value) === String(sem.id);
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={sem.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectOption(sem.id);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.86rem',
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? '#d97706' : (isDark ? '#e2e8f0' : '#334155'),
                    background: isSelected
                      ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#fef3c7')
                      : (isHighlighted ? (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9') : 'transparent'),
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <span>{sem.label}</span>
                  {isSelected && <Check size={14} color="#d97706" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSemesterSelect;
