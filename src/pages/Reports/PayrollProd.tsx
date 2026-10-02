import { useEffect, useMemo, useState } from 'react';
import { loadProdPayroll, type ProdMonth, type StoredProdPayroll } from '../../services/reports';
import { card, CardTitle, Empty, num, th } from './ui';
import { mln, money, MINUS } from './format';
import { useReports } from './ReportsContext';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const monthLabel = (k: string) => `${MONTH_NAMES[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
const td = { ...num, padding: '9px 12px' } as const;

// код дня из табеля → цвет и подпись
const DAY: Record<string, { c: string; t: string }> = {
  'д': { c: '#2563eb', t: 'день' }, 'н': { c: '#1e293b', t: 'ночь' }, 'д/2': { c: '#93c5fd', t: 'полсмены' },
  'о': { c: '#e2e8f0', t: 'отдых' }, 'б': { c: '#ef4444', t: 'больничный' }, '': { c: '#f8fafc', t: 'нет данных' },
};

function Strip({ days }: { days: string }) {
  const list = days.split(',');
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {list.map((d, i) => {
        const x = DAY[d] ?? { c: '#cbd5e1', t: d };
        return <span key={i} title={`${i + 1}-е: ${x.t}`} style={{ width: 7, height: 16, borderRadius: 2, background: x.c, flexShrink: 0 }} />;
      })}
    </div>
  );
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const signed = (n: number) => (n < 0 ? `${MINUS}${money(-n)}` : money(n));

export function PayrollProd() {
  const { input } = useReports();
  const [stored, setStored] = useState<StoredProdPayroll | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => { loadProdPayroll().then(s => { setStored(s); const ms = s?.data.months ?? []; setMonth(ms.find(m => m.month === '2026-09')?.month ?? ms[ms.length - 1]?.month ?? ''); }).catch(e => setError(e instanceof Error ? e.message : 'Ошибка загрузки')); }, []);

  const months = stored?.data.months ?? [];
  const cur: ProdMonth | undefined = months.find(m => m.month === month);
  const t = useMemo(() => {
    if (!cur) return null;
    const w = cur.workers, i = cur.itr;
    const accrued = sum(w.map(r => r.accrued)) + sum(i.map(r => r.salary));
    const paid = sum(w.map(r => r.paid)) + sum(i.map(r => r.paid));
    const left = sum(w.map(r => r.balance)) + sum(i.map(r => r.balance));
    return {
      wAccrued: sum(w.map(r => r.accrued)), wBonus: sum(w.map(r => r.bonus)), wPenalty: sum(w.map(r => r.penalty)), wToPay: sum(w.map(r => r.toPay)), wPaid: sum(w.map(r => r.paid)), wLeft: sum(w.map(r => r.balance)),
      iSalary: sum(i.map(r => r.salary)), iDed: sum(i.map(r => r.deduction)), iBonus: sum(i.map(r => r.bonus)), iToPay: sum(i.map(r => r.toPay)), iPaid: sum(i.map(r => r.paid)), iLeft: sum(i.map(r => r.balance)),
      accrued, paid, left, count: w.length + i.length,
    };
  }, [cur]);

  if (error) return <Empty>{error}</Empty>;
  if (stored === undefined) return <Empty>Загружаем…</Empty>;
  if (!stored || !cur || !t) return <Empty>Табель производства ещё не загружен. Загрузите файл «ТАБЕЛ2026.xlsx» в разделе «Импорт данных».</Empty>;

  const q = query.trim().toLowerCase();
  const workers = cur.workers.filter(r => !q || r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q));
  const opiuZp = input?.settings.zpProduction[month];
  const pctPaid = t.accrued ? Math.min(100, Math.max(0, (t.paid / t.accrued) * 100)) : 0;
  const kpis = [
    { label: 'Начислено за месяц', value: mln(t.accrued, 2), note: `${t.count} сотрудников: рабочие и ИТР`, color: '#0f172a' },
    { label: 'Выплачено', value: mln(t.paid, 2), note: `${pctPaid.toFixed(0)}% от начисленного`, color: '#15803d' },
    { label: 'Осталось выплатить', value: mln(t.left, 2), note: 'долг перед сотрудниками', color: t.left > 0 ? '#b91c1c' : '#15803d' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', flexWrap: 'wrap', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 2 }}>
        {months.map(m => (
          <button key={m.month} type="button" onClick={() => setMonth(m.month)}
            style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: month === m.month ? '#fff' : 'transparent', color: month === m.month ? '#0f172a' : '#64748b', boxShadow: month === m.month ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
            {MONTH_NAMES[+m.month.slice(5) - 1]}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.3px', textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>млн ₸</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 6 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: '17px 20px' }}>
        <CardTitle title={`Выплаты · ${monthLabel(month)}`} sub="выплачено и осталось по группам" />
        <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', marginTop: 12, background: '#fee2e2' }}>
          <div style={{ width: `${pctPaid}%`, background: '#16a34a' }} title={`Выплачено ${money(t.paid)} ₸`} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 14 }}>
          {[{ n: 'Рабочие', a: t.wAccrued, p: t.wPaid, l: t.wLeft, c: cur.workers.length }, { n: 'ИТР', a: t.iSalary, p: t.iPaid, l: t.iLeft, c: cur.itr.length }].map(g => (
            <div key={g.n}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{g.n} <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {g.c} чел.</span></div>
              <div style={{ display: 'flex', gap: 18, marginTop: 6, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 600, color: '#475569' }}>
                <span>начислено <b style={{ color: '#0f172a' }}>{money(g.a)}</b></span>
                <span>выплачено <b style={{ color: '#15803d' }}>{money(g.p)}</b></span>
                <span>осталось <b style={{ color: '#b91c1c' }}>{signed(g.l)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <CardTitle title={`Табель рабочих · ${monthLabel(month)}`} sub="₸ · по дням: синий — день, чёрный — ночь, голубой — полсмены, серый — отдых, красный — больничный" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти сотрудника"
            style={{ marginLeft: 'auto', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, fontFamily: 'inherit', minWidth: 190 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 1150 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Сотрудник</th>
                <th style={{ ...th, textAlign: 'left' }}>Дни месяца</th>
                <th style={th}>Смен</th><th style={th}>Ставка</th><th style={th}>Начислено</th>
                <th style={th}>Премия</th><th style={th}>Удержано</th><th style={th}>К выплате</th>
                <th style={th}>Выплачено</th><th style={{ ...th, paddingRight: 20 }}>Осталось</th>
              </tr>
            </thead>
            <tbody>
              {workers.map(r => (
                <tr key={r.no + r.name} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={{ padding: '9px 20px', minWidth: 190 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>{r.role}</div>
                  </td>
                  <td style={{ padding: '9px 12px' }}><Strip days={r.days} /></td>
                  <td style={{ ...td, color: '#334155' }}>{r.shifts || '—'}{r.sick ? <span style={{ color: '#ef4444' }}> +{r.sick}б</span> : null}</td>
                  <td style={{ ...td, color: '#64748b' }}>{money(r.rate)}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{money(r.accrued)}</td>
                  <td style={{ ...td, color: r.bonus ? '#15803d' : '#cbd5e1' }}>{r.bonus ? `+${money(r.bonus)}` : '—'}</td>
                  <td style={{ ...td, color: r.penalty ? '#b91c1c' : '#cbd5e1' }}>{r.penalty ? `${MINUS}${money(r.penalty)}` : '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{money(r.toPay)}</td>
                  <td style={{ ...td, color: '#15803d', fontWeight: 600 }}>{r.paid ? money(r.paid) : '—'}</td>
                  <td style={{ ...td, paddingRight: 20, fontWeight: 800, color: r.balance > 0 ? '#b91c1c' : r.balance < 0 ? '#b45309' : '#15803d' }} title={r.balance < 0 ? 'выплачено больше, чем начислено' : undefined}>{signed(r.balance)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                <td style={{ padding: '12px 20px', fontWeight: 800 }}>Итого рабочие</td><td /><td />
                <td />
                <td style={{ ...td, fontWeight: 800 }}>{money(t.wAccrued)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(t.wBonus)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(t.wPenalty)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{money(t.wToPay)}</td>
                <td style={{ ...td, fontWeight: 800, color: '#15803d' }}>{money(t.wPaid)}</td>
                <td style={{ ...td, paddingRight: 20, fontWeight: 800, color: '#b91c1c' }}>{signed(t.wLeft)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {cur.itr.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7' }}>
            <CardTitle title={`ИТР · ${monthLabel(month)}`} sub="₸ · руководители и специалисты производства" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Сотрудник</th>
                  <th style={th}>Зарплата</th><th style={th}>Удержание</th><th style={th}>Премия</th>
                  <th style={th}>К выплате</th><th style={th}>Выплачено</th><th style={{ ...th, paddingRight: 20 }}>Осталось</th>
                </tr>
              </thead>
              <tbody>
                {cur.itr.map(r => (
                  <tr key={r.no + r.name} style={{ borderTop: '1px solid #eef2f7' }}>
                    <td style={{ padding: '9px 20px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>{r.role}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{money(r.salary)}</td>
                    <td style={{ ...td, color: r.deduction ? '#b91c1c' : '#cbd5e1' }}>{r.deduction ? `${MINUS}${money(r.deduction)}` : '—'}</td>
                    <td style={{ ...td, color: r.bonus ? '#15803d' : '#cbd5e1' }}>{r.bonus ? `+${money(r.bonus)}` : '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{money(r.toPay)}</td>
                    <td style={{ ...td, color: '#15803d', fontWeight: 600 }}>{r.paid ? money(r.paid) : '—'}</td>
                    <td style={{ ...td, paddingRight: 20, fontWeight: 800, color: r.balance > 0 ? '#b91c1c' : '#15803d' }}>{signed(r.balance)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '12px 20px', fontWeight: 800 }}>Итого ИТР</td>
                  <td style={{ ...td, fontWeight: 800 }}>{money(t.iSalary)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(t.iDed)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(t.iBonus)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{money(t.iToPay)}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#15803d' }}>{money(t.iPaid)}</td>
                  <td style={{ ...td, paddingRight: 20, fontWeight: 800, color: '#b91c1c' }}>{signed(t.iLeft)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Сверка с ОПиУ · {monthLabel(month)}</div>
        {opiuZp ? (
          <>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>ЗП производства в ОПиУ: {money(opiuZp)} ₸ · по табелю: {money(t.accrued)} ₸</div>
            <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: Math.abs(opiuZp - t.accrued) < 1 ? '#dcfce7' : '#fef3c7', color: Math.abs(opiuZp - t.accrued) < 1 ? '#15803d' : '#b45309' }}>
              {Math.abs(opiuZp - t.accrued) < 1 ? 'сходится' : `разница ${signed(opiuZp - t.accrued)} ₸`}
            </span>
          </>
        ) : <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>за этот месяц в ОПиУ зарплата производства ещё не внесена</div>}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
        Данные из файла «{stored.fileName}». Расчёт выплат пока берётся из таблицы как есть, логику подключим позже.
      </div>
    </div>
  );
}
