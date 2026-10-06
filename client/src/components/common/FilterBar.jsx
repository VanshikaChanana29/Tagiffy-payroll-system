import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, RotateCcw, Search, X } from 'lucide-react';

/**
 * Search box + "Filters" menu + applied-filter chips, shared by the admin
 * list pages so they all filter the same way.
 *
 * Each entry in `filterDefs`:
 *   { key, label, isSet, display, reset, value?, set?, options?, render? }
 * - `options` ([{ value, label }]) renders a select bound to value/set.
 * - `render()` renders custom controls instead (e.g. a time range).
 * - `isSet` says whether the filter is currently narrowing the list; only
 *   those show as chips and count on the button.
 *
 * Which filters are switched on in the menu (`enabledFilters`) lives in the
 * page, so the page can turn one on itself (e.g. a stat card that filters).
 */
const FilterBar = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filterDefs,
  enabledFilters,
  setEnabledFilters,
  visibleCount,
  totalCount,
  onReset,
  extraActive = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const appliedFilters = filterDefs.filter((f) => f.isSet);
  const hasActive = !!search || appliedFilters.length > 0 || extraActive;

  const removeFilter = (def) => {
    def.reset();
    setEnabledFilters((keys) => keys.filter((k) => k !== def.key));
  };

  const toggleFilter = (def) => {
    if (enabledFilters.includes(def.key)) removeFilter(def);
    else setEnabledFilters((keys) => [...keys, def.key]);
  };

  const clearAllFilters = () => {
    filterDefs.forEach((f) => f.reset());
    setEnabledFilters([]);
  };

  const resetAll = () => {
    onSearchChange('');
    clearAllFilters();
    onReset?.();
  };

  // Close the menu on an outside click
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card space-y-3">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="theme-input w-full pl-10 pr-4 text-xs"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end text-xs">
          {visibleCount !== undefined && (
            <span className="text-slate-500 dark:text-slate-400">
              Showing <b className="text-slate-900 dark:text-white">{visibleCount}</b> of {totalCount}
            </span>
          )}

          {hasActive && (
            <button
              type="button"
              onClick={resetAll}
              className="px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className={`px-3.5 py-2 rounded-xl border font-semibold inline-flex items-center gap-1.5 transition-colors ${
                menuOpen || appliedFilters.length
                  ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {appliedFilters.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold inline-flex items-center justify-center">
                  {appliedFilters.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">Filter by</span>
                  {(enabledFilters.length > 0 || appliedFilters.length > 0) && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="py-1">
                  {filterDefs.map((f) => {
                    const enabled = enabledFilters.includes(f.key);
                    return (
                      <div key={f.key} className="px-4 py-2">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-semibold">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleFilter(f)}
                            className="w-3.5 h-3.5 accent-brand-600 cursor-pointer"
                          />
                          {f.label}
                        </label>

                        {enabled && (
                          <div className="mt-2 pl-6">
                            {f.render ? (
                              f.render()
                            ) : (
                              <select
                                value={f.value}
                                onChange={(e) => f.set(e.target.value)}
                                className="theme-input text-xs w-full"
                              >
                                {f.options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {appliedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          {appliedFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-brand-500/10 border border-brand-500/25 text-[11px] text-brand-700 dark:text-brand-300"
            >
              <span className="text-slate-500 dark:text-slate-400">{f.label}:</span>
              <b>{f.display}</b>
              <button
                type="button"
                onClick={() => removeFilter(f)}
                aria-label={`Remove ${f.label} filter`}
                className="p-0.5 rounded-full hover:bg-brand-500/20"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
