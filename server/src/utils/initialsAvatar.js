/**
 * Builds an initials avatar (e.g. "Ananya Sharma" -> "AS") as an inline SVG data URI.
 *
 * This replaces the hand-drawn character avatars: it works for any employee name,
 * needs no image hosting, and is deterministic — the same person always gets the
 * same colour.
 */

// Accessible, distinct background colours; text is always white on top.
const PALETTE = [
  '#4f46e5', '#0891b2', '#059669', '#d97706',
  '#db2777', '#7c3aed', '#dc2626', '#0284c7',
];

const getInitials = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // First letter of the first name + first letter of the last name.
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const pickColor = (seed = '') => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};

const buildInitialsAvatar = (fullName, seed) => {
  const initials = getInitials(fullName);
  const color = pickColor(seed || fullName || '');
  const fontSize = initials.length > 2 ? 48 : 56;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">',
    `<rect width="140" height="140" rx="36" fill="${color}"/>`,
    `<text x="70" y="70" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif"`,
    ` font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="central">`,
    initials,
    '</text></svg>',
  ].join('');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

module.exports = { buildInitialsAvatar, getInitials };
