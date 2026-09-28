import api from './client';

export const getBankDetails = (userId) => api.get(`/users/${userId}/bank-details`);

export const confirmBankDetails = (userId) => api.put(`/users/${userId}/bank-details/confirm`);

export const requestBankCorrection = (userId, details) =>
  api.post(`/users/${userId}/bank-details/correction`, details);

export const cancelBankCorrection = (userId) => api.delete(`/users/${userId}/bank-details/correction`);

export const reviewBankCorrection = (userId, action, comment = '') =>
  api.put(`/users/${userId}/bank-details/correction`, { action, comment });

export const updateBankDetails = (userId, details) => api.put(`/users/${userId}/bank-details`, details);
