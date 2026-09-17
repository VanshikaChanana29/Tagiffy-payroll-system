import React, { useState, useEffect } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  Building,
  CheckCircle2,
  Timer,
  MapPinOff,
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { format } from 'date-fns';
import { getCurrentLocation } from '../../utils/geolocation';

// 81592 -> "81.6 km", 150 -> "150 m"
const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

const CheckInOutWidget = ({ onAttendanceChange }) => {
  const [statusData, setStatusData] = useState({
    loading: true,
    isCheckedIn: false,
    isCheckedOut: false,
    attendance: null,
  });
  const [workMode, setWorkMode] = useState('Office');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  const toast = useToast();

  const fetchTodayStatus = async () => {
    try {
      const res = await api.get('/attendance/today');
      if (res.data.success) {
        setStatusData({
          loading: false,
          isCheckedIn: res.data.isCheckedIn,
          isCheckedOut: res.data.isCheckedOut,
          attendance: res.data.attendance,
        });
        if (res.data.attendance?.workMode) {
          setWorkMode(res.data.attendance.workMode);
        }
      }
    } catch (error) {
      console.error('Error fetching today attendance:', error);
      setStatusData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  // Real-time elapsed time counter when checked in but not yet checked out
  useEffect(() => {
    let interval = null;
    if (statusData.isCheckedIn && !statusData.isCheckedOut && statusData.attendance?.checkIn) {
      const updateTimer = () => {
        const diffMs = new Date() - new Date(statusData.attendance.checkIn);
        const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
        const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        setElapsedTime(`${hrs}:${mins}:${secs}`);
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [statusData]);

  const handleCheckIn = async () => {
    setSubmitting(true);
    try {
      const location = await getCurrentLocation();
      const res = await api.post('/attendance/check-in', { workMode, remarks, location });
      if (res.data.success) {
        if (res.data.attendance?.checkInLocation?.isOutsideGeofence) {
          toast.info(res.data.message);
        } else {
          toast.success(res.data.message);
        }
        setRemarks('');
        await fetchTodayStatus();
        onAttendanceChange?.();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    setSubmitting(true);
    try {
      const location = await getCurrentLocation();
      const res = await api.post('/attendance/check-out', { remarks, location });
      if (res.data.success) {
        toast.success(res.data.message);
        setRemarks('');
        await fetchTodayStatus();
        onAttendanceChange?.();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Check-out failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (statusData.loading) {
    return (
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs">Loading today's punch status...</span>
      </div>
    );
  }

  const { isCheckedIn, isCheckedOut, attendance } = statusData;

  return (
    <div className="p-6 sm:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-soft space-y-6 transition-colors">
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 flex items-center justify-center shadow-sm dark:">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Today's Attendance Punch</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {format(new Date(), 'EEEE, MMMM dd, yyyy')}
            </p>
          </div>
        </div>

        {/* Current Punch State Badge */}
        <div>
          {!isCheckedIn ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              Not Checked In Yet
            </span>
          ) : !isCheckedOut ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Currently Working ({workMode})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25">
              <CheckCircle2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Punch Completed for Today
            </span>
          )}
        </div>
      </div>

      {/* Geofence warning — impossible to miss, unlike a buried footnote */}
      {attendance?.checkInLocation?.isOutsideGeofence && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
          <MapPinOff className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold">
            Punched in {formatDistance(attendance.checkInLocation.distanceMeters)} away from the configured office location
          </span>
        </div>
      )}

      {/* Main Punch Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Left: Punch Timestamps Card */}
        <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Punch In Time:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {attendance?.checkIn ? format(new Date(attendance.checkIn), 'hh:mm:ss a') : '--:--:--'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Punch Out Time:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {attendance?.checkOut ? format(new Date(attendance.checkOut), 'hh:mm:ss a') : '--:--:--'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Total Work Hours:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {attendance?.totalHours ? `${attendance.totalHours} hrs` : isCheckedIn ? 'In Progress' : '0.00 hrs'}
            </span>
          </div>

        </div>

        {/* Center: Live Timer / Work Mode Selector */}
        <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            {isCheckedIn && !isCheckedOut ? 'Active Working Time' : 'Today Working Duration'}
          </span>
          <div className="text-3xl font-mono font-black tracking-wider text-slate-900 dark:text-white">
            {isCheckedIn && !isCheckedOut
              ? elapsedTime
              : attendance?.totalHours
              ? `${attendance.totalHours} hrs`
              : '00:00:00'}
          </div>

          {/* Work mode — Office only */}
          {!isCheckedIn && (
            <div className="flex items-center gap-2 mt-3">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-brand-600 text-white">
                <Building className="w-3 h-3" /> Office
              </span>
            </div>
          )}
        </div>

        {/* Right: Punch Action Button */}
        <div className="space-y-3">
          {!isCheckedIn ? (
            <button
              onClick={handleCheckIn}
              disabled={submitting}
              className="w-full py-4 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 group"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Check In Now</span>
                </>
              )}
            </button>
          ) : !isCheckedOut ? (
            <button
              onClick={handleCheckOut}
              disabled={submitting}
              className="w-full py-4 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 group"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  <span>Check Out (End Day)</span>
                </>
              )}
            </button>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Attendance Completed
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Status: {attendance?.status}</p>
            </div>
          )}

          {/* Optional remarks note */}
          {!isCheckedOut && (
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add optional notes/remarks..."
              className="theme-input w-full text-xs"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckInOutWidget;
