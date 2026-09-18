import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, CalendarClock, MapPinOff, FileText, Wallet, ClipboardCheck, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '../../context/NotificationContext';
import Tooltip from '../common/Tooltip';

const ICONS_BY_TYPE = {
  leave_applied: CalendarClock,
  leave_approved: CalendarClock,
  leave_rejected: CalendarClock,
  leave_cancelled: CalendarClock,
  regularization_requested: ClipboardCheck,
  regularization_approved: ClipboardCheck,
  regularization_rejected: ClipboardCheck,
  attendance_outside_geofence: MapPinOff,
  attendance_late: Clock,
  document_uploaded: FileText,
  document_verified: FileText,
  document_rejected: FileText,
  payslip_generated: Wallet,
};

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { notifications, unreadCount, refreshNotifications, markAsRead, markAllAsRead } =
    useNotifications();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) refreshNotifications();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Tooltip label="Notifications" side="bottom">
        <button
          type="button"
          onClick={toggleOpen}
          className="btn-icon relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Bell className="w-3.5 h-3.5 text-brand-500" />
              <span>Notifications</span>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                You're all caught up — no notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = ICONS_BY_TYPE[n.type] || Bell;
                return (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => !n.isRead && markAsRead(n._id)}
                    className={`w-full text-left px-3.5 py-3 flex items-start gap-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0 transition-colors ${
                      n.isRead
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        : 'bg-brand-50/60 dark:bg-brand-950/30 hover:bg-brand-50 dark:hover:bg-brand-950/50'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      <Icon
                        className={`w-4 h-4 ${
                          n.isRead ? 'text-slate-400' : 'text-brand-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            n.isRead ? 'text-slate-600 dark:text-slate-300' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
