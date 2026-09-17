import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  DollarSign,
  UserCircle,
  LogOut,
  X,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { TaggifyIcon } from '../common/TaggifyLogo';
import Tooltip from '../common/Tooltip';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout, isAdmin } = useAuth();
  const isManager = user?.role === 'manager';
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.info('Logged out of Taggify');
    navigate('/login');
  };

  // HR/admin is also an employee: they check in, apply leave, and get
  // payslips like anyone else, alongside their org-wide oversight pages.
  const adminNavItems = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
    { label: 'Employees', path: '/admin/employees', icon: Users },
    { label: 'Attendance', path: '/admin/attendance', icon: Clock },
    { label: 'Time Off', path: '/admin/leaves', icon: CalendarDays },
    { label: 'Payroll', path: '/admin/payroll', icon: DollarSign },
    { label: 'Org Settings', path: '/admin/org-settings', icon: Building2 },
    { label: 'My Attendance', path: '/employee/attendance', icon: Clock },
    { label: 'My Time Off', path: '/employee/leaves', icon: CalendarDays },
    { label: 'My Payslips', path: '/employee/salary', icon: DollarSign },
    { label: 'My Profile', path: '/admin/profile', icon: UserCircle },
  ];

  const employeeNavItems = [
    { label: 'Dashboard', path: '/employee', icon: LayoutDashboard, exact: true },
    { label: 'My Attendance', path: '/employee/attendance', icon: Clock },
    { label: 'My Time Off', path: '/employee/leaves', icon: CalendarDays },
    { label: 'My Payslips', path: '/employee/salary', icon: DollarSign },
    { label: 'My Profile', path: '/employee/profile', icon: UserCircle },
  ];

  // A manager gets their own self-service pages plus their team's screens —
  // the same components as HR, scoped to their reports by the server.
  const managerNavItems = [
    { label: 'Dashboard', path: '/employee', icon: LayoutDashboard, exact: true },
    { label: 'My Team', path: '/team', icon: Users },
    { label: 'Team Attendance', path: '/team/attendance', icon: Clock },
    { label: 'Team Time Off', path: '/team/leaves', icon: CalendarDays },
    { label: 'My Attendance', path: '/employee/attendance', icon: Clock },
    { label: 'My Time Off', path: '/employee/leaves', icon: CalendarDays },
    { label: 'My Payslips', path: '/employee/salary', icon: DollarSign },
    { label: 'My Profile', path: '/employee/profile', icon: UserCircle },
  ];

  const navItems = isAdmin ? adminNavItems : isManager ? managerNavItems : employeeNavItems;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col
                    bg-white dark:bg-slate-900
                    border-r border-slate-200 dark:border-slate-800
                    transition-transform duration-200 ease-out lg:translate-x-0 ${
                      isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
      >
        {/* Brand */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <TaggifyIcon size={32} />
            <div className="min-w-0">
              <div className="font-display text-base font-extrabold uppercase leading-none tracking-tight text-slate-900 dark:text-white">
                TAG<span className="text-brand-500">GIFY</span>
              </div>
              <p className="mt-1 text-[11px] leading-none text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Admin workspace' : 'Employee workspace'}
              </p>
            </div>
          </div>

          <Tooltip label="Close menu" side="right">
            <button onClick={onClose} className="btn-icon lg:hidden" aria-label="Close menu">
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                onClick={() => onClose?.()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-500 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : ''}`} />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User + sign out */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1 min-w-0">
            <img
              src={user?.avatar}
              alt=""
              className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                {user?.name}
              </div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {user?.designation || (isAdmin ? 'HR Admin' : 'Employee')}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
 text-slate-600 dark:text-slate-400
                       hover:bg-rose-50 dark:hover:bg-rose-950/40
                       hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
