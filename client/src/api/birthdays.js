import api from './client';

export const fetchTodaysBirthdays = () => api.get('/users/birthdays/today');
