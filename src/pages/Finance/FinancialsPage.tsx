import { useState, useEffect, useMemo } from 'react';
import {
    format,
    eachMonthOfInterval,
    differenceInDays,
    max as maxDate,
    min as minDate,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { financeService } from '../../services/finance.service';
import { costItemsService } from '../../services/costItems.service';
import { payrollService } from '../../services/payroll.service';
import { Transaction, getPaymentDate } from '../../models/finance';
import { CostItem } from '../../models/costItems';
import { PayrollRecord } from '../../models/payroll';
import { useCategories } from '../../hooks/useCategories';
import { useToast } from '../../components/ui/Toast';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { formatMoney } from '../../utils/formatters';

// ============================================
// TYPES
// ============================================

type OpiuSection = 'revenue' | 'cogs' | 'opex' | 'ignore';

interface MonthlyMetrics {
    month: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    opex: number;
    ebitda: number;
    ebitdaMargin: number;
    netProfit: number;
    netMargin: number;
}

// ============================================
// HELPERS
// ============================================

function normalizeOpiuCategory(raw?: string): OpiuSection {
    if (!raw) return 'ignore';
    const lower = raw.toLowerCase();
    if (lower === 'revenue') return 'revenue';
    if (lower === 'cogs') return 'cogs';
    if (lower === 'opex') return 'opex';
    return 'ignore';
}

const formatPct = (v: number) => `${v.toFixed(1)}%`;

// ============================================
// COMPONENT
// ============================================

export function FinancialsPage() {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const { categories } = useCategories();
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, [currentYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const monthKeys: string[] = [];
            for (let m = 0; m < 12; m++) {
                monthKeys.push(`${currentYear}-${String(m + 1).padStart(2, '0')}`);
            }

            const [txs, items, payroll] = await Promise.all([
                financeService.getTransactions({
                    startDate: new Date(currentYear - 1, 0, 1),
                    endDate: new Date(currentYear + 1, 11, 31),
                }),
                costItemsService.getAll(),
                payrollService.getByMonths(monthKeys),
            ]);

            setTransactions(txs);
            setCostItems(items);
            setPayrollRecords(payroll);
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    const categoryLookup = useMemo(() => {
        const map = new Map<string, { opiuCategory: OpiuSection; isSystem: boolean }>();
        for (const cat of categories) {
            const entry = { opiuCategory: normalizeOpiuCategory(cat.opiuCategory), isSystem: cat.isSystem };
            map.set(cat.id, entry);
            if (cat.legacyItemId) map.set(cat.legacyItemId, entry);
        }
        for (const item of costItems) {
            if (!map.has(item.itemId)) {
                map.set(item.itemId, { opiuCategory: normalizeOpiuCategory(item.opiuCategory), isSystem: false });
            }
        }
        return map;
    }, [categories, costItems]);

    const months = useMemo(
        () => eachMonthOfInterval({
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 1),
        }),
        [currentYear],
    );

    const metrics = useMemo<MonthlyMetrics[]>(() => {
        // Accumulate per month
        const data: Record<string, { revenue: number; cogs: number; opex: number }> = {};
        months.forEach(m => { data[format(m, 'yyyy-MM')] = { revenue: 0, cogs: 0, opex: 0 }; });

        for (const t of transactions) {
            if (t.type === 'transfer') continue;
            if (t.status !== 'fact') continue;

            const cat = categoryLookup.get(t.categoryId);
            if (!cat || cat.opiuCategory === 'ignore' || cat.isSystem) continue;

            const accrualFrom = t.accrualDateFrom ? t.accrualDateFrom.toDate() : getPaymentDate(t).toDate();
            const accrualTo = t.accrualDateTo ? t.accrualDateTo.toDate() : accrualFrom;
            const periodDays = differenceInDays(accrualTo, accrualFrom) + 1;
            if (periodDays <= 0) continue;

            for (const month of months) {
                const monthKey = format(month, 'yyyy-MM');
                const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

                const overlapStart = maxDate([accrualFrom, monthStart]);
                const overlapEnd = minDate([accrualTo, monthEnd]);
                if (overlapStart > overlapEnd) continue;

                const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                const amount = periodDays <= 1 || periodDays === overlapDays
                    ? t.amount
                    : (t.amount / periodDays) * overlapDays;

                if (t.type === 'income' && cat.opiuCategory === 'revenue') {
                    data[monthKey].revenue += amount;
                } else if (t.type === 'expense') {
                    if (cat.opiuCategory === 'cogs') data[monthKey].cogs += amount;
                    else if (cat.opiuCategory === 'opex') data[monthKey].opex += amount;
                }
            }
        }

        // Add payroll to OPEX
        for (const pr of payrollRecords) {
            if (pr.totalDue <= 0 || !pr.month) continue;
            if (data[pr.month]) data[pr.month].opex += pr.totalDue;
        }

        return months.map(m => {
            const monthKey = format(m, 'yyyy-MM');
            const d = data[monthKey];
            const grossProfit = d.revenue - d.cogs;
            const ebitda = grossProfit - d.opex;
            return {
                month: monthKey,
                revenue: d.revenue,
                cogs: d.cogs,
                grossProfit,
                grossMargin: d.revenue > 0 ? (grossProfit / d.revenue) * 100 : 0,
                opex: d.opex,
                ebitda,
                ebitdaMargin: d.revenue > 0 ? (ebitda / d.revenue) * 100 : 0,
                netProfit: ebitda,
                netMargin: d.revenue > 0 ? (ebitda / d.revenue) * 100 : 0,
            };
        });
    }, [transactions, categoryLookup, months, payrollRecords]);

    // Annual totals
    const annual = useMemo(() => {
        const revenue = metrics.reduce((s, m) => s + m.revenue, 0);
        const cogs = metrics.reduce((s, m) => s + m.cogs, 0);
        const opex = metrics.reduce((s, m) => s + m.opex, 0);
        const grossProfit = revenue - cogs;
        const ebitda = grossProfit - opex;
        return {
            revenue, cogs, opex, grossProfit, ebitda,
            grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
            ebitdaMargin: revenue > 0 ? (ebitda / revenue) * 100 : 0,
        };
    }, [metrics]);

    const TrendIcon = ({ value }: { value: number }) => {
        if (value > 0) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
        if (value < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
        return <Minus className="w-4 h-4 text-gray-400" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Финансовые показатели</h2>
                    <ReportInfoPopover
                        title="Как считаются показатели"
                        items={[
                            { label: 'Источник', text: 'Данные берутся из ОПиУ (метод начислений).' },
                            { label: 'EBITDA', text: 'Выручка − Себестоимость − OPEX. Без амортизации и процентов.' },
                            { label: 'Маржинальность', text: '(EBITDA / Выручка) × 100%.' },
                        ]}
                    />
                </div>
                <select
                    value={currentYear}
                    onChange={(e) => setCurrentYear(Number(e.target.value))}
                    className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                    {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        {[
                            { label: 'Выручка', value: annual.revenue, color: 'text-gray-900' },
                            { label: 'Себестоимость', value: annual.cogs, color: 'text-orange-600' },
                            { label: 'Валовая прибыль', value: annual.grossProfit, color: annual.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600', sub: formatPct(annual.grossMargin) },
                            { label: 'OPEX', value: annual.opex, color: 'text-blue-600' },
                            { label: 'EBITDA', value: annual.ebitda, color: annual.ebitda >= 0 ? 'text-emerald-600' : 'text-red-600', sub: formatPct(annual.ebitdaMargin) },
                        ].map(kpi => (
                            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{kpi.label}</p>
                                <p className={`text-lg font-bold tabular-nums ${kpi.color}`}>
                                    {formatMoney(kpi.value)} <span className="text-xs font-normal text-gray-400">₸</span>
                                </p>
                                {kpi.sub && (
                                    <p className="text-xs text-gray-500 mt-0.5">Маржа: {kpi.sub}</p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Monthly table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium whitespace-nowrap">
                                <tr>
                                    <th className="px-4 py-3">Месяц</th>
                                    <th className="px-4 py-3 text-right">Выручка</th>
                                    <th className="px-4 py-3 text-right">COGS</th>
                                    <th className="px-4 py-3 text-right">Вал. прибыль</th>
                                    <th className="px-4 py-3 text-right">Вал. маржа</th>
                                    <th className="px-4 py-3 text-right">OPEX</th>
                                    <th className="px-4 py-3 text-right">EBITDA</th>
                                    <th className="px-4 py-3 text-right">EBITDA %</th>
                                    <th className="px-3 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {metrics.map((m, idx) => (
                                    <tr key={m.month} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 font-medium text-gray-700">
                                            {format(months[idx], 'LLLL', { locale: ru })}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                            {m.revenue > 0 ? formatMoney(m.revenue) : '–'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">
                                            {m.cogs > 0 ? formatMoney(m.cogs) : '–'}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                                            m.grossProfit > 0 ? 'text-emerald-600' : m.grossProfit < 0 ? 'text-red-600' : 'text-gray-400'
                                        }`}>
                                            {m.grossProfit !== 0 ? formatMoney(m.grossProfit) : '–'}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums ${
                                            m.grossMargin >= 15 ? 'text-emerald-600' : m.grossMargin >= 0 ? 'text-amber-600' : 'text-red-600'
                                        }`}>
                                            {m.revenue > 0 ? formatPct(m.grossMargin) : '–'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">
                                            {m.opex > 0 ? formatMoney(m.opex) : '–'}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                                            m.ebitda > 0 ? 'text-emerald-600' : m.ebitda < 0 ? 'text-red-600' : 'text-gray-400'
                                        }`}>
                                            {m.ebitda !== 0 ? formatMoney(m.ebitda) : '–'}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                                            m.ebitdaMargin >= 15 ? 'text-emerald-600' : m.ebitdaMargin >= 0 ? 'text-amber-600' : 'text-red-600'
                                        }`}>
                                            {m.revenue > 0 ? formatPct(m.ebitdaMargin) : '–'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <TrendIcon value={m.ebitda} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-800 text-white font-bold">
                                    <td className="px-4 py-3">ИТОГО {currentYear}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(annual.revenue)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(annual.cogs)}</td>
                                    <td className={`px-4 py-3 text-right tabular-nums ${annual.grossProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {formatMoney(annual.grossProfit)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatPct(annual.grossMargin)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(annual.opex)}</td>
                                    <td className={`px-4 py-3 text-right tabular-nums ${annual.ebitda >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {formatMoney(annual.ebitda)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatPct(annual.ebitdaMargin)}</td>
                                    <td className="px-3 py-3"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
