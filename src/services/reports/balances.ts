// Остатки денег «на сегодня»: банк (лист «Остатки»), касса и подотчётники (по операциям «Сделки»
// + начальные остатки кошельков). Порт getAllBalances_ из GAS.
// Отличие: кошельки с минусом показываем отдельно (transit) и в «Всего денег» не считаем —
// именно так сложился итог 47,1 млн в листе ДДС.
import type { CashOp, ReportSettings } from './types';
import { BANK_WALLETS, CASH_WALLETS, HIDDEN_WALLETS } from './config';

export interface BalanceItem { name: string; amount: number }
export interface BalancesResult {
  bank: BalanceItem[]; cash: BalanceItem[]; accountable: BalanceItem[];
  /** Кошельки с отрицательным остатком (транзит/расчёты, напр. схема обнала) — в «Всего денег» не входят */
  transit: BalanceItem[];
  totalBank: number; totalCash: number; totalAccountable: number; totalTransit: number; total: number;
}

const isHidden = (name: string) => HIDDEN_WALLETS.some(h => name.toLowerCase().includes(h.toLowerCase()));

export function buildBalances(cash: CashOp[], settings: ReportSettings): BalancesResult {
  const res: BalancesResult = { bank: [], cash: [], accountable: [], transit: [], totalBank: 0, totalCash: 0, totalAccountable: 0, totalTransit: 0, total: 0 };

  for (const b of settings.bankBalances) {
    if (isHidden(`${b.company} (${b.bank})`)) continue;
    res.bank.push({ name: `${b.company} ${b.currency}${b.bank !== 'Jusan' ? ` (${b.bank})` : ''}`, amount: b.amount });
    res.totalBank += b.amount;
  }

  const wallets = new Map<string, { in: number; out: number }>();
  const ensure = (n: string) => { if (n && !wallets.has(n)) wallets.set(n, { in: 0, out: 0 }); };
  for (const r of cash) {
    const t = r.type.toLowerCase();
    if (t === 'приход' && r.walletTo) { ensure(r.walletTo); wallets.get(r.walletTo)!.in += r.amount; }
    else if (t === 'расход' && r.walletFrom) { ensure(r.walletFrom); wallets.get(r.walletFrom)!.out += r.amount; }
    else if (t === 'перевод') {
      if (r.walletFrom) { ensure(r.walletFrom); wallets.get(r.walletFrom)!.out += r.amount; }
      if (r.walletTo) { ensure(r.walletTo); wallets.get(r.walletTo)!.in += r.amount; }
    }
  }
  Object.keys(settings.walletInitial).forEach(ensure);

  for (const [name, w] of wallets) {
    if (BANK_WALLETS.includes(name) || isHidden(name)) continue;
    const current = (settings.walletInitial[name] || 0) + w.in - w.out;
    if (w.in === 0 && w.out === 0 && Math.abs(current) < 100) continue;
    if (CASH_WALLETS.includes(name)) { res.cash.push({ name, amount: current }); res.totalCash += current; }
    else if (current < 0) { res.transit.push({ name, amount: current }); res.totalTransit += current; }
    else { res.accountable.push({ name, amount: current }); res.totalAccountable += current; }
  }
  res.cash.sort((a, b) => b.amount - a.amount);
  res.accountable.sort((a, b) => b.amount - a.amount);
  res.transit.sort((a, b) => a.amount - b.amount);
  res.bank.sort((a, b) => b.amount - a.amount);
  res.total = res.totalBank + res.totalCash + res.totalAccountable;
  return res;
}
