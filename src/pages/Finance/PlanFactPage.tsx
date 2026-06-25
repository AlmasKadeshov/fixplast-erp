import { useState, useEffect, useMemo } from 'react';
import {
    format,
    differenceInDays,
    max as maxDate,
    min as minDate,
    startOfMonth,
    endOfMonth,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { financeService } from '../../services/finance.service';
import { costItemsService } from '../../services/costItems.service';
import { budgetPlansService } from '../../services/budgetPlans.service';
import { payrollService } from '../../services/payroll.service';
import { Transaction, getPaymentDate } from '../../models/finance';
import { CostItem } from '../../models/costItems';
import { BudgetPlan } from '../../models/budgetPlan';
import { PayrollRecord } from '../../models/payroll';
import { useCategories } from '../../hooks/useCategories';
import { useToast } from '../../components/ui/Toast';
import { Edit2, Save, Copy, X } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { formatMoney } from '../../utils/formatters';

// ============================================
// TYPES
// ============================================

type FactMethod = 'cash' | 'accrual';
type OpiuSection = 'revenue' | 'cogs' | 'opex' | 'ignore';

interface PlanFactRow {
    categoryId: string;
    categoryName: string;
    type: 'income' | 'expense';
    plan: number;
    fact: number;
    deviation: number;
    executionPercent: number;
    budgetPlanId?: string;
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

// ============================================
// COMPONENT
// ============================================

export function PlanFactPage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [method, setMethod] = useState<FactMethod>('cash');
    const [editMode, setEditMode] = useState(false);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit state: categoryId -> planned amount
    const [editValues, setEditValues] = useState<Record<string, string>>({});

    const { categories } = useCategories();
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, [year, month]);

    const loadData = async () => {
        setLoading(true);
        try {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;

            const [txs, items, plans, payroll] = await Promise.all([
                financeService.getTransactions({
                    startDate: new Date(year - 1, 0, 1),
                    endDate: new Date(year + 1, 11, 31),
                }),
                costItemsService.getAll(),
                budgetPlansService.getByMonth(year, month),
                payrollService.getByMonths([monthKey]),
            ]);

            setTransactions(txs);
            setCostItems(items);
            setBudgetPlans(plans);
            setPayrollRecords(payroll);
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    const categoryLookup = useMemo(() => {
        const map = new Map<string, { name: string; type: 'income' | 'expense'; opiuCategory: OpiuSection; isSystem: boolean }>();
        for (const cat of categories) {
            const entry = { name: cat.name, type: cat.type, opiuCategory: normalizeOpiuCategory(cat.opiuCategory), isSystem: cat.isSystem };
            map.set(cat.id, entry);
            if (cat.legacyItemId) map.set(cat.legacyItemId, entry);
        }
        for (const item of costItems) {
            if (!map.has(item.itemId)) {
                map.set(item.itemId, {
                    name: item.itemName,
                    type: 'expense',
                    opiuCategory: normalizeOpiuCategory(item.opiuCategory),
                    isSystem: false,
                });
            }
        }
        return map;
    }, [categories, costItems]);

    const periodStart = startOfMonth(new Date(year, month - 1));
    const periodEnd = endOfMonth(new Date(year, month - 1));

    // Calculate fact amounts per category
    const factByCategory = useMemo(() => {
        const map = new Map<string, number>();

        for (const t of transactions) {
            if (t.type === 'transfer') continue;
            if (t.status !== 'fact') continue;

            const cat = categoryLookup.get(t.categoryId);
            if (!cat || cat.opiuCategory === 'ignore' || cat.isSystem) continue;

            let amount = 0;

            if (method === 'cash') {
                // Cash method: by paymentDate
                const txDate = getPaymentDate(t).toDate();
                if (txDate >= periodStart && txDate <= periodEnd) {
                    amount = t.amount;
                }
            } else {
                // Accrual method: proportional by accrualDate
                const accrualFrom = t.accrualDateFrom ? t.accrualDateFrom.toDate() : getPaymentDate(t).toDate();
                const accrualTo = t.accrualDateTo ? t.accrualDateTo.toDate() : accrualFrom;
                const periodDays = differenceInDays(accrualTo, accrualFrom) + 1;
                if (periodDays <= 0) continue;

                const overlapStart = maxDate([accrualFrom, periodStart]);
                const overlapEnd = minDate([accrualTo, periodEnd]);
                if (overlapStart > overlapEnd) continue;

                const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                amount = periodDays <= 1 || periodDays === overlapDays
                    ? t.amount
                    : (t.amount / periodDays) * overlapDays;
            }

            if (amount > 0) {
                const key = t.categoryId;
                map.set(key, (map.get(key) || 0) + amount);
            }
        }

        // Add payroll as OPEX fact
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        for (const pr of payrollRecords) {
            if (pr.totalDue <= 0) continue;
            if (pr.month === monthKey) {
                map.set('__payroll__', (map.get('__payroll__') || 0) + pr.totalDue);
            }
        }

        return map;
    }, [transactions, categoryLookup, method, periodStart, periodEnd, year, month, payrollRecords]);

    // Build plan → budget map
    const planByCategory = useMemo(() => {
        const map = new Map<string, { amount: number; planId: string }>();
        for (const bp of budgetPlans) {
            map.set(bp.categoryId, { amount: bp.plannedAmount, planId: bp.id });
        }
        return map;
    }, [budgetPlans]);

    // Build report rows
    const reportData = useMemo<{ incomeRows: PlanFactRow[]; expenseRows: PlanFactRow[]; totals: { incomePlan: number; incomeFact: number; expensePlan: number; expenseFact: number } }>(() => {
        const allCategoryIds = new Set<string>();

        // From budget plans
        for (const bp of budgetPlans) allCategoryIds.add(bp.categoryId);

        // From facts
        for (const [catId] of factByCategory) {
            if (catId !== '__payroll__') allCategoryIds.add(catId);
        }

        const incomeRows: PlanFactRow[] = [];
        const expenseRows: PlanFactRow[] = [];

        for (const catId of allCategoryIds) {
            const cat = categoryLookup.get(catId);
            if (!cat || cat.opiuCategory === 'ignore' || cat.isSystem) continue;

            const plan = planByCategory.get(catId)?.amount || 0;
            const fact = factByCategory.get(catId) || 0;
            const deviation = fact - plan;
            const executionPercent = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 999 : 0);

            const row: PlanFactRow = {
                categoryId: catId,
                categoryName: cat.name,
                type: cat.type,
                plan,
                fact,
                deviation,
                executionPercent: parseFloat(executionPercent.toFixed(1)),
                budgetPlanId: planByCategory.get(catId)?.planId,
            };

            if (cat.type === 'income') incomeRows.push(row);
            else expenseRows.push(row);
        }

        // Payroll row
        const payrollFact = factByCategory.get('__payroll__') || 0;
        const payrollPlan = planByCategory.get('__payroll__')?.amount || 0;
        if (payrollFact > 0 || payrollPlan > 0) {
            expenseRows.push({
                categoryId: '__payroll__',
                categoryName: 'Зарплата (ведомость)',
                type: 'expense',
                plan: payrollPlan,
                fact: payrollFact,
                deviation: payrollFact - payrollPlan,
                executionPercent: parseFloat((payrollPlan > 0 ? (payrollFact / payrollPlan) * 100 : (payrollFact > 0 ? 999 : 0)).toFixed(1)),
                budgetPlanId: planByCategory.get('__payroll__')?.planId,
            });
        }

        incomeRows.sort((a, b) => b.fact - a.fact);
        expenseRows.sort((a, b) => b.fact - a.fact);

        const incomePlan = incomeRows.reduce((s, r) => s + r.plan, 0);
        const incomeFact = incomeRows.reduce((s, r) => s + r.fact, 0);
        const expensePlan = expenseRows.reduce((s, r) => s + r.plan, 0);
        const expenseFact = expenseRows.reduce((s, r) => s + r.fact, 0);

        return { incomeRows, expenseRows, totals: { incomePlan, incomeFact, expensePlan, expenseFact } };
    }, [budgetPlans, factByCategory, planByCategory, categoryLookup]);

    // Edit mode handlers
    const startEditMode = () => {
        const values: Record<string, string> = {};
        for (const row of [...reportData.incomeRows, ...reportData.expenseRows]) {
            values[row.categoryId] = String(row.plan || '');
        }
        setEditValues(values);
        setEditMode(true);
    };

    const cancelEditMode = () => {
        setEditMode(false);
        setEditValues({});
    };

    const saveEdits = async () => {
        setSaving(true);
        try {
            for (const [catId, valStr] of Object.entries(editValues)) {
                const amount = parseFloat(valStr) || 0;
                const cat = categoryLookup.get(catId);
                if (!cat) continue;

                await budgetPlansService.upsert({
                    year,
                    month,
                    type: cat.type,
                    categoryId: catId,
                    plannedAmount: amount,
                });
            }
            showToast('Бюджет сохранён', 'success');
            setEditMode(false);
            loadData();
        } catch {
            showToast('Ошибка сохранения', 'error');
        } finally {
            setSaving(false);
        }
    };

    const copyFromPrevMonth = async () => {
        setSaving(true);
        try {
            const count = await budgetPlansService.copyFromPreviousMonth(year, month);
            showToast(`Скопировано ${count} бюджетов`, 'success');
            loadData();
        } catch {
            showToast('Ошибка копирования', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Color logic per TZ
    const getRowColor = (row: PlanFactRow): string => {
        if (row.plan === 0) return '';
        if (row.type === 'income') {
            // Green if fact >= plan (overperformance)
            return row.fact >= row.plan ? 'bg-green-50' : 'bg-red-50';
        } else {
            // Green if fact <= plan (savings), Red if fact > plan (overspend)
            return row.fact <= row.plan ? 'bg-green-50' : 'bg-red-50';
        }
    };

    const deviationColor = (row: PlanFactRow): string => {
        if (row.plan === 0) return 'text-gray-400';
        if (row.type === 'income') {
            return row.deviation >= 0 ? 'text-emerald-600' : 'text-red-600';
        } else {
            return row.deviation <= 0 ? 'text-emerald-600' : 'text-red-600';
        }
    };

    // Month navigation
    const monthLabel = format(new Date(year, month - 1, 1), 'LLLL yyyy', { locale: ru });

    const prevMonth = () => {
        if (month === 1) { setYear(y => y - 1); setMonth(12); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 12) { setYear(y => y + 1); setMonth(1); }
        else setMonth(m => m + 1);
    };

    const renderRows = (rows: PlanFactRow[], label: string, totalPlan: number, totalFact: number) => (
        <>
            <tr className="bg-slate-200 font-semibold">
                <td colSpan={editMode ? 6 : 5} className="px-4 py-2 text-slate-700 text-xs uppercase tracking-wider">
                    {label}
                </td>
            </tr>
            {rows.map(row => (
                <tr key={row.categoryId} className={`hover:bg-gray-50 ${getRowColor(row)}`}>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{row.categoryName}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                        {editMode ? (
                            <input
                                type="number"
                                value={editValues[row.categoryId] || ''}
                                onChange={e => setEditValues(v => ({ ...v, [row.categoryId]: e.target.value }))}
                                className="w-28 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                        ) : (
                            row.plan > 0 ? formatMoney(row.plan) : '–'
                        )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-gray-900">
                        {row.fact > 0 ? formatMoney(row.fact) : '–'}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold ${deviationColor(row)}`}>
                        {row.plan > 0 || row.fact > 0
                            ? `${row.deviation >= 0 ? '+' : ''}${formatMoney(row.deviation)}`
                            : '–'
                        }
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-bold ${
                        row.executionPercent >= 100
                            ? (row.type === 'income' ? 'text-emerald-600' : 'text-red-600')
                            : row.executionPercent > 0 ? 'text-amber-600' : 'text-gray-400'
                    }`}>
                        {row.plan > 0 ? `${row.executionPercent}%` : (row.fact > 0 ? '∞' : '–')}
                    </td>
                </tr>
            ))}
            <tr className="bg-gray-100 font-semibold border-t border-gray-200">
                <td className="px-4 py-2.5 text-sm text-gray-700">Итого {label.toLowerCase()}</td>
                {editMode && <td></td>}
                <td className="px-4 py-2.5 text-right text-sm tabular-nums">{totalPlan > 0 ? formatMoney(totalPlan) : '–'}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums font-bold">{totalFact > 0 ? formatMoney(totalFact) : '–'}</td>
                <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-bold ${
                    label === 'Доходы'
                        ? (totalFact - totalPlan >= 0 ? 'text-emerald-600' : 'text-red-600')
                        : (totalFact - totalPlan <= 0 ? 'text-emerald-600' : 'text-red-600')
                }`}>
                    {totalPlan > 0 || totalFact > 0
                        ? `${totalFact - totalPlan >= 0 ? '+' : ''}${formatMoney(totalFact - totalPlan)}`
                        : '–'
                    }
                </td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums font-bold">
                    {totalPlan > 0 ? `${((totalFact / totalPlan) * 100).toFixed(1)}%` : '–'}
                </td>
            </tr>
        </>
    );

    const { totals } = reportData;
    const netPlan = totals.incomePlan - totals.expensePlan;
    const netFact = totals.incomeFact - totals.expenseFact;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">План-Факт</h2>
                    <ReportInfoPopover
                        title="Как работает План-Факт"
                        items={[
                            { label: 'Бюджет', text: 'План берётся из коллекции budgetPlans (НЕ из plan-транзакций).' },
                            { label: 'Кассовый метод', text: 'Факт считается по дате платежа (paymentDate).' },
                            { label: 'Метод начислений', text: 'Факт считается по дате начисления (accrualDate) с пропорциональным распределением.' },
                            { label: 'Цвет', text: 'Для доходов: зелёный = перевыполнение. Для расходов: зелёный = экономия.' },
                        ]}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {/* Method toggle */}
                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                        <button
                            onClick={() => setMethod('cash')}
                            className={`px-3 py-1.5 rounded-md transition-colors ${
                                method === 'cash' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'
                            }`}
                        >
                            Кассовый
                        </button>
                        <button
                            onClick={() => setMethod('accrual')}
                            className={`px-3 py-1.5 rounded-md transition-colors ${
                                method === 'accrual' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'
                            }`}
                        >
                            Начисления
                        </button>
                    </div>

                    {/* Month navigation */}
                    <div className="flex items-center gap-1">
                        <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded">←</button>
                        <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center capitalize">{monthLabel}</span>
                        <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded">→</button>
                    </div>

                    {/* Actions */}
                    {editMode ? (
                        <div className="flex gap-1">
                            <button
                                onClick={saveEdits}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Save className="w-3.5 h-3.5" /> Сохранить
                            </button>
                            <button
                                onClick={cancelEditMode}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
                            >
                                <X className="w-3.5 h-3.5" /> Отмена
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-1">
                            <button
                                onClick={startEditMode}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100"
                            >
                                <Edit2 className="w-3.5 h-3.5" /> Бюджет
                            </button>
                            <button
                                onClick={copyFromPrevMonth}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 text-sm rounded-lg hover:bg-gray-100 disabled:opacity-50"
                            >
                                <Copy className="w-3.5 h-3.5" /> Копировать
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-4 py-3 min-w-[200px]">Категория</th>
                                <th className="px-4 py-3 text-right">План (₸)</th>
                                <th className="px-4 py-3 text-right">Факт (₸)</th>
                                <th className="px-4 py-3 text-right">Отклонение</th>
                                <th className="px-4 py-3 text-right">% исполн.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {renderRows(reportData.incomeRows, 'Доходы', totals.incomePlan, totals.incomeFact)}
                            {renderRows(reportData.expenseRows, 'Расходы', totals.expensePlan, totals.expenseFact)}

                            {/* Net result */}
                            <tr className="bg-slate-800 text-white font-bold">
                                <td className="px-4 py-3">ЧИСТЫЙ РЕЗУЛЬТАТ</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(netPlan)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(netFact)}</td>
                                <td className={`px-4 py-3 text-right tabular-nums ${
                                    netFact - netPlan >= 0 ? 'text-emerald-300' : 'text-red-300'
                                }`}>
                                    {`${netFact - netPlan >= 0 ? '+' : ''}${formatMoney(netFact - netPlan)}`}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {netPlan !== 0 ? `${((netFact / netPlan) * 100).toFixed(1)}%` : '–'}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-4 flex-wrap">
                        <span><span className="inline-block w-3 h-3 rounded bg-green-200 mr-1"></span> Доход перевыполнен / Расход сэкономлен</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-red-200 mr-1"></span> Доход недовыполнен / Расход перерасход</span>
                        <span className="ml-auto text-gray-400">
                            Метод: {method === 'cash' ? 'кассовый' : 'начислений'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
