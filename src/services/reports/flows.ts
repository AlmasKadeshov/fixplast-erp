// Поток денег: источник (банк/касса/подотчётники) → вид деятельности → группа статей. Только расходы.
import type { ReportInput } from './types';
import { CASH_WALLETS, DDS_SECTIONS, PERIOD_START } from './config';
import { currentMonthKey, monthKey } from './dates';

export interface FlowNode { id: string; label: string; value: number }
export interface FlowLink { from: string; to: string; value: number }
export interface FlowResult { columns: FlowNode[][]; links: FlowLink[]; total: number }

const GROUPS: Record<string, string> = {
  'Закуп сырья': 'Закуп сырья и материалов',
  'Производственные материалы и обеспечение': 'Закуп сырья и материалов',
  'Себестоимость (Перекуп)': 'Закуп сырья и материалов',
  'Заработная плата': 'ЗП и отчисления',
  'KPI менеджеров': 'ЗП и отчисления',
  'Премии и бонусы': 'ЗП и отчисления',
  'Бонусы партнёрам / агентам': 'ЗП и отчисления',
  'Отчисления (ОПВ, СО и т.д.)': 'ЗП и отчисления',
  'Погашение рассрочки': 'Погашение рассрочки',
  'Конвертация безнал → нал': 'Конвертация в нал',
};

const SECTION_LABEL: Record<string, string> = {
  'ОПЕРАЦИОННАЯ': 'Операционная', 'ИНВЕСТИЦИОННАЯ': 'Инвестиционная', 'ФИНАНСОВАЯ': 'Финансовая',
};

function groupOf(category: string, section: string): string {
  if (GROUPS[category]) return GROUPS[category];
  if (section === 'ОПЕРАЦИОННАЯ') return 'Прочие операционные';
  if (section === 'ИНВЕСТИЦИОННАЯ') return 'Покупка ОС и расширение';
  return 'Займы и выемки';
}

export function buildFlows(input: ReportInput, periodEnd: string = currentMonthKey()): FlowResult {
  const sectionOf = new Map<string, string>();
  for (const [s, cats] of Object.entries(DDS_SECTIONS)) cats.forEach(c => sectionOf.set(c, s));

  const srcSec = new Map<string, number>();
  const secGrp = new Map<string, number>();
  const add = (source: string, category: string, amount: number) => {
    const section = sectionOf.get(category);
    if (!section || amount <= 0) return;
    const grp = groupOf(category, section);
    srcSec.set(`${source}|${section}`, (srcSec.get(`${source}|${section}`) || 0) + amount);
    secGrp.set(`${section}|${grp}`, (secGrp.get(`${section}|${grp}`) || 0) + amount);
  };

  for (const b of input.bank) {
    if (b.type.trim().toLowerCase() === 'приход' || b.category === 'Внутренний перевод') continue;
    const mk = monthKey(b.date);
    if (mk < PERIOD_START || mk > periodEnd) continue;
    add('Банк', b.category, Math.abs(b.amountKzt || b.amount));
  }
  for (const c of input.cash) {
    if (c.type !== 'расход' || c.category.trim() === 'Внутренний перевод') continue;
    const mk = monthKey(c.date);
    if (mk < PERIOD_START || mk > periodEnd) continue;
    add(CASH_WALLETS.includes(c.walletFrom) ? 'Касса' : 'Подотчётники', c.category.trim(), c.amount);
  }

  const links: FlowLink[] = [];
  srcSec.forEach((v, k) => { const [s, sec] = k.split('|'); links.push({ from: `s:${s}`, to: `a:${sec}`, value: v }); });
  secGrp.forEach((v, k) => { const [sec, g] = k.split('|'); links.push({ from: `a:${sec}`, to: `g:${g}`, value: v }); });

  const sum = (pred: (l: FlowLink) => boolean, key: 'from' | 'to', id: string) =>
    links.filter(l => l[key] === id && pred(l)).reduce((s, l) => s + l.value, 0);
  const col = (prefix: 's' | 'a' | 'g', labelOf: (id: string) => string, order?: string[]): FlowNode[] => {
    const ids = [...new Set(links.flatMap(l => [l.from, l.to]).filter(i => i.startsWith(prefix + ':')))];
    const nodes = ids.map(id => ({
      id, label: labelOf(id.slice(2)),
      value: prefix === 'g' ? sum(() => true, 'to', id) : sum(() => true, 'from', id),
    }));
    return nodes.sort((a, b) => (order ? order.indexOf(a.label) - order.indexOf(b.label) : b.value - a.value));
  };

  const columns = [
    col('s', n => n, ['Банк', 'Касса', 'Подотчётники']),
    col('a', n => SECTION_LABEL[n] || n, ['Операционная', 'Инвестиционная', 'Финансовая']),
    col('g', n => n),
  ];
  const total = columns[0].reduce((s, n) => s + n.value, 0);
  return { columns, links, total };
}
