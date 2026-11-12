import React, { useMemo } from 'react';
import SearchableSelect from './SearchableSelect';

const matchSemesterOption = (opt, cleanSearch) => {
  const cleanNum = cleanSearch.replace(/\D/g, '');
  return (
    String(opt.label || '').toLowerCase().includes(cleanSearch) ||
    (cleanNum && String(opt.id) === cleanNum)
  );
};

const findExactSemesterMatch = (options, trimmed) => {
  const cleanNum = trimmed.replace(/\D/g, '');
  return options.find(s => String(s.id) === cleanNum) || null;
};

const formatSemesterFallback = (val) => `Semester ${val}`;

const SearchableSemesterSelect = ({
  value,
  onChange,
  placeholder = 'Select Semester',
  options,
  isDark = false,
  tabIndex
}) => {
  const semesters = useMemo(() => {
    if (Array.isArray(options) && options.length > 0) return options;

    try {
      const saved = localStorage.getItem('admin_custom_semesters');
      const customList = saved ? JSON.parse(saved) : [];
      if (Array.isArray(customList) && customList.length > 0) {
        const customItems = customList.map(c => {
          const semId = String(c.semNumber || c.id).trim();
          const semLabel = c.name || `Semester ${semId}`;
          return { id: semId, label: semLabel };
        });
        return customItems.sort((a, b) => {
          const numA = parseInt(a.id, 10) || 999;
          const numB = parseInt(b.id, 10) || 999;
          return numA - numB;
        });
      }
    } catch {}

    return [];
  }, [options]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={semesters}
      placeholder={placeholder}
      emptyMessage="No semesters created yet. Add from Semester menu."
      noMatchMessage="No matching semester"
      isDark={isDark}
      tabIndex={tabIndex}
      matchOption={matchSemesterOption}
      findExactMatch={findExactSemesterMatch}
      formatFallbackLabel={formatSemesterFallback}
    />
  );
};

export default SearchableSemesterSelect;
