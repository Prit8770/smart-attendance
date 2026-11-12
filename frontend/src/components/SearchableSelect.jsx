import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Shared searchable dropdown input styled to match the form inputs and
 * Semester selector in Add/Edit modals.
 */
const SearchableSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select Option',
  emptyMessage = 'No options available.',
  noMatchMessage = 'No matching option',
  isDark = false,
  tabIndex,
  findOptionByValue,
  matchOption,
  findExactMatch,
  formatFallbackLabel
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [inputText, setInputText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef(null);

  const resolveByValue = useCallback((val) => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    if (findOptionByValue) return findOptionByValue(options, val);
    return options.find(opt => String(opt.id) === String(val)) || null;
  }, [options, findOptionByValue]);

  const getDisplayText = useCallback((val) => {
    const match = resolveByValue(val);
    if (match) return match.label;
    if (val === undefined || val === null || String(val).trim() === '') return '';
    return formatFallbackLabel ? formatFallbackLabel(val) : String(val);
  }, [resolveByValue, formatFallbackLabel]);

  useEffect(() => {
    if (!isOpen) {
      setInputText(getDisplayText(value));
      setHasTyped(false);
    }
  }, [value, isOpen, getDisplayText]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputText]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter((opt) => {
    if (!isOpen || !hasTyped || !inputText.trim()) return true;
    const cleanSearch = inputText.toLowerCase().trim();
    if (matchOption) return matchOption(opt, cleanSearch);
    return (
      String(opt.label || '').toLowerCase().includes(cleanSearch) ||
      String(opt.code || '').toLowerCase().includes(cleanSearch) ||
      String(opt.id || '').toLowerCase().includes(cleanSearch)
    );
  });

  const handleSelectOption = (optionId) => {
    onChange(optionId);
    setInputText(getDisplayText(optionId));
    setHasTyped(false);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        if (e.key === 'Enter') e.preventDefault();
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
    } else if (e.key === 'Enter') {
      if (filtered.length > 0) {
        e.preventDefault();
        const selected = filtered[highlightedIndex] || filtered[0];
        handleSelectOption(selected.id);
      }
    } else if (e.key === 'Tab') {
      if (hasTyped && filtered.length > 0) {
        const selected = filtered[highlightedIndex] || filtered[0];
        handleSelectOption(selected.id);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHasTyped(false);
      setInputText(getDisplayText(value));
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) {
        const trimmed = inputText.trim();
        if (!trimmed) {
          setInputText('');
          if (onChange) onChange('');
        } else if (hasTyped) {
          const exact = findExactMatch ? findExactMatch(options, trimmed) : null;
          if (exact) {
            handleSelectOption(exact.id);
          } else if (filtered.length > 0) {
            handleSelectOption(filtered[0].id);
          } else {
            setInputText(getDisplayText(value));
          }
        } else {
          setInputText(getDisplayText(value));
        }
        setHasTyped(false);
        setIsOpen(false);
      }
    }, 150);
  };

  const currentMatch = resolveByValue(value);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={inputText}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            setHasTyped(false);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          tabIndex={tabIndex}
          onChange={(e) => {
            const val = e.target.value;
            setInputText(val);
            setHasTyped(true);
            setIsOpen(true);
            if (!val.trim()) {
              onChange('');
              return;
            }
            if (findExactMatch) {
              const exact = findExactMatch(options, val.trim());
              if (exact) onChange(exact.id);
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
          onMouseDown={(e) => {
            e.preventDefault();
            setHasTyped(false);
            setIsOpen(prev => !prev);
          }}
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
            <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center' }}>
              {options.length === 0 ? emptyMessage : noMatchMessage}
            </div>
          ) : (
            filtered.map((opt, idx) => {
              const isSelected = currentMatch
                ? String(currentMatch.id) === String(opt.id)
                : String(value) === String(opt.id);
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={opt.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectOption(opt.id);
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
                  <span>{opt.label}</span>
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

export default SearchableSelect;
