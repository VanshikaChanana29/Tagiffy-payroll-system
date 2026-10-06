import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Building,
  Laptop,
  CalendarDays,
  Edit3,
  X,
  Save,
  MapPinOff,
  Users,
  UserX,
  MapPin,
} from 'lucide-react';
import api from '../../api/client';
import RegularizationApprovals from '../../components/admin/RegularizationApprovals';
import useDepartments from '../../hooks/useDepartments';
import useOfficeLocations from '../../hooks/useOfficeLocations';
import { useToast } from '../../context/ToastContext';
import demoAvatars from '../../utils/avatars';
import { format } from 'date-fns';
import { formatHours } from '../../utils/formatHours';
import Tooltip from '../../components/common/Tooltip';
import Pagination, { usePagination } from '../../components/common/Pagination';
import FilterBar from '../../components/common/FilterBar';

const AllAttendancePage = () => {
  const departments = useDepartments();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [department, setDepartment] = useState('All');
  const officeLocations = useOfficeLocations();
  const [officeFilter, setOfficeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalPresent: 0,
    totalHalfDay: 0,
    totalLeave: 0,
    totalNotPunchedIn: 0,
    totalAbsent: 0,
  });
  const [loading, setLoading] = useState(true);

  // Client-side column filters
  const [designationFilter, setDesignationFilter] = useState('All');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [locationFilter, setLocationFilter] = useState('All');
  const [checkOutFilter, setCheckOutFilter] = useState('All');
  const [hoursFilter, setHoursFilter] = useState('All');
  const [workModeFilter, setWorkModeFilter] = useState('All');

  // Sorting ('' keeps the server order)
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  // Filters menu: which filters the user has turned on
  const [enabledFilters, setEnabledFilters] = useState([]);

  // Edit record modal state
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const toast = useToast();

  const fetchCompanyAttendance = async () => {
    try {
      setLoading(true);
      const params = { date: selectedDate };
      if (department !== 'All') params.department = department;
      if (officeFilter !== 'All') params.officeLocation = officeFilter;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (search) params.search = search;

      const res = await api.get('/attendance/all', { params });
      if (res.data.success) {
        setRecords(res.data.records || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (error) {
      toast.error('Failed to load company attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyAttendance();
  }, [selectedDate, department, officeFilter, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanyAttendance();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleUpdateRecord = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setSaving(true);
    try {
      const res = await api.put(`/attendance/${selectedRecord._id}`, {
        status: selectedRecord.status,
        totalHours: selectedRecord.totalHours,
        workMode: selectedRecord.workMode,
        remarks: selectedRecord.remarks,
      });

      if (res.data.success) {
        toast.success('Attendance record regularized successfully');
        setEditModalOpen(false);
        fetchCompanyAttendance();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update record');
    } finally {
      setSaving(false);
    }
  };

  const designations = useMemo(
    () => [...new Set(records.map((r) => r.userId?.designation).filter(Boolean))].sort(),
    [records]
  );

  const timeOfDay = (date) => (date ? format(new Date(date), 'HH:mm') : null);

  const visibleRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      if (designationFilter !== 'All' && r.userId?.designation !== designationFilter) return false;

      const inTime = timeOfDay(r.checkIn);
      if ((checkInFrom || checkInTo) && !inTime) return false;
      if (checkInFrom && inTime < checkInFrom) return false;
      if (checkInTo && inTime > checkInTo) return false;

      const outside = !!r.checkInLocation?.isOutsideGeofence;
      if (locationFilter === 'Outside' && !outside) return false;
      if (locationFilter === 'Inside' && (outside || !r.checkIn)) return false;

      if (checkOutFilter === 'Done' && !r.checkOut) return false;
      if (checkOutFilter === 'Pending' && r.checkOut) return false;

      const hours = r.totalHours || 0;
      if (hoursFilter === 'InProgress' && !(r.checkIn && !r.totalHours)) return false;
      if (hoursFilter === 'lt4' && !(r.totalHours && hours < 4)) return false;
      if (hoursFilter === '4to8' && !(hours >= 4 && hours < 8)) return false;
      if (hoursFilter === 'gte8' && hours < 8) return false;

      if (workModeFilter !== 'All' && r.workMode !== workModeFilter) return false;
      return true;
    });

    if (!sortBy) return filtered;

    const getValue = (r) => {
      switch (sortBy) {
        case 'name':
          return (r.userId?.name || '').toLowerCase();
        case 'department':
          return `${r.userId?.department || ''} ${r.userId?.designation || ''}`.toLowerCase();
        case 'checkIn':
          return r.checkIn ? new Date(r.checkIn).getTime() : null;
        case 'checkOut':
          return r.checkOut ? new Date(r.checkOut).getTime() : null;
        case 'totalHours':
          return r.totalHours || 0;
        case 'workMode':
          return (r.workMode || '').toLowerCase();
        case 'status':
          return (r.status || '').toLowerCase();
        default:
          return null;
      }
    };

    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      // Empty values always go to the bottom
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -1 * direction;
      if (va > vb) return 1 * direction;
      return 0;
    });
  }, [
    records,
    designationFilter,
    checkInFrom,
    checkInTo,
    locationFilter,
    checkOutFilter,
    hoursFilter,
    workModeFilter,
    sortBy,
    sortDir,
  ]);

  // Filters and sorting above cover the whole roll call; paging only picks
  // the slice on screen and resets to page 1 when any of them change.
  const pagination = usePagination(
    visibleRecords,
    [
      selectedDate,
      search,
      department,
      officeFilter,
      statusFilter,
      designationFilter,
      checkInFrom,
      checkInTo,
      locationFilter,
      checkOutFilter,
      hoursFilter,
      workModeFilter,
      sortBy,
      sortDir,
    ].join('|')
  );

  const selectOptions = (pairs) => pairs.map(([value, label]) => ({ value, label: label || value }));

  // Every filter the "Filters" menu can turn on; `isSet` says whether it is narrowing the list
  const filterDefs = [
    {
      key: 'department',
      label: 'Department',
      value: department,
      isSet: department !== 'All',
      display: department,
      set: setDepartment,
      reset: () => setDepartment('All'),
      options: selectOptions([['All', 'All Departments'], ...departments.map((d) => [d.name])]),
    },
    {
      key: 'office',
      label: 'Office Location',
      value: officeFilter,
      isSet: officeFilter !== 'All',
      display:
        officeFilter === 'none'
          ? 'Not assigned'
          : officeLocations.find((o) => o._id === officeFilter)?.name || 'Office',
      set: setOfficeFilter,
      reset: () => setOfficeFilter('All'),
      options: selectOptions([
        ['All', 'All Offices'],
        ...officeLocations.map((o) => [o._id, o.name]),
        ['none', 'Not assigned'],
      ]),
    },
    {
      key: 'designation',
      label: 'Designation',
      value: designationFilter,
      isSet: designationFilter !== 'All',
      display: designationFilter,
      set: setDesignationFilter,
      reset: () => setDesignationFilter('All'),
      options: selectOptions([['All', 'All Designations'], ...designations.map((d) => [d])]),
    },
    {
      key: 'checkIn',
      label: 'Check-In Time',
      isSet: !!(checkInFrom || checkInTo),
      display: `${checkInFrom || '…'} – ${checkInTo || '…'}`,
      reset: () => {
        setCheckInFrom('');
        setCheckInTo('');
      },
      render: () => (
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={checkInFrom}
            onChange={(e) => setCheckInFrom(e.target.value)}
            className="theme-input text-xs flex-1 min-w-0"
            aria-label="Check-in from"
          />
          <span className="text-slate-400">–</span>
          <input
            type="time"
            value={checkInTo}
            onChange={(e) => setCheckInTo(e.target.value)}
            className="theme-input text-xs flex-1 min-w-0"
            aria-label="Check-in to"
          />
        </div>
      ),
    },
    {
      key: 'location',
      label: 'Punch Location',
      value: locationFilter,
      isSet: locationFilter !== 'All',
      display: locationFilter === 'Inside' ? 'Inside Geofence' : 'Outside Geofence',
      set: setLocationFilter,
      reset: () => setLocationFilter('All'),
      options: selectOptions([
        ['All', 'All Locations'],
        ['Inside', 'Inside Geofence'],
        ['Outside', 'Outside Geofence'],
      ]),
    },
    {
      key: 'checkOut',
      label: 'Check-Out',
      value: checkOutFilter,
      isSet: checkOutFilter !== 'All',
      display: checkOutFilter === 'Done' ? 'Checked Out' : 'Not Checked Out',
      set: setCheckOutFilter,
      reset: () => setCheckOutFilter('All'),
      options: selectOptions([
        ['All', 'All'],
        ['Done', 'Checked Out'],
        ['Pending', 'Not Checked Out'],
      ]),
    },
    {
      key: 'hours',
      label: 'Total Hours',
      value: hoursFilter,
      isSet: hoursFilter !== 'All',
      display: { InProgress: 'In Progress', lt4: '< 4h', '4to8': '4h – 8h', gte8: '≥ 8h' }[hoursFilter],
      set: setHoursFilter,
      reset: () => setHoursFilter('All'),
      options: selectOptions([
        ['All', 'All'],
        ['InProgress', 'In Progress'],
        ['lt4', 'Less than 4h'],
        ['4to8', '4h – 8h'],
        ['gte8', '8h or more'],
      ]),
    },
    {
      key: 'workMode',
      label: 'Work Mode',
      value: workModeFilter,
      isSet: workModeFilter !== 'All',
      display: workModeFilter,
      set: setWorkModeFilter,
      reset: () => setWorkModeFilter('All'),
      options: selectOptions([['All', 'All Modes'], ['Office'], ['Remote']]),
    },
    {
      key: 'status',
      label: 'Status',
      value: statusFilter,
      isSet: statusFilter !== 'All',
      display: statusFilter,
      set: setStatusFilter,
      reset: () => setStatusFilter('All'),
      options: selectOptions([
        ['All', 'All Statuses'],
        ['Present'],
        ['Half-day'],
        ['Leave', 'On Leave'],
        ['Not Punched In'],
        ['Absent'],
        ['Holiday'],
        ['Weekly Off'],
        ['Not Tracked'],
      ]),
    },
  ];

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const SortableHeader = ({ field, children }) => {
    const active = sortBy === field;
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className="px-6 py-4" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => handleSort(field)}
          title={`Sort by ${children} (${active && sortDir === 'asc' ? 'descending' : 'ascending'})`}
          className={`inline-flex items-center gap-1.5 uppercase font-semibold transition-colors hover:text-brand-600 dark:hover:text-brand-300 ${
            active ? 'text-brand-600 dark:text-brand-300' : ''
          }`}
        >
          {children}
          <Icon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-40'}`} />
        </button>
      </th>
    );
  };

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
            <CalendarDays className="w-3 h-3 text-brand-600 dark:text-brand-400" /> On Leave
          </span>
        );
      case 'Not Punched In':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/25">
            <UserX className="w-3 h-3 text-orange-600 dark:text-orange-400" /> Not Punched In
          </span>
        );
      case 'Holiday':
      case 'Weekly Off':
      case 'Not Tracked':
      case 'Upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/25">
            <Calendar className="w-3 h-3" /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Date Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Company Attendance Log
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Real-time workforce roll call, punch verification, and regularization portal.
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm dark:shadow-card">
          <Calendar className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Select Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-xs text-slate-900 dark:text-white font-mono font-bold focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Total Employees',
            value: stats.totalEmployees ?? records.length,
            sub: `${stats.totalPunchedIn ?? 0} punched in`,
            icon: Users,
            tone: 'text-slate-900 dark:text-white',
            iconTone: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
            filter: 'All',
          },
          {
            label: 'Present',
            value: stats.totalPresent,
            icon: CheckCircle2,
            tone: 'text-emerald-600 dark:text-emerald-400',
            iconTone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            filter: 'Present',
          },
          {
            label: 'Half-Day',
            value: stats.totalHalfDay,
            icon: Clock,
            tone: 'text-amber-600 dark:text-amber-400',
            iconTone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            filter: 'Half-day',
          },
          {
            label: 'On Leave',
            value: stats.totalLeave,
            icon: CalendarDays,
            tone: 'text-brand-600 dark:text-brand-400',
            iconTone: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
            filter: 'Leave',
          },
          selectedDate < format(new Date(), 'yyyy-MM-dd')
            ? {
                label: 'Absent',
                value: stats.totalAbsent,
                icon: UserX,
                tone: 'text-rose-600 dark:text-rose-400',
                iconTone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                filter: 'Absent',
              }
            : {
                label: 'Not Punched In',
                value: stats.totalNotPunchedIn ?? 0,
                icon: UserX,
                tone: 'text-rose-600 dark:text-rose-400',
                iconTone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                filter: 'Not Punched In',
              },
        ].map((card) => {
          const Icon = card.icon;
          const active = statusFilter === card.filter && card.filter !== 'All';
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                setStatusFilter(active ? 'All' : card.filter);
                if (card.filter !== 'All') setEnabledFilters((keys) => (keys.includes('status') ? keys : [...keys, 'status']));
              }}
              title={card.filter === 'All' ? 'Show everyone' : `Show only: ${card.label}`}
              className={`p-5 rounded-xl bg-white dark:bg-slate-900 border shadow-sm dark:shadow-card flex items-center justify-between text-left transition-colors ${
                active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-800 hover:border-brand-500/40'
              }`}
            >
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">{card.label}</span>
                <div className={`text-2xl font-black mt-1 ${card.tone}`}>{card.value ?? 0}</div>
                {card.sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{card.sub}</div>}
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.iconTone}`}>
                <Icon className="w-5 h-5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employee name or ID..."
        filterDefs={filterDefs}
        enabledFilters={enabledFilters}
        setEnabledFilters={setEnabledFilters}
        visibleCount={visibleRecords.length}
        totalCount={records.length}
        extraActive={!!sortBy}
        onReset={() => {
          setSortBy('');
          setSortDir('asc');
        }}
      />

      {/* Attendance Records Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">Loading company attendance records...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
            No active employees found for {selectedDate}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortableHeader field="name">Employee</SortableHeader>
                  <SortableHeader field="department">Department</SortableHeader>
                  <SortableHeader field="checkIn">Check-In</SortableHeader>
                  <SortableHeader field="checkOut">Check-Out</SortableHeader>
                  <SortableHeader field="totalHours">Total Hours</SortableHeader>
                  <SortableHeader field="workMode">Work Mode</SortableHeader>
                  <SortableHeader field="status">Status</SortableHeader>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                {visibleRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                      No records match the selected filters.
                    </td>
                  </tr>
                )}
                {pagination.pageItems.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={r.userId?.avatar || demoAvatars.generic(r.userId?.name?.slice(0, 2))}
                          alt={r.userId?.name}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {r.userId?.name || 'Staff Member'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {r.userId?.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-slate-900 dark:text-slate-200 font-semibold">{r.userId?.department}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.userId?.designation}</div>
                      {r.userId?.officeLocationName && (
                        <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                          <MapPin className="w-3 h-3" />
                          {r.userId.officeLocationName}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{r.checkIn ? format(new Date(r.checkIn), 'hh:mm:ss a') : '—'}</span>
                        {r.checkInLocation?.isOutsideGeofence && (
                          <Tooltip
                            label={`Punched in ${r.checkInLocation.distanceMeters}m from ${
                              r.checkInLocation.matchedLocationName || 'office'
                            }${
                              r.checkInLocation.area || r.checkInLocation.city
                                ? ` · near ${[r.checkInLocation.area, r.checkInLocation.city]
                                    .filter(Boolean)
                                    .join(', ')}`
                                : ''
                            }`}
                            side="top"
                          >
                            <a
                              href={`https://www.google.com/maps?q=${r.checkInLocation.lat},${r.checkInLocation.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex"
                            >
                              <MapPinOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            </a>
                          </Tooltip>
                        )}
                      </div>
                      {r.checkInLocation?.isOutsideGeofence && (r.checkInLocation.area || r.checkInLocation.city) && (
                        <div className="text-[11px] font-sans text-amber-700 dark:text-amber-400 mt-0.5">
                          {[r.checkInLocation.area, r.checkInLocation.city].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono">
                      {r.checkOut ? format(new Date(r.checkOut), 'hh:mm:ss a') : '—'}
                    </td>

                    <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-bold">
                      {r.totalHours ? formatHours(r.totalHours) : r.checkIn ? 'In Progress' : '—'}
                    </td>

                    <td className="px-6 py-4">
                      {!r.workMode ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        {r.workMode === 'Remote' ? (
                          <Laptop className="w-3 h-3 text-brand-600 dark:text-brand-400" />
                        ) : (
                          <Building className="w-3 h-3 text-brand-600 dark:text-brand-400" />
                        )}
                        {r.workMode}
                      </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {getStatusBadge(r.status)}
                      {r.status === 'Leave' && r.leaveType && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          {r.leaveType === 'Paid' ? 'Earned' : r.leaveType} leave
                        </div>
                      )}
                      {r.status === 'Holiday' && r.holidayName && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{r.holidayName}</div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {r.isVirtual ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                      <button
                        onClick={() => {
                          setSelectedRecord(JSON.parse(JSON.stringify(r)));
                          setEditModalOpen(true);
                        }}
                        title="Regularize / Edit Attendance"
                        className="px-2.5 py-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600 text-brand-700 dark:text-brand-300 hover:text-white text-xs font-semibold transition-all inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && <Pagination {...pagination} label="employees" />}
      </div>

      {/* EDIT / REGULARIZE MODAL */}
      {editModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Regularize Attendance</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedRecord.userId?.name} • {selectedRecord.date}
                </p>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setEditModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleUpdateRecord} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={selectedRecord.status}
                  onChange={(e) =>
                    setSelectedRecord({ ...selectedRecord, status: e.target.value })
                  }
                  className="theme-input w-full"
                >
                  <option value="Present">Present</option>
                  <option value="Half-day">Half-day</option>
                  <option value="Leave">Leave</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Total Hours Worked</label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedRecord.totalHours}
                  onChange={(e) =>
                    setSelectedRecord({
                      ...selectedRecord,
                      totalHours: parseFloat(e.target.value),
                    })
                  }
                  className="theme-input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Mode</label>
                <select
                  value={selectedRecord.workMode}
                  onChange={(e) =>
                    setSelectedRecord({ ...selectedRecord, workMode: e.target.value })
                  }
                  className="theme-input w-full"
                >
                  <option value="Office">Office</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={selectedRecord.remarks || ''}
                  onChange={(e) =>
                    setSelectedRecord({ ...selectedRecord, remarks: e.target.value })
                  }
                  placeholder="Regularization justification..."
                  className="theme-input w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <RegularizationApprovals onApproved={fetchCompanyAttendance} />
    </div>
  );
};

export default AllAttendancePage;
