import React from 'react';

/**
 * Compact Taggify badge mark — a bold "T" with the orange accent wedge.
 * Legible down to favicon size, unlike a shrunk-down full wordmark.
 */
export const TaggifyIcon = ({ size = 38, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    width={size}
    height={size}
    role="img"
    aria-label="Taggify"
    className={`shrink-0 ${className}`}
  >
    <circle cx="50" cy="50" r="48" fill="#ffffff" />
    <circle cx="50" cy="50" r="48" fill="none" stroke="#e2e8f0" strokeWidth="2" />
    <path d="M24 30 H76 V44 H61 V74 H39 V44 H24 Z" fill="#0a0a0b" />
    <polygon points="50,20 62,44 38,44" fill="#f97316" />
  </svg>
);

/** Full horizontal lockup: mark + TAGGIFY wordmark + optional HRMS badge. */
export const TaggifyLogo = ({
  iconSize = 38,
  showBadge = true,
  showTagline = false,
  className = '',
}) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <TaggifyIcon size={iconSize} />
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <span className="font-display text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
          TAG<span className="text-brand-500">GIFY</span>
        </span>
        {showBadge && <span className="badge-brand">HRMS</span>}
      </div>
      {showTagline && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          People ops, minus the busywork.
        </span>
      )}
    </div>
  </div>
);

export default TaggifyLogo;
