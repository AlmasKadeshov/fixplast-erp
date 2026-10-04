import { useEffect } from 'react';
import type { DrillOp } from '../../services/reports';
import { MONO } from './ui';
import { money } from './format';

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Almaty' });

export function DrillPanel({ title, amountLabel, ops, note, onClose, bare }: {
  title: string; amountLabel: string; ops: DrillOp[]; note?: string; onClose: () => void; bare?: boolean;
}) {
  const shown = ops.slice(0, 40);
  return (
    <div style={{
      background: '#fff', border: '1px solid #cbd5e1', borderRadius: 16, padding: '18px 20px',
      boxShadow: '0 12px 30px -20px rgba(15,23,42,.4)', animation: 'fp-slide .22s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#64748b' }}>Расшифровка</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.2px' }}>{title}</div>
        </div>
        {!bare && <button type="button" onClick={onClose} aria-label="Закрыть" style={{
          marginLeft: 'auto', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 26, height: 26,
          cursor: 'pointer', color: '#64748b', fontSize: 14, lineHeight: 1,
        }}>×</button>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#2563eb', marginBottom: 12 }}>{amountLabel}</div>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: bare ? '56vh' : 420, overflowY: 'auto' }}>
        {shown.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, padding: '8px 0' }}>Нет операций — сумма берётся из помесячных листов (ЗП, коммунальные, продажи).</div>}
        {shown.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 0', borderTop: '1px solid #eef2f7' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#94a3b8', flex: 'none' }}>{dateFmt.format(o.date)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label || '—'}</div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{o.source}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#0f172a', flex: 'none', whiteSpace: 'nowrap' }}>{money(o.amount)}</div>
          </div>
        ))}
      </div>
      {ops.length > shown.length && <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Показаны крупнейшие {shown.length} из {ops.length}</div>}
      {note && <div style={{ marginTop: 10, fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{note}</div>}
    </div>
  );
}

/** Всплывающее окно с расшифровкой: закрывается кликом вне окна или клавишей Esc */
export function DrillModal(props: { title: string; amountLabel: string; ops: DrillOp[]; note?: string; onClose: () => void }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fp-modal-wrap" style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fp-fade .15s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, boxShadow: '0 30px 70px -30px rgba(15,23,42,.7)', borderRadius: 16 }}>
        <DrillPanel {...props} bare />
      </div>
    </div>
  );
}
