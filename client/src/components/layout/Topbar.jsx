import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Menu, Sun, Moon, Shield, Crown, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { format } from 'date-fns';
import AdminEmployeeSwitcher from '../admin/AdminEmployeeSwitcher';
import Tooltip from '../common/Tooltip';

const Topbar = ({ onMenuClick }) => {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/employee-view')) return 'Employee Inspection';
    if (path === '/admin' || path === '/employee') return 'Dashboard';
    if (path.includes('/employees')) return 'Employees';
    if (path.includes('/attendance')) return isAdmin ? 'Attendance' : 'My Attendance';
    if (path.includes('/leaves')) return isAdmin ? 'Time Off Approvals' : 'My Time Off';
    if (path.includes('/payroll') || path.includes('/salary')) return isAdmin ? 'Payroll' : 'My Payslips';
    if (path.includes('/org-settings')) return 'Org Settings';
    if (path.includes('/profile')) return 'My Profile';
    return 'Taggify';
  };

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8
 bg-white/90 dark:bg-slate-900/90 backdrop-blur
                       border-b border-slate-200 dark:border-slate-800">
      {/* Left: menu + title */}
      <div className="flex items-center gap-3 min-w-0">
        <Tooltip label="Open navigation menu" side="bottom">
          <button onClick={onMenuClick} className="btn-icon lg:hidden" aria-label="Open navigation menu">
            <Menu className="w-4 h-4" />
          </button>
        </Tooltip>

        <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right: context switcher, clock, theme, role, profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {isAdmin && <AdminEmployeeSwitcher />}

        <Tooltip label="Current server date and time" side="bottom">
          <span className="hidden md:inline-flex items-center px-2.5 py-1.5 rounded-lg
 text-xs font-medium tabular-nums
                           text-slate-600 dark:text-slate-300
                           bg-slate-100 dark:bg-slate-800">
            {format(now, 'EEE, dd MMM • HH:mm:ss')}
          </span>
        </Tooltip>

        <Tooltip label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} side="bottom">
          <button
            onClick={toggleTheme}
            className="btn-icon"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
          </button>
        </Tooltip>

        <Tooltip
          label={
            isSuperAdmin
              ? 'Super admin — full access, including managing other admin accounts'
              : isAdmin
              ? 'You have full HR admin access'
              : 'Standard employee access'
          }
          side="bottom"
        >
          <span className={isAdmin ? 'badge-warning hidden sm:inline-flex' : 'badge-neutral hidden sm:inline-flex'}>
            {isSuperAdmin ? (
              <Crown className="w-3 h-3" />
            ) : isAdmin ? (
              <Shield className="w-3 h-3" />
            ) : (
              <User className="w-3 h-3" />
            )}
            {isSuperAdmin ? 'Super Admin' : isAdmin ? 'HR Admin' : 'Employee'}
          </span>
        </Tooltip>

        <Tooltip label="View your profile" side="left">
          <Link
            to={isAdmin ? '/admin/profile' : '/employee/profile'}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="hidden sm:block text-right">
              <span className="block text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                {user?.name}
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {user?.department}
              </span>
            </span>
            <img
              src={user?.avatar}
              alt=""
              className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
            />
          </Link>
        </Tooltip>
      </div>
    </header>
  );
};

export default Topbar;
