/**
 * Generates an initials avatar ("Ananya Sharma" -> "AS") as an inline SVG data URI.
 * Mirrors server/src/utils/initialsAvatar.js so both sides produce identical images.
 */
const PALETTE = [
  '#4f46e5', '#0891b2', '#059669', '#d97706',
  '#db2777', '#7c3aed', '#dc2626', '#0284c7',
];

export const getInitials = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const pickColor = (seed = '') => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};

export const buildInitialsAvatar = (fullName, seed) => {
  const initials = getInitials(fullName);
  const color = pickColor(seed || fullName || '');
  const fontSize = initials.length > 2 ? 48 : 56;

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">' +
    `<rect width="140" height="140" rx="36" fill="${color}"/>` +
    '<text x="70" y="70" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif"' +
    ` font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="central">` +
    initials +
    '</text></svg>';

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/** Falls back to generated initials when a person has no photo set. */
export const resolveAvatar = (person) => {
  if (person?.avatar) return person.avatar;
  return buildInitialsAvatar(person?.name, person?.email || person?.employeeId);
};
