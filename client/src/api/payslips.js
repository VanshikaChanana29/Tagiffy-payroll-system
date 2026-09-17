import api from './client';
import { readBlobError } from './files';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Downloads a payslip PDF. The endpoint needs an Authorization header, so the
 * file is fetched as a blob and handed to the browser to save.
 */
export const downloadPayslip = async (payslip, employeeName = 'payslip') => {
  const res = await api.get(`/salaries/${payslip._id}/payslip`, { responseType: 'blob' });

  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `Payslip_${String(employeeName).replace(/\s+/g, '_')}_${payslip.year}-${String(
    payslip.month
  ).padStart(2, '0')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export { readBlobError, MONTHS };
