import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Pages an already searched, filtered and sorted list. Paging is the last
 * step on purpose: search, filters and sorting always cover everyone, and the
 * page only decides which slice of that result is on screen.
 *
 * `resetKey` should change whenever the search/filters/sort change, so the
 * view jumps back to page 1 instead of landing on an empty page.
 */
export const usePagination = (items, resetKey, initialPageSize = 10) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // A delete or status change can shrink the list under the current page.
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return { page: currentPage, setPage, pageSize, setPageSize, totalPages, pageItems, total: items.length };
};

// Page numbers with gaps, e.g. 1 … 4 5 6 … 12
const pageList = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap-' + p);
    out.push(p);
  });
  return out;
};

const Pagination = ({ page, setPage, pageSize, setPageSize, totalPages, total, label = 'records' }) => {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const btn =
    'min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center transition-colors';

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
        <span>
          Showing <b className="text-slate-900 dark:text-white">{from}–{to}</b> of{' '}
          <b className="text-slate-900 dark:text-white">{total}</b> {label}
        </span>
        <label className="flex items-center gap-1.5">
          <span>Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="theme-input text-xs py-1"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className={`${btn} text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageList(page, totalPages).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`${btn} ${
                  p === page
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            className={`${btn} text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </nav>
      )}
    </div>
  );
};

export default Pagination;
