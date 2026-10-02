import { useState } from 'react';
import { arBalance, type ManagerGroup } from '../../services/reports';
import { card, CardTitle, num, th } from './ui';
import { mln, money, pct, MINUS } from './format';

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const OTHER = '#cbd5e1';
const td = { ...num, padding: '11px 14px' } as const;
const label = (n: string) => n.replace(/^\d{2}\s+/, '');

interface Slice { key: string; name: string; value: number; color: string }

function Donut({ slices, center, sub, active, onPick }: { slices: Slice[]; center: string; sub: string; active?: string; onPick?: (key: string) => void }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 78, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 260, height: 'auto' }} role="img" aria-label="Доли долга">
      <circle cx="100" cy="100" r={R} fill="none" stroke="#f1f5f9" strokeWidth="30" />
      {slices.map(s => {
        const len = (s.value / total) * C;
        const el = (
          <circle key={s.key} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth={active === s.key ? 36 : 30}
            strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 100 100)"
            style={{ cursor: onPick ? 'pointer' : 'default', transition: 'stroke-width .15s', opacity: active && active !== s.key ? 0.45 : 1 }}
            onClick={() => onPick?.(s.key)}>
            <title>{`${s.name}: ${mln(s.value)} млн ₸ · ${pct((s.value / total) * 100, 1)}`}</title>
          </circle>
        );
        acc += len;
        return el;
      })}
      <text x="100" y="98" textAnchor="middle" style={{ fontSize: 24, fontWeight: 700, fill: '#0f172a' }}>{center}</text>
      <text x="100" y="118" textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }}>{sub}</text>
    </svg>
  );
}

function Legend({ slices, active, onPick }: { slices: Slice[]; active?: string; onPick?: (key: string) => void }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 220 }}>
      {slices.map(s => (
        <button key={s.key} type="button" onClick={() => onPick?.(s.key)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: active === s.key ? '#f1f5f9' : 'transparent', borderRadius: 8, padding: '8px 10px', cursor: onPick ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(s.name)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{mln(s.value)} млн</span>
          <span style={{ width: 54, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{pct((s.value / total) * 100, 1)}</span>
        </button>
      ))}
    </div>
  );
}

// Таблица: менеджер → клик раскрывает его клиентов.
export function ManagersTable({ groups, total }: { groups: ManagerGroup[]; total: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '17px 20px 12px', borderBottom: '1px solid #eef2f7' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <CardTitle title="Кто сколько должен сейчас" sub="₸ · нажмите на менеджера — увидите, какие компании ему должны · свои компании не учтены" />
          <button type="button" onClick={() => setDetail(d => !d)}
            style={{ marginLeft: 'auto', border: '1px solid #cbd5e1', background: detail ? '#e2e8f0' : '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', color: '#334155' }}>
            {detail ? 'Скрыть движение за период' : 'Показать движение за период'}
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', padding: '10px 20px' }}>Менеджер</th>
              {detail && <><th style={th}>Долг на начало периода</th><th style={th}>Отгружено</th><th style={th}>Оплачено</th></>}
              <th style={th}>Долг сейчас</th>
              {detail && <th style={th}>Рост / снижение</th>}
              <th style={th}>Должников</th><th style={{ ...th, paddingRight: 20 }}>Доля</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
              const isOpen = open === g.name;
              return [
                <tr key={g.name} onClick={() => setOpen(isOpen ? null : g.name)} style={{ borderTop: '1px solid #eef2f7', cursor: 'pointer', background: isOpen ? '#f8fafc' : undefined }}>
                  <td style={{ padding: '11px 20px', fontWeight: 800, color: '#0f172a', fontSize: 14.5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 10 }} />
                    <span style={{ color: '#94a3b8', marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>{g.name}
                  </td>
                  {detail && <>
                    <td style={{ ...td, color: '#64748b' }}>{money(g.open)}</td>
                    <td style={{ ...td, color: '#64748b' }}>{money(g.shipped)}</td>
                    <td style={{ ...td, color: '#64748b' }}>{money(g.paid)}</td>
                  </>}
                  <td style={{ ...td, fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{money(g.close)}</td>
                  {detail && <td style={{ ...td, fontWeight: 700, color: g.growth > 0 ? '#b91c1c' : '#15803d' }}>{g.growth > 0 ? '+' : ''}{money(g.growth)}</td>}
                  <td style={{ ...td, color: '#334155' }}>{g.debtors.length}</td>
                  <td style={{ ...td, paddingRight: 20, fontWeight: 700, color: '#334155' }}>{pct(g.share, 1)}</td>
                </tr>,
                isOpen && g.debtors.map(r => (
                  <tr key={g.name + r.name} style={{ borderTop: '1px solid #f1f5f9', background: '#fcfdff' }}>
                    <td style={{ padding: '8px 20px 8px 56px', fontWeight: 600, color: '#475569' }}>{r.name}</td>
                    {detail && <>
                      <td style={{ ...td, padding: '8px 14px', color: '#94a3b8' }}>{money(arBalance(r, 'open'))}</td>
                      <td style={{ ...td, padding: '8px 14px', color: '#94a3b8' }}>{money(r.turnD)}</td>
                      <td style={{ ...td, padding: '8px 14px', color: '#94a3b8' }}>{money(r.turnC)}</td>
                    </>}
                    <td style={{ ...td, padding: '8px 14px', fontWeight: 700, color: '#0f172a' }}>{money(arBalance(r))}</td>
                    {detail && <td style={{ ...td, padding: '8px 14px', fontWeight: 600, color: arBalance(r) - arBalance(r, 'open') > 0 ? '#b91c1c' : '#15803d' }}>
                      {arBalance(r) - arBalance(r, 'open') > 0 ? '+' : ''}{money(arBalance(r) - arBalance(r, 'open'))}
                    </td>}
                    <td style={td} />
                    <td style={{ ...td, padding: '8px 20px 8px 14px', color: '#64748b' }}>{pct((arBalance(r) / (total || 1)) * 100, 1)}</td>
                  </tr>
                )),
              ];
            })}
            <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <td style={{ padding: '12px 20px', fontWeight: 800 }}>Итого внешний долг</td>
              {detail && <>
                <td style={{ ...td, fontWeight: 700 }}>{money(groups.reduce((s, g) => s + g.open, 0))}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(groups.reduce((s, g) => s + g.shipped, 0))}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(groups.reduce((s, g) => s + g.paid, 0))}</td>
              </>}
              <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{money(groups.reduce((s, g) => s + g.close, 0))}</td>
              {detail && <td style={{ ...td, fontWeight: 700 }}>{(() => { const d = groups.reduce((s, g) => s + g.growth, 0); return `${d > 0 ? '+' : d < 0 ? MINUS : ''}${money(Math.abs(d))}`; })()}</td>}
              <td style={{ ...td, fontWeight: 700 }}>{groups.reduce((s, g) => s + g.debtors.length, 0)}</td>
              <td style={{ ...td, paddingRight: 20 }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Круги: слева доли менеджеров, справа — клиенты выбранного менеджера.
export function ManagersDonuts({ groups }: { groups: ManagerGroup[] }) {
  const [sel, setSel] = useState<string>(groups[0]?.name ?? '');
  const mgrSlices: Slice[] = groups.filter(g => g.close > 0).map((g, i) => ({ key: g.name, name: g.name, value: g.close, color: COLORS[i % COLORS.length] }));
  const total = mgrSlices.reduce((s, x) => s + x.value, 0);
  const g = groups.find(x => x.name === sel) ?? groups[0];
  const gi = groups.indexOf(g);
  const TOP = 7;
  const top = g.debtors.slice(0, TOP);
  const rest = g.debtors.slice(TOP);
  const clientSlices: Slice[] = top.map((r, i) => ({ key: r.name, name: r.name, value: arBalance(r), color: COLORS[(gi + i + 1) % COLORS.length] }));
  if (rest.length) clientSlices.push({ key: '__rest', name: `Прочие (${rest.length})`, value: rest.reduce((s, r) => s + arBalance(r), 0), color: OTHER });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 16 }}>
      <div style={{ ...card, padding: '17px 20px' }}>
        <CardTitle title="Кто сколько держит" sub="доля менеджера в долге внешних покупателей · нажмите на сектор" />
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <Donut slices={mgrSlices} center={`${mln(total)}`} sub="млн ₸ всего" active={sel} onPick={setSel} />
          <Legend slices={mgrSlices} active={sel} onPick={setSel} />
        </div>
      </div>
      <div style={{ ...card, padding: '17px 20px' }}>
        <CardTitle title={`Клиенты: ${label(g.name)}`} sub={`${g.debtors.length} должников · на конец ${mln(g.close)} млн ₸`} />
        {clientSlices.length === 0 ? (
          <div style={{ padding: '30px 0', color: '#94a3b8', fontWeight: 600 }}>Долгов нет.</div>
        ) : (
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <Donut slices={clientSlices} center={mln(g.close)} sub="млн ₸" />
            <Legend slices={clientSlices} />
          </div>
        )}
      </div>
    </div>
  );
}
