import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { arBalance, groupByManager, isRelated, loadReceivables, summarizeAr, type StoredAr } from '../../services/reports';
import { useAuth } from '../../contexts';
import { card, CardTitle, Empty, num, th } from './ui';
import { ManagersDonuts, ManagersTable } from './ReceivablesManagers';
import { mln, money, pct, MINUS } from './format';

const RELATED_BG = '#f5f3ff';
const RELATED_FG = '#6d28d9';
const td = { ...num, padding: '9px 12px' } as const;
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Almaty' });

export function Receivables() {
  const { appUser } = useAuth();
  const isOwner = appUser?.role === 'owner';
  const [state, setState] = useState<{ ar: StoredAr | null; related: string[] } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showSmall, setShowSmall] = useState(false);
  const [view, setView] = useState<'table' | 'circles' | 'clients'>('table');

  useEffect(() => { loadReceivables().then(setState).catch(e => setError(e instanceof Error ? e.message : 'Ошибка загрузки')); }, []);

  const rows = state?.ar?.report.rows ?? [];
  const related = state?.related ?? [];
  const model = useMemo(() => {
    const mine = rows.filter(r => isRelated(r.name, related));
    const ext = rows.filter(r => !isRelated(r.name, related));
    const extDebtors = ext.filter(r => arBalance(r) > 0.5).sort((a, b) => arBalance(b) - arBalance(a));
    return { mine, ext, summary: summarizeAr(ext), extDebtors, mineClose: mine.reduce((s, r) => s + arBalance(r), 0), mineOpen: mine.reduce((s, r) => s + arBalance(r, 'open'), 0), groups: groupByManager(rows, related) };
  }, [rows, related]);

  if (error) return <Empty>{error}</Empty>;
  if (!state) return <Empty>Загружаем…</Empty>;
  if (!state.ar) {
    return <Empty>Данные по дебиторке ещё не загружены. {isOwner ? <Link to="/reports/import" style={{ color: '#2563eb', fontWeight: 700 }}>Загрузить отчёт из 1С →</Link> : 'Обратитесь к владельцу.'}</Empty>;
  }

  const { summary: sm, extDebtors } = model;
  const q = query.trim().toLowerCase();
  const list = rows
    .filter(r => Math.abs(arBalance(r)) >= 1 || Math.abs(arBalance(r, 'open')) >= 1)
    .filter(r => (showSmall || isRelated(r.name, related) ? true : Math.abs(arBalance(r)) >= 1e6 || Math.abs(arBalance(r, 'open')) >= 1e6))
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => arBalance(b) - arBalance(a));
  const dSum = extDebtors.reduce((s, r) => s + arBalance(r), 0) || 1;
  const growthUp = sm.growth >= 0;
  const hasManagers = rows.some(r => r.manager);
  const shown = hasManagers ? view : 'clients';

  const kpis = [
    { label: 'Долг внешних покупателей', value: mln(sm.close), note: `на ${mln(sm.open)} в начале периода`, color: '#0f172a' },
    { label: 'Рост за период', value: `${growthUp ? '+' : MINUS}${mln(Math.abs(sm.growth))}`, note: 'деньги «застряли» у клиентов', color: growthUp ? '#b91c1c' : '#15803d' },
    { label: 'Должников', value: String(sm.debtors), note: `топ-3 = ${pct(sm.top3Pct)} долга`, color: '#0f172a' },
    { label: 'Новые должники', value: `${sm.newDebtors.count}`, note: `${mln(sm.newDebtors.sum)} млн — долга не было на начало`, color: '#0f172a' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{state.ar.report.company}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{state.ar.report.title.replace('Оборотно-сальдовая ведомость по счету', 'ОСВ по счёту')}</div>
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>загружено {dateFmt.format(new Date(state.ar.importedAt))}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 14, padding: '16px 17px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.3px', textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', color: k.color }}>{k.value}</div>
              {k.label !== 'Должников' && <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>млн ₸</div>}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 6 }}>{k.note}</div>
          </div>
        ))}
        <div style={{ ...card, borderRadius: 14, padding: '16px 17px', background: RELATED_BG, borderColor: '#ddd6fe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: RELATED_FG, letterSpacing: '.3px', textTransform: 'uppercase' }}>Свои компании</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', color: RELATED_FG }}>{mln(model.mineClose)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa' }}>млн ₸</div>
          </div>
          <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 500, marginTop: 6 }}>в итоги выше не входят</div>
        </div>
      </div>

      {hasManagers && (
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: 10, padding: 3, gap: 2 }}>
          {([['table', 'Таблица по менеджерам'], ['circles', 'Круги'], ['clients', 'Все клиенты']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              style={{ border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: shown === k ? '#fff' : 'transparent', color: shown === k ? '#0f172a' : '#64748b', boxShadow: shown === k ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>{t}</button>
          ))}
        </div>
      )}
      {shown === 'table' && <ManagersTable groups={model.groups} total={sm.close} />}
      {shown === 'circles' && <ManagersDonuts groups={model.groups} />}
      {shown === 'clients' && <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <CardTitle title="Должники" sub={`${list.length} в списке · ₸ · фиолетовым — свои компании`} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showSmall} onChange={e => setShowSmall(e.target.checked)} /> показать мелких (&lt; 1 млн)
            </label>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти клиента"
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, fontFamily: 'inherit', minWidth: 190 }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Клиент</th>
                <th style={th}>На начало</th><th style={th}>Отгружено</th><th style={th}>Оплачено</th>
                <th style={th}>На конец</th><th style={th}>Изменение</th><th style={{ ...th, paddingRight: 20 }}>Доля долга</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => {
                const mine = isRelated(r.name, related);
                const bal = arBalance(r), open = arBalance(r, 'open'), diff = bal - open;
                return (
                  <tr key={r.name} style={{ borderTop: '1px solid #f1f5f9', background: mine ? RELATED_BG : undefined }}>
                    <td style={{ padding: '9px 20px', fontWeight: 600, color: mine ? RELATED_FG : '#334155', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}{mine && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, background: '#ddd6fe', color: RELATED_FG, borderRadius: 5, padding: '2px 6px' }}>СВОЯ</span>}
                    </td>
                    <td style={{ ...td, color: '#64748b' }}>{money(open)}</td>
                    <td style={{ ...td, color: '#64748b' }}>{money(r.turnD)}</td>
                    <td style={{ ...td, color: '#64748b' }}>{money(r.turnC)}</td>
                    <td style={{ ...td, fontWeight: 700, color: bal > 0 ? '#0f172a' : '#15803d' }}>{money(bal)}</td>
                    <td style={{ ...td, fontWeight: 600, color: diff > 0 ? '#b91c1c' : '#15803d' }}>{diff > 0 ? '+' : ''}{money(diff)}</td>
                    <td style={{ ...td, paddingRight: 20, color: '#64748b' }}>{!mine && bal > 0 ? pct((bal / dSum) * 100, 1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
        Данные из 1С (бухгалтерский учёт, тенге). Сроки просрочки в этом отчёте не видны — для них нужен отчёт «Анализ задолженности по срокам».
      </div>
    </div>
  );
}
