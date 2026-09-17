import React, { useId, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const GAP = 8;

/**
 * Accessible tooltip for icon-only controls.
 *
 * Renders through a portal so it is never clipped by `overflow-hidden`
 * tables, sidebars or modals, and flips to the opposite side when it
 * would run off the viewport.
 *
 *   <Tooltip label="Switch to dark mode">
 *     <button className="btn-icon"><Moon /></button>
 *   </Tooltip>
 */
const Tooltip = ({ label, side = 'top', delay = 120, disabled = false, children }) => {
  const id = useId();
  const triggerRef = useRef(null);
  const timerRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip to the opposite side when there is not enough room.
    let resolved = side;
    if (side === 'top' && r.top < 48) resolved = 'bottom';
    else if (side === 'bottom' && vh - r.bottom < 48) resolved = 'top';
    else if (side === 'left' && r.left < 140) resolved = 'right';
    else if (side === 'right' && vw - r.right < 140) resolved = 'left';

    const anchors = {
      top: { top: r.top - GAP, left: r.left + r.width / 2, translate: 'translate(-50%, -100%)' },
      bottom: { top: r.bottom + GAP, left: r.left + r.width / 2, translate: 'translate(-50%, 0)' },
      left: { top: r.top + r.height / 2, left: r.left - GAP, translate: 'translate(-100%, -50%)' },
      right: { top: r.top + r.height / 2, left: r.right + GAP, translate: 'translate(0, -50%)' },
    };

    setCoords(anchors[resolved]);
  }, [side]);

  const show = useCallback(() => {
    if (disabled || !label) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(place, delay);
  }, [disabled, label, delay, place]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setCoords(null);
  }, []);

  // Dismiss on Escape, and never leave a stale tooltip behind on scroll.
  useEffect(() => {
    if (!coords) return;
    const onKey = (e) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [coords, hide]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!label) return children;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={coords ? id : undefined}
        className="inline-flex"
      >
        {children}
      </span>

      {coords &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ top: coords.top, left: coords.left, transform: coords.translate }}
            className="fixed z-[100] pointer-events-none max-w-[16rem] rounded-md
 bg-slate-900 dark:bg-slate-800 px-2.5 py-1.5
                       text-xs font-medium leading-snug text-white
                       shadow-tooltip ring-1 ring-white/10 animate-tooltip-in"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
};

export default Tooltip;
