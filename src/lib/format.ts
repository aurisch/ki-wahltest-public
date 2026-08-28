export const formatInteger = (value: number) => new Intl.NumberFormat('de-DE').format(value);
export const formatPercent = (value: number, digits = 1) =>
  new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value)) + ' CEST';
