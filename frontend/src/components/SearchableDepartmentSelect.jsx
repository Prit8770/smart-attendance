import React, { useMemo } from 'react';
import SearchableSelect from './SearchableSelect';

const findDepartmentByValue = (options, val) => {
  const cleanVal = String(val || '').trim().toLowerCase();
  if (!cleanVal) return null;
  return (
    options.find(d => String(d.id || '').trim().toLowerCase() === cleanVal) ||
    options.find(d => String(d.code || '').trim().toLowerCase() === cleanVal) ||
    options.find(d => String(d.label || '').trim().toLowerCase() === cleanVal) ||
    null
  );
};

const matchDepartmentOption = (opt, cleanSearch) => {
  return (
    String(opt.label || '').toLowerCase().includes(cleanSearch) ||
    String(opt.code || '').toLowerCase().includes(cleanSearch) ||
    String(opt.id || '').toLowerCase().includes(cleanSearch)
  );
};

const findExactDepartmentMatch = (options, trimmed) => {
  const clean = trimmed.toLowerCase();
  return (
    options.find(d => String(d.id || '').trim().toLowerCase() === clean) ||
    options.find(d => String(d.code || '').trim().toLowerCase() === clean) ||
    options.find(d => String(d.label || '').trim().toLowerCase() === clean) ||
    null
  );
};

const formatDepartmentFallback = (val) => String(val);

const SearchableDepartmentSelect = ({
  value,
  onChange,
  placeholder = 'Select Department',
  options,
  isDark = false,
  tabIndex
}) => {
  const departments = useMemo(() => {
    if (Array.isArray(options)) return options;

    try {
      const saved = localStorage.getItem('admin_custom_departments');
      const customList = saved ? JSON.parse(saved) : [];
      if (Array.isArray(customList) && customList.length > 0) {
        return customList
          .map(d => ({
            id: d.name,
            code: d.code,
            label: d.code ? `${d.name} (${d.code})` : d.name
          }))
          .sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, { sensitivity: 'base' }));
      }
    } catch {}

    return [];
  }, [options]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={departments}
      placeholder={placeholder}
      emptyMessage="No departments created yet. Add from Department menu."
      noMatchMessage="No matching department"
      isDark={isDark}
      tabIndex={tabIndex}
      findOptionByValue={findDepartmentByValue}
      matchOption={matchDepartmentOption}
      findExactMatch={findExactDepartmentMatch}
      formatFallbackLabel={formatDepartmentFallback}
    />
  );
};

export default SearchableDepartmentSelect;
