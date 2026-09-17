import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Building,
  Laptop,
  Search,
  Filter,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import MonthAttendanceCalendar from '../../components/attendance/MonthAttendanceCalendar';
import CheckInOutWidget from '../../components/attendance/CheckInOutWidget';
import api from '../../api/client';
import RegularizationPanel from '../../components/attendance/RegularizationPanel';
import { useToast } from '../../context/ToastContext';
import { format } from 'date-fns';

const MyAttendancePage = () => {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [search, setSearch] = useState('');
  // MonthAttendanceCalendar fetches its own data internally and has no prop
  // that tells it to refetch, so bumping this key remounts it after a punch.
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  const toast = useToast();

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      const historyRes = await api.get('/attendance/my-history?limit=30');

      if (historyRes.data.success) {
        setHistoryData(historyRes.data.records || []);
      }
    } catch (error) {
      toast.error('Failed to load attendance logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Present':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Present
          </span>
        );
      case 'Half-day':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Half-day
          </span>
        );
      case 'Leave':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25">
            <CalendarDays className="w-3 h-3 text-brand-600 dark:text-brand-400" /> Leave
          </span>
        );
      case 'Weekend':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            Weekend
          </span>
        );
      case 'Absent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Absent
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  const filteredHistory = historyData.filter((r) => {
    const matchesStatus = selectedStatus === 'All' || r.status === selectedStatus;
    const matchesSearch =
      !search ||
      r.date.includes(search) ||
      (r.remarks && r.remarks.toLowerCase().includes(search.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Top Interactive Punch Widget */}
      <CheckInOutWidget
        onAttendanceChange={() => {
          fetchAttendanceData();
          setCalendarRefreshKey((k) => k + 1);
        }}
      />

      {/* Full Interactive Month Attendance Calendar */}
      <MonthAttendanceCalendar key={calendarRefreshKey} onAttendanceChange={fetchAttendanceData} />

      {/* Full Attendance History Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Attendance History Log
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute inset-y-0 left-3 my-auto" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search date or remarks..."
                className="theme-input w-full pl-9 pr-3 text-xs"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="theme-input text-xs"
              >
                <option value="All">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Half-day">Half-day</option>
                <option value="Leave">Leave</option>
                <option value="Absent">Absent</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
          {loading ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs">Loading attendance history...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-xs">
              No attendance logs found matching criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Check-In</th>
                    <th className="px-6 py-3.5">Check-Out</th>
                    <th className="px-6 py-3.5">Duration</th>
                    <th className="px-6 py-3.5">Work Mode</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                  {filteredHistory.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                      <td className="px-6 py-3.5 text-slate-900 dark:text-white font-mono font-bold">{item.date}</td>
                      <td className="px-6 py-3.5 text-slate-600 dark:text-slate-300 font-mono">
                        {item.checkIn ? format(new Date(item.checkIn), 'hh:mm a') : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 dark:text-slate-300 font-mono">
                        {item.checkOut ? format(new Date(item.checkOut), 'hh:mm a') : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        {item.totalHours ? `${item.totalHours} hrs` : item.checkIn ? 'In Progress' : '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          {item.workMode === 'Remote' ? (
                            <Laptop className="w-3 h-3 text-brand-600 dark:text-brand-400" />
                          ) : (
                            <Building className="w-3 h-3 text-brand-600 dark:text-brand-400" />
                          )}
                          {item.workMode}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">{getStatusBadge(item.status)}</td>
                      <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {item.remarks || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <RegularizationPanel />
    </div>
  );
};

export default MyAttendancePage;
