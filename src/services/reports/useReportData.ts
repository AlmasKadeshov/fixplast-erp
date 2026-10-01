import { useCallback, useEffect, useState } from 'react';
import { loadReportData, type ReportMeta } from './reportStore';
import type { ReportInput } from './types';

export interface ReportDataState {
  data: (ReportInput & { meta: ReportMeta | null }) | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

// Данные одной загрузкой на всё приложение: переключение между экранами отчётов не перечитывает Firestore
let cache: ReportDataState['data'] = null;

/** Сбросить кэш (после нового импорта) */
export function invalidateReportData() { cache = null; }

export function useReportData(enabled = true): ReportDataState {
  const [data, setData] = useState<ReportDataState['data']>(cache);
  const [loading, setLoading] = useState(enabled && !cache);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || (cache && tick === 0)) return;
    let alive = true;
    setLoading(true);
    loadReportData()
      .then(d => { if (!alive) return; cache = d; setData(d); setError(''); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить данные'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tick, enabled]);

  const reload = useCallback(() => { cache = null; setTick(t => t + 1); }, []);
  return { data, loading, error, reload };
}
