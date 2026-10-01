import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  buildBalances, buildDds, buildOpiu, useReportData, type ReportDataState,
  type BalancesResult, type DdsResult, type OpiuResult, type ReportInput, type ReportMeta,
} from '../../services/reports';

export interface ReportsValue {
  loading: boolean;
  error: string;
  empty: boolean;
  input: ReportInput | null;
  meta: ReportMeta | null;
  opiu: OpiuResult | null;
  dds: DdsResult | null;
  balances: BalancesResult | null;
  reload: () => void;
}

const Ctx = createContext<ReportsValue | null>(null);

/** initialData — подставить готовые данные без обращения к Firestore (предпросмотр, тесты) */
export function ReportsProvider({ children, initialData }: { children: ReactNode; initialData?: ReportDataState['data'] }) {
  const live = useReportData(!initialData);
  const { data, loading, error, reload } = initialData ? { data: initialData, loading: false, error: '', reload: live.reload } : live;

  const value = useMemo<ReportsValue>(() => {
    if (!data) return { loading, error, empty: !loading && !error, input: null, meta: null, opiu: null, dds: null, balances: null, reload };
    const input: ReportInput = { bank: data.bank, cash: data.cash, sales: data.sales, settings: data.settings };
    return {
      loading, error, empty: false, input, meta: data.meta,
      opiu: buildOpiu(input, { costMode: 'monthly' }),
      dds: buildDds(input),
      balances: buildBalances(data.cash, data.settings),
      reload,
    };
  }, [data, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReports(): ReportsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReports must be used within ReportsProvider');
  return v;
}

/** Строка ОПиУ по ключу (значения по месяцам) */
export function opiuRow(opiu: OpiuResult, key: string): number[] {
  return opiu.rows.find(r => r.key === key)?.values ?? opiu.months.map(() => 0);
}
