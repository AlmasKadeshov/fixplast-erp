import { useState } from 'react';
import { card, CardTitle, Empty, num, th } from './ui';
import { mln, money, pct } from './format';
import { useReports } from './ReportsContext';
import { PayrollProd } from './PayrollProd';

const MONTHS = [
  { key: '2026-09', label: 'Сентябрь 2026' },
  { key: '2026-10', label: 'Октябрь 2026' },
];
const OFFICIAL = '#2563eb';
const UNOFFICIAL = '#f59e0b';
const td = { ...num, padding: '11px 14px' } as const;
const muted = { color: '#cbd5e1', fontWeight: 600 } as const;

function PayrollOffice() {
  const { input } = useReports();
  const [month, setMonth] = useState(MONTHS[0].key);
  const staff = input?.settings.staff ?? [];
  if (!staff.length) {
    return <Empty>Список сотрудников ещё не загружен. Загрузите таблицу с листом «ОФИС_ЗП_данные» в разделе «Импорт данных».</Empty>;
  }

  const rows = [...staff].sort((a, b) => b.total - a.total);
  const fund = rows.reduce((s, r) => s + r.total, 0);
  const official = rows.reduce((s, r) => s + r.official, 0);
  const unofficial = rows.reduce((s, r) => s + r.unofficial, 0);
  const split = official + unofficial || 1;
  const opiuZp = input?.settings.zpOffice[month];
  const cur = MONTHS.find(m => m.key === month)!;

  const kpis = [
    { label: 'Сотрудников офиса', value: String(rows.length), unit: '', note: 'сейчас работают' },
    { label: 'Фонд оплаты за месяц', value: mln(fund, 2), unit: 'млн ₸', note: `${money(fund)} ₸ по окладам` },
    { label: 'Средний оклад', value: mln(fund / rows.length, 2), unit: 'млн ₸', note: 'на одного сотрудника' },
    { label: 'Крупнейший оклад', value: mln(rows[0].total, 2), unit: 'млн ₸', note: rows[0].name.trim() },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 2 }}>
        {MONTHS.map(m => (
          <button key={m.key} type="button" onClick={() => setMonth(m.key)}
            style={{ border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: month === m.key ? '#fff' : 'transparent', color: month === m.key ? '#0f172a' : '#64748b', boxShadow: month === m.key ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
            Табель · {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.3px', textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', color: '#0f172a' }}>{k.value}</div>
              {k.unit && <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{k.unit}</div>}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 6 }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: '17px 20px' }}>
        <CardTitle title="Как выплачивается" sub="официальная и неофициальная части окладов" />
        <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', marginTop: 12, background: '#f1f5f9' }}>
          <div style={{ width: `${(official / split) * 100}%`, background: OFFICIAL }} title={`Официально: ${money(official)} ₸`} />
          <div style={{ width: `${(unofficial / split) * 100}%`, background: UNOFFICIAL }} title={`Неофициально: ${money(unofficial)} ₸`} />
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 12 }}>
          {[{ c: OFFICIAL, t: 'Официально', v: official }, { c: UNOFFICIAL, t: 'Неофициально', v: unofficial }].map(x => (
            <div key={x.t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: x.c }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{x.t}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{mln(x.v, 2)} млн</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{pct((x.v / split) * 100, 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7' }}>
          <CardTitle title={`Табель · ${cur.label}`} sub="₸ · сотрудники офиса, по убыванию оклада" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Сотрудник</th>
                <th style={th}>Официально</th><th style={th}>Неофициально</th><th style={th}>Начислено</th>
                <th style={{ ...th, textAlign: 'left', minWidth: 130 }}>Доля фонда</th>
                <th style={th}>Выплачено</th><th style={{ ...th, paddingRight: 20 }}>Осталось</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={{ padding: '11px 20px', fontWeight: 700, color: '#0f172a' }}>{r.name.trim()}</td>
                  <td style={{ ...td, color: r.official ? '#334155' : '#cbd5e1' }}>{r.official ? money(r.official) : '—'}</td>
                  <td style={{ ...td, color: r.unofficial ? '#334155' : '#cbd5e1' }}>{r.unofficial ? money(r.unofficial) : '—'}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0f172a' }}>{money(r.total)}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                        <div style={{ width: `${(r.total / rows[0].total) * 100}%`, height: '100%', background: OFFICIAL, borderRadius: 4 }} />
                      </div>
                      <span style={{ width: 40, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{pct((r.total / fund) * 100, 0)}</span>
                    </div>
                  </td>
                  <td style={{ ...td, ...muted }}>—</td>
                  <td style={{ ...td, paddingRight: 20, ...muted }}>—</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                <td style={{ padding: '12px 20px', fontWeight: 800 }}>Итого</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(official)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(unofficial)}</td>
                <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{money(fund)}</td>
                <td /><td style={{ ...td, ...muted }}>—</td><td style={{ ...td, paddingRight: 20, ...muted }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Сверка с ОПиУ · {cur.label}</div>
        {opiuZp ? (
          <>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>ЗП офиса в ОПиУ: {money(opiuZp)} ₸ · по окладам: {money(fund)} ₸</div>
            <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: Math.abs(opiuZp - fund) < 1 ? '#dcfce7' : '#fef3c7', color: Math.abs(opiuZp - fund) < 1 ? '#15803d' : '#b45309' }}>
              {Math.abs(opiuZp - fund) < 1 ? 'сходится' : `разница ${money(opiuZp - fund)} ₸`}
            </span>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>за этот месяц в ОПиУ зарплата офиса ещё не внесена</div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
        Оклады из таблицы «ОФИС_ЗП_данные». Колонки «Выплачено» и «Осталось» заполнятся после подключения выплат из банка и кассы.
      </div>
    </div>
  );
}

export function Payroll() {
  const [group, setGroup] = useState<'office' | 'prod'>('office');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: '#0f172a', borderRadius: 12, padding: 4, gap: 2 }}>
        {([['office', 'Офис'], ['prod', 'Производство']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setGroup(k)}
            style={{ border: 'none', borderRadius: 9, padding: '9px 22px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', background: group === k ? '#2563eb' : 'transparent', color: group === k ? '#fff' : '#94a3b8' }}>{t}</button>
        ))}
      </div>
      {group === 'office' ? <PayrollOffice /> : <PayrollProd />}
    </div>
  );
}
