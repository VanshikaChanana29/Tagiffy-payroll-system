import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Building,
  Laptop,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../common/Tooltip';
import { format as formatDate } from 'date-fns';

// "239" -> "3h 59m", "12" -> "12m"
const formatMinutes = (mins) => {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const MonthAttendanceCalendar = ({ onAttendanceChange }) => {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1); // 1-12
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'

  const [monthlyDays, setMonthlyDays] = useState([]);
  const [weeklyDays, setWeeklyDays] = useState([]);
  const [monthName, setMonthName] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Selected Day Modal State
  const [selectedDay, setSelectedDay] = useState(null);

  const toast = useToast();

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);
      const [monthRes, weekRes] = await Promise.all([
        api.get(`/attendance/my-monthly?year=${currentYear}&month=${currentMonth}`),
        api.get('/attendance/my-weekly'),
      ]);

      if (monthRes.data.success) {
        setMonthlyDays(monthRes.data.monthlyDays || []);
        setMonthName(monthRes.data.monthName || '');
        setStats(monthRes.data.stats || null);
      }

      if (weekRes.data.success) {
        setWeeklyDays(weekRes.data.weeklyDays || []);
      }
    } catch (error) {
      toast.error('Failed to load monthly attendance calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyData();
  }, [currentYear, currentMonth]);

  // Handle month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  };

  // Helper to determine day of week offset for the first day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayOfWeek = monthlyDays.length > 0 ? new Date(monthlyDays[0].date).getDay() : 0;
  const paddingDays = Array.from({ length: firstDayOfWeek });

  const getStatusStyle = (status, isToday) => {
    switch (status) {
      case 'Present':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
          border: 'border-emerald-200 dark:border-emerald-800/60',
          badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
          dot: 'bg-emerald-500',
          text: 'text-emerald-700 dark:text-emerald-300',
        };
      case 'Half-day':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/40',
          border: 'border-amber-200 dark:border-amber-800/60',
          badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          dot: 'bg-amber-500',
          text: 'text-amber-700 dark:text-amber-300',
        };
      case 'Leave':
        return {
          bg: 'bg-brand-50 dark:bg-brand-950/40',
          border: 'border-brand-200 dark:border-brand-800/60',
          badgeBg: 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/30',
          dot: 'bg-brand-500',
          text: 'text-brand-700 dark:text-brand-300',
        };
      case 'Absent':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/40',
          border: 'border-rose-200 dark:border-rose-800/60',
          badgeBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
          dot: 'bg-rose-500',
          text: 'text-rose-700 dark:text-rose-300',
        };
      case 'Holiday':
        // Company holiday: nobody is expected in, so it must never read as Absent.
        return {
          bg: 'bg-violet-50/70 dark:bg-violet-950/30',
          border: 'border-violet-200 dark:border-violet-900/60',
          badgeBg: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
          dot: 'bg-violet-400',
          text: 'text-violet-700 dark:text-violet-300',
        };
      case 'Pre-joining':
        // Before the employee joined: not a working day for them, and never absent.
        return {
          bg: 'bg-slate-50/60 dark:bg-slate-950/20 opacity-50',
          border: 'border-dashed border-slate-200 dark:border-slate-800/60',
          badgeBg: 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500',
          dot: 'bg-slate-300 dark:bg-slate-700',
          text: 'text-slate-400 dark:text-slate-500',
        };
      case 'Weekend':
        return {
          bg: 'bg-slate-50 dark:bg-slate-950/40 opacity-75',
          border: 'border-slate-200/60 dark:border-slate-800/40',
          badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
          dot: 'bg-slate-400',
          text: 'text-slate-500 dark:text-slate-400',
        };
      default: // 'Upcoming'
        return {
          bg: 'bg-white dark:bg-slate-900',
          border: 'border-slate-200 dark:border-slate-800',
          badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-400',
          dot: 'bg-slate-300',
          text: 'text-slate-400',
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* Calendar Card Container */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-7 shadow-sm dark:shadow-card transition-colors">
        
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Monthly Attendance Calendar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Full month schedule, logs, and status breakdown
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Month Switcher & View Mode */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle (Month / Week) */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  viewMode === 'month'
                    ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Month Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  viewMode === 'week'
                    ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Week Strip
              </button>
            </div>

            {/* Navigation: Prev, Today, Next */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <Tooltip label="Previous month" side="top">
                <button aria-label="Previous month"
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-1 text-xs font-bold rounded-xl bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:bg-brand-500/25 transition-colors"
              >
                Today
              </button>
              <Tooltip label="Next month" side="top">
                <button aria-label="Next month"
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>

            {/* Month & Year Title Header */}
            <div className="px-3.5 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-extrabold shadow-sm min-w-[120px] text-center">
              {monthName} {currentYear}
            </div>
          </div>
        </div>

        {/* Legend Badges */}
        <div className="flex flex-wrap items-center gap-2 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] mr-1">Legend:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/25">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Present
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/25">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Half-day
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold border border-brand-500/25">
            <span className="w-2 h-2 rounded-full bg-brand-500"></span> Leave
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold border border-rose-500/25">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Absent
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span> Weekend / Off
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span> Before joining
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-400"></span> Holiday
          </span>
        </div>

        {/* VIEW 1: FULL MONTH GRID */}
        {viewMode === 'month' && (
          <div>
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <div className="py-2 text-rose-500/80 dark:text-rose-400/80">Sun</div>
              <div className="py-2">Mon</div>
              <div className="py-2">Tue</div>
              <div className="py-2">Wed</div>
              <div className="py-2">Thu</div>
              <div className="py-2">Fri</div>
              <div className="py-2 text-rose-500/80 dark:text-rose-400/80">Sat</div>
            </div>

            {loading ? (
              <div className="p-16 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium">Building month attendance calendar...</span>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {/* Padding cells for first week alignment */}
                {paddingDays.map((_, idx) => (
                  <div
                    key={`pad-${idx}`}
                    className="min-h-[85px] sm:min-h-[105px] rounded-xl bg-slate-50/40 dark:bg-slate-950/20 border border-dashed border-slate-200/50 dark:border-slate-800/40 pointer-events-none"
                  ></div>
                ))}

                {/* Actual Days of the Month */}
                {monthlyDays.map((day) => {
                  const style = getStatusStyle(day.status, day.isToday);
                  return (
                    <div
                      key={day.date}
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[85px] sm:min-h-[105px] p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] flex flex-col justify-between relative group ${
                        style.bg
                      } ${style.border} ${
                        day.isToday
                          ? 'ring-2 ring-brand-500 shadow-soft dark: z-10'
                          : 'hover:border-brand-400/60 dark:hover:border-brand-500/60 shadow-sm'
                      }`}
                    >
                      {/* Top Date Header */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs sm:text-sm font-black ${
                            day.isToday ? 'text-brand-600 dark:text-brand-300' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {day.dayNumber}
                        </span>
                        {day.isToday && (
                          <span className="text-[9px] uppercase font-extrabold px-1 py-0.2 rounded bg-brand-600 text-white shadow-sm">
                            Today
                          </span>
                        )}
                      </div>

                      {/* Middle Status Pill */}
                      <div className="my-1.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg border ${style.badgeBg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                          <span className="truncate max-w-[55px] sm:max-w-none">{day.status}</span>
                        </span>
                      </div>

                      {day.holidayName && (
                        <div className="text-[9px] font-bold text-violet-700 dark:text-violet-300 truncate mb-1">
                          {day.holidayName}
                        </div>
                      )}

                      {/* Late / overtime / regularized markers */}
                      {(day.isLate || day.overtimeHours > 0 || day.isRegularized) && (
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          {day.isLate && (
                            <span
                              title={
                                day.checkIn
                                  ? `Checked in at ${formatDate(new Date(day.checkIn), 'hh:mm a')} — late by ${formatMinutes(day.lateMinutes)}`
                                  : `Late by ${formatMinutes(day.lateMinutes)}`
                              }
                              className="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/25"
                            >
                              LATE {formatMinutes(day.lateMinutes)}
                            </span>
                          )}
                          {day.overtimeHours > 0 && (
                            <span
                              title={`${day.overtimeHours} hours of overtime`}
                              className="text-[9px] font-bold px-1 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25"
                            >
                              OT {day.overtimeHours}h
                            </span>
                          )}
                          {day.isRegularized && (
                            <span
                              title="Corrected through an approved regularization request"
                              className="text-[9px] font-bold px-1 py-0.5 rounded bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25"
                            >
                              FIXED
                            </span>
                          )}
                        </div>
                      )}

                      {/* Bottom Hours / Time Info */}
                      <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between mt-auto">
                        <span>{day.totalHours > 0 ? `${day.totalHours}h` : '—'}</span>
                        {day.workMode && day.workMode !== 'Weekend' && (
                          <span className="text-[9px] text-slate-400 font-sans hidden sm:inline-block">
                            {day.workMode}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: WEEKLY STRIP */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {weeklyDays.map((day) => (
              <div
                key={day.date}
                onClick={() => setSelectedDay(day)}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-brand-500 ${
                  day.isToday
                    ? 'bg-white dark:bg-slate-900 border-brand-500 shadow-sm ring-2 ring-brand-500/30'
                    : day.status === 'Weekend'
                    ? 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/40 opacity-70'
                    : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{day.shortDay}</span>
                    {day.isToday && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand-600 text-white">
                        Today
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{day.dayNumber}</div>
                </div>

                <div className="space-y-2 mt-3">
                  <div className="text-xs font-bold text-brand-600 dark:text-brand-300">{day.status}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {day.totalHours > 0 ? `${day.totalHours} hrs` : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Attendance Metrics Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Present Days</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {stats.presentCount} <span className="text-xs font-medium text-slate-400">days</span>
              </div>
            </div>
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Half-Days</span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">
                {stats.halfDayCount} <span className="text-xs font-medium text-slate-400">days</span>
              </div>
            </div>
            <Clock className="w-6 h-6 text-amber-500" />
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Hours</span>
              <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-0.5">
                {stats.totalHoursWorked} <span className="text-xs font-medium text-slate-400">hrs</span>
              </div>
            </div>
            <Sparkles className="w-6 h-6 text-brand-500" />
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Daily Average</span>
              <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-0.5">
                {stats.avgDailyHours} <span className="text-xs font-medium text-slate-400">h/day</span>
              </div>
            </div>
            <Clock className="w-6 h-6 text-brand-500" />
          </div>
        </div>
      )}

      {/* Selected Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md shadow-soft relative animate-in fade-in zoom-in-95 duration-150">
            <Tooltip label="Close" side="left">
              <button aria-label="Close"
                onClick={() => setSelectedDay(null)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Tooltip>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedDay.dayName}, {selectedDay.date}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Detailed Day Log & Summary</p>
              </div>
            </div>

            <div className="space-y-3 my-5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-500 font-medium">Status:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedDay.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block mb-1">Check In Time:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedDay.checkIn
                      ? new Date(selectedDay.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '—'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block mb-1">Check Out Time:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedDay.checkOut
                      ? new Date(selectedDay.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block mb-1">Total Hours:</span>
                  <span className="font-bold text-brand-600 dark:text-brand-300 font-mono text-sm">
                    {selectedDay.totalHours > 0 ? `${selectedDay.totalHours} hrs` : '0.0 hrs'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block mb-1">Work Mode:</span>
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {selectedDay.workMode === 'Remote' ? (
                      <Laptop className="w-3.5 h-3.5 text-brand-500" />
                    ) : (
                      <Building className="w-3.5 h-3.5 text-brand-500" />
                    )}
                    {selectedDay.workMode}
                  </span>
                </div>
              </div>

              {selectedDay.remarks && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block mb-1">Remarks:</span>
                  <p className="text-slate-700 dark:text-slate-300 italic">{selectedDay.remarks}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedDay(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthAttendanceCalendar;
