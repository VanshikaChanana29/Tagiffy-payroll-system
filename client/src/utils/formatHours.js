// Decimal hours as people read them: 8.08 -> "8h 05m", 0.5 -> "0h 30m".
// The API stores hours as decimals; showing "8.08 hrs" reads like 8h 8m.
export const formatHours = (hours) => {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return '0h 00m';
  const totalMinutes = Math.round(value * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
