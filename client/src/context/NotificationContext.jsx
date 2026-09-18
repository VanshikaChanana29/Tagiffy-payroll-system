import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/notifications';

const POLL_INTERVAL_MS = 30000;

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await fetchUnreadCount();
      setUnreadCount(res.data.count || 0);
    } catch {
      // Silent — the bell just won't update this cycle.
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetchNotifications(1, 20);
      setNotifications(res.data.data || []);
    } catch {
      // Silent — dropdown just shows stale/empty list until next success.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    refreshUnreadCount();
    pollRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [isAuthenticated, refreshUnreadCount]);

  const markAsRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore — next poll/refresh reconciles state.
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore — next poll/refresh reconciles state.
    }
  }, []);

  const value = {
    notifications,
    unreadCount,
    refreshNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
