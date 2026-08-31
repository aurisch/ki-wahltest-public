export const formatInteger = (value: number) => new Intl.NumberFormat('de-DE').format(value);
export const formatUsd = (value: number, digits = 2) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const formatMinutes = (minutes: number) => {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;
  return hours > 0 ? `${hours} Std. ${rest} Min.` : `${rest} Min.`;
};
export const formatPercent = (value: number, digits = 1) =>
  new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const monthYearFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'Europe/Berlin' });
export const formatMonthYearRange = (startIso: string, endIso: string) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startLabel = monthYearFormatter.format(start);
  const endLabel = monthYearFormatter.format(end);
  if (startLabel === endLabel) return startLabel;
  if (start.getUTCFullYear() === end.getUTCFullYear()) return `${monthFormatter.format(start)}–${endLabel}`;
  return `${startLabel} – ${endLabel}`;
};
export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short',
  }).format(new Date(value));
