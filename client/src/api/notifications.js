import api from './client';

export const fetchNotifications = (page = 1, limit = 20) =>
  api.get('/notifications', { params: { page, limit } });

export const fetchUnreadCount = () => api.get('/notifications/unread-count');

export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);

export const markAllNotificationsRead = () => api.put('/notifications/read-all');
