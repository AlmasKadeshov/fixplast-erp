export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatCurrency(amount: number, currency = 'KZT'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ru-RU').format(num);
}

/** Format money as "1 234 567 ₸" - full amount with tenge sign */
export function formatFullMoney(value: number): string {
    return new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₸';
}

/** Format money compact: "1.2 млн", "45 тыс", "300" */
export function formatMoneyCompact(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return (value / 1_000_000).toFixed(1) + ' млн';
    }
    if (Math.abs(value) >= 1_000) {
        return (value / 1_000).toFixed(0) + ' тыс';
    }
    return value.toLocaleString('ru-RU');
}

/** Format money rounded without sign: "1 234 567" */
export function formatMoney(value: number): string {
    return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}
