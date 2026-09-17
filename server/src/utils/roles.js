// super_admin has every HR power admin has, plus admin-account management.
// Treat the two as equivalent for regular HR/admin gates; only the
// admin-account-management paths need to distinguish them.
const ADMIN_ROLES = ['admin', 'super_admin'];

const isAdminRole = (role) => ADMIN_ROLES.includes(role);
const isSuperAdmin = (role) => role === 'super_admin';

module.exports = { ADMIN_ROLES, isAdminRole, isSuperAdmin };
