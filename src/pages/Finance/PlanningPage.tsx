// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from 'react';
import { buildProjectSelectTree } from '../../utils/projectTree';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
    Plus, Calendar, TrendingDown, TrendingUp, AlertTriangle,
    ChevronLeft, ChevronRight, Trash2, Copy, Save, X, Layers, FolderKanban
} from 'lucide-react';
import { financeService } from '../../services/finance.service';
import { Transaction } from '../../models/finance';
import { projectsService } from '../../services/projects.service';
import { costItemsService } from '../../services/costItems.service';
import { payrollService } from '../../services/payroll.service';
import { PayrollRecord } from '../../models/payroll';
import { Project } from '../../models';
import { CostItem } from '../../models/costItems';
import { useToast } from '../../components/ui/Toast';
import { Timestamp } from 'firebase/firestore';
import { formatMoney as fmt, formatMoneyCompact as fmtCompact } from '../../utils/formatters';

type BudgetMethod = 'cash' | 'accrual';
type GroupByMode = 'category' | 'project';

// Категории плановых расходов
const PLAN_CATEGORIES = [
    { id: 'payroll', label: 'Заработная плата', icon: '👷', color: 'bg-blue-100 text-blue-700' },
    { id: 'materials', label: 'Материалы', icon: '🧱', color: 'bg-amber-100 text-amber-700' },
    { id: 'subcontractor', label: 'Подрядчики СМР', icon: '🔨', color: 'bg-orange-100 text-orange-700' },
    { id: 'rent', label: 'Аренда', icon: '🏢', color: 'bg-purple-100 text-purple-700' },
    { id: 'taxes', label: 'Налоги и сборы', icon: '📋', color: 'bg-red-100 text-red-700' },
    { id: 'transport', label: 'Транспорт', icon: '🚛', color: 'bg-teal-100 text-teal-700' },
    { id: 'equipment', label: 'Оборудование', icon: '⚙️', color: 'bg-indigo-100 text-indigo-700' },
    { id: 'other', label: 'Прочие расходы', icon: '📦', color: 'bg-gray-100 text-gray-700' },
    { id: 'income_plan', label: 'Плановый приход', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

interface PlanItem {
    categoryId: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    projectId: string;
}

const defaultPlanItem: PlanItem = {
    categoryId: '',
    description: '',
    amount: 0,
    type: 'expense',
    projectId: '',
};

export function PlanningPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newItem, setNewItem] = useState<PlanItem>(defaultPlanItem);
    const [saving, setSaving] = useState(false);
    const [budgetMethod, setBudgetMethod] = useState<BudgetMethod>('cash');
    const [groupBy, setGroupBy] = useState<GroupByMode>('category');
    const { showToast } = useToast();

    // Дерево проектов для группированного select
    const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);

    const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
    const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
    const monthLabel = format(currentDate, 'LLLL yyyy', { locale: ru });

    // Дата в формате для payroll "yyyy-MM"
    const payrollMonth = format(currentDate, 'yyyy-MM');

    // Загрузка данных при смене месяца
    useEffect(() => {
        loadData();
    }, [payrollMonth]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [txs, prjs, items, payroll] = await Promise.all([
                financeService.getTransactions({}),
                projectsService.getAll(),
                costItemsService.getAll(),
                payrollService.getByMonth(payrollMonth),
            ]);
            setAllTransactions(txs);
            setProjects(prjs);
            setCostItems(items);
            setPayrollRecords(payroll);
        } catch (err) {
            console.error(err);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    // ЗП из ведомостей — план = сумма totalDue, факт = сумма paidAmount
    const payrollBudget = useMemo(() => {
        const plan = payrollRecords.reduce((sum, r) => sum + (r.totalDue || 0), 0);
        const fact = payrollRecords.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
        return { plan, fact, count: payrollRecords.length };
    }, [payrollRecords]);

    // Фильтрация транзакций по выбранному месяцу и методу учёта
    const { planned, fact: factArr } = useMemo(() => {
        const plannedArr: Transaction[] = [];
        const factArrLocal: Transaction[] = [];

        const monthKey = format(currentDate, 'yyyy-MM');

        for (const t of allTransactions) {
            if (budgetMethod === 'accrual' && t.accountingPeriod) {
                // Начисления: группируем по accountingPeriod (формат yyyy-MM)
                if (t.accountingPeriod === monthKey) {
                    if (t.status === 'plan') plannedArr.push(t);
                    else factArrLocal.push(t);
                }
            } else {
                // Кассовый: группируем по дате платежа
                const tDate = t.date.toDate();
                if (tDate >= monthStart && tDate <= monthEnd) {
                    if (t.status === 'plan') plannedArr.push(t);
                    else factArrLocal.push(t);
                }
            }
        }

        return { planned: plannedArr, fact: factArrLocal };
    }, [allTransactions, monthStart, monthEnd, budgetMethod, currentDate]);

    // Группировка по выбранному режиму (категории или проекты)
    const {
        planByGroup,
        factByGroup,
        totalPlanIncome,
        totalPlanExpense,
        totalFactIncome,
        totalFactExpense,
    } = useMemo(() => {
        const planMap = new Map<string, { income: number; expense: number; items: Transaction[] }>();
        const factMap = new Map<string, { income: number; expense: number; items: Transaction[] }>();

        const getKey = (t: Transaction) => {
            if (groupBy === 'project') return t.projectId || '__no_project__';
            return t.categoryId || 'other';
        };

        for (const t of planned) {
            const key = getKey(t);
            const entry = planMap.get(key) || { income: 0, expense: 0, items: [] };
            if (t.type === 'income') entry.income += t.amount;
            else entry.expense += t.amount;
            entry.items.push(t);
            planMap.set(key, entry);
        }

        for (const t of factArr) {
            const key = getKey(t);
            const entry = factMap.get(key) || { income: 0, expense: 0, items: [] };
            if (t.type === 'income') entry.income += t.amount;
            else entry.expense += t.amount;
            entry.items.push(t);
            factMap.set(key, entry);
        }

        // Авто-ЗП из ведомости (только в режиме «по категориям»)
        if (groupBy === 'category') {
            if (payrollBudget.count > 0 && !planMap.has('payroll')) {
                planMap.set('payroll', { income: 0, expense: payrollBudget.plan, items: [] });
            }
            if (payrollBudget.count > 0 && !factMap.has('payroll')) {
                factMap.set('payroll', { income: 0, expense: payrollBudget.fact, items: [] });
            }
            if (payrollBudget.count > 0 && planMap.has('payroll') && !factMap.has('payroll')) {
                factMap.set('payroll', { income: 0, expense: payrollBudget.fact, items: [] });
            }
        }

        let tpi = 0, tpe = 0, tfi = 0, tfe = 0;
        planned.forEach((t: Transaction) => t.type === 'income' ? tpi += t.amount : tpe += t.amount);
        factArr.forEach((t: Transaction) => t.type === 'income' ? tfi += t.amount : tfe += t.amount);

        // Добавляем ЗП к итогам (только в режиме «по категориям»)
        if (groupBy === 'category') {
            if (payrollBudget.count > 0 && !planned.some(t => t.categoryId === 'payroll')) {
                tpe += payrollBudget.plan;
            }
            if (payrollBudget.count > 0 && !factArr.some(t => t.categoryId === 'payroll')) {
                tfe += payrollBudget.fact;
            }
        }

        return {
            planByGroup: planMap,
            factByGroup: factMap,
            totalPlanIncome: tpi,
            totalPlanExpense: tpe,
            totalFactIncome: tfi,
            totalFactExpense: tfe,
        };
    }, [planned, factArr, groupBy, payrollBudget]);

    // Кассовый разрыв
    const cashGap = useMemo(() => {
        const planNet = totalPlanIncome - totalPlanExpense;
        const factNet = totalFactIncome - totalFactExpense;
        return {
            planNet,
            factNet,
            gap: factNet - planNet,
            gapPct: planNet !== 0 ? ((factNet - planNet) / Math.abs(planNet)) * 100 : 0,
        };
    }, [totalPlanIncome, totalPlanExpense, totalFactIncome, totalFactExpense]);

    // Все уникальные ключи группировки
    const allGroupKeys = useMemo(() => {
        const keys = new Set([...planByGroup.keys(), ...factByGroup.keys()]);
        return Array.from(keys).sort();
    }, [planByGroup, factByGroup]);

    const getCategoryLabel = useCallback((catId: string) => {
        const preset = PLAN_CATEGORIES.find(c => c.id === catId);
        if (preset) return preset.label;
        const item = costItems.find(c => c.itemId === catId);
        return item?.itemName || catId;
    }, [costItems]);

    const getCategoryStyle = useCallback((catId: string) => {
        const preset = PLAN_CATEGORIES.find(c => c.id === catId);
        return preset?.color || 'bg-gray-100 text-gray-700';
    }, []);

    const getCategoryIcon = useCallback((catId: string) => {
        const preset = PLAN_CATEGORIES.find(c => c.id === catId);
        return preset?.icon || '📌';
    }, []);

    const getGroupLabel = useCallback((key: string) => {
        if (groupBy === 'project') {
            if (key === '__no_project__') return 'Без проекта';
            return projects.find(p => p.id === key)?.name || key;
        }
        return getCategoryLabel(key);
    }, [groupBy, projects, getCategoryLabel]);

    const getGroupIcon = useCallback((key: string) => {
        if (groupBy === 'project') return '📁';
        return getCategoryIcon(key);
    }, [groupBy, getCategoryIcon]);

    const getGroupStyle = useCallback((key: string) => {
        if (groupBy === 'project') return 'bg-slate-100 text-slate-700';
        return getCategoryStyle(key);
    }, [groupBy, getCategoryStyle]);

    // Добавить плановую транзакцию
    const handleAddPlan = async () => {
        if (!newItem.amount || newItem.amount <= 0) {
            showToast('Укажите сумму', 'error');
            return;
        }
        if (!newItem.categoryId) {
            showToast('Выберите категорию', 'error');
            return;
        }

        setSaving(true);
        try {
            // Создаём плановую транзакцию на 15-е число выбранного месяца
            const planDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15);

            await financeService.addTransaction({
                date: Timestamp.fromDate(planDate),
                amount: newItem.amount,
                type: newItem.type,
                status: 'plan',
                walletId: '',
                partnerId: '',
                categoryId: newItem.categoryId,
                projectId: newItem.projectId,
                description: newItem.description || getCategoryLabel(newItem.categoryId),
                sourceDoc: 'plan',
                sourceType: 'bank',
            });

            showToast('Плановая транзакция добавлена', 'success');
            setShowAddModal(false);
            setNewItem(defaultPlanItem);
            // Перезагружаем данные
            loadData();
        } catch (err) {
            console.error(err);
            showToast('Ошибка при создании плана', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Копировать план на следующий месяц
    const handleCopyToNextMonth = async () => {
        if (planned.length === 0) {
            showToast('Нет плановых записей для копирования', 'warning');
            return;
        }

        setSaving(true);
        try {
            const nextMonth = addMonths(currentDate, 1);
            const planDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15);
            let count = 0;

            for (const t of planned) {
                await financeService.addTransaction({
                    date: Timestamp.fromDate(planDate),
                    amount: t.amount,
                    type: t.type,
                    status: 'plan',
                    walletId: t.walletId || '',
                    partnerId: t.partnerId || '',
                    categoryId: t.categoryId,
                    projectId: t.projectId,
                    description: t.description,
                    sourceDoc: 'plan',
                    sourceType: 'bank',
                });
                count++;
            }

            showToast(`Скопировано ${count} записей на ${format(nextMonth, 'LLLL yyyy', { locale: ru })}`, 'success');
        } catch (err) {
            console.error(err);
            showToast('Ошибка при копировании', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Удалить плановую транзакцию
    const handleDeletePlan = async (id: string) => {
        try {
            await financeService.deleteTransactions([id]);
            showToast('Удалено', 'success');
            loadData();
        } catch {
            showToast('Ошибка удаления', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Финансовое планирование</h2>
                    <p className="text-sm text-gray-500 mt-1">Планируйте расходы и доходы, сравнивайте с фактом</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Month navigation */}
                    <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                            <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <span className="text-sm font-medium capitalize px-2 min-w-[140px] text-center">{monthLabel}</span>
                        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded">
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                    <button
                        onClick={handleCopyToNextMonth}
                        disabled={saving || planned.length === 0}
                        className="flex items-center gap-1 px-3 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Copy className="w-4 h-4" /> Копировать на след. месяц
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4" /> Добавить план
                    </button>
                </div>
            </div>

            {/* Method & GroupBy toggles */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-white border rounded-lg p-0.5">
                    <button
                        onClick={() => setBudgetMethod('cash')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            budgetMethod === 'cash' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" /> Кассовый (ДДС)
                    </button>
                    <button
                        onClick={() => setBudgetMethod('accrual')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            budgetMethod === 'accrual' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" /> Начисления (ОПиУ)
                    </button>
                </div>

                <div className="flex items-center bg-white border rounded-lg p-0.5">
                    <button
                        onClick={() => setGroupBy('category')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            groupBy === 'category' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" /> По категориям
                    </button>
                    <button
                        onClick={() => setGroupBy('project')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            groupBy === 'project' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <FolderKanban className="w-3.5 h-3.5" /> По проектам
                    </button>
                </div>

                {budgetMethod === 'accrual' && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Группировка по учётному периоду (accountingPeriod)
                    </span>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">План приход</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtCompact(totalPlanIncome)} ₸</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">План расход</p>
                    <p className="text-xl font-bold text-red-500">{fmtCompact(totalPlanExpense)} ₸</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Факт приход</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtCompact(totalFactIncome)} ₸</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Факт расход</p>
                    <p className="text-xl font-bold text-red-500">{fmtCompact(totalFactExpense)} ₸</p>
                </div>
                <div className={`rounded-xl border shadow-sm p-4 ${cashGap.factNet >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                        {cashGap.factNet < cashGap.planNet
                            ? <><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Кассовый разрыв</>
                            : <><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Факт vs План</>
                        }
                    </p>
                    <p className={`text-xl font-bold ${cashGap.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {cashGap.gap >= 0 ? '+' : ''}{fmtCompact(cashGap.gap)} ₸
                    </p>
                </div>
            </div>

            {/* Budget breakdown table */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-semibold text-gray-800">
                        Бюджет: План vs Факт
                        {groupBy === 'project' && <span className="text-sm font-normal text-gray-500 ml-2">(по проектам)</span>}
                        {budgetMethod === 'accrual' && <span className="text-sm font-normal text-indigo-500 ml-2">· начисления</span>}
                    </h3>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-3 text-left">{groupBy === 'project' ? 'Проект' : 'Категория'}</th>
                            <th className="px-6 py-3 text-right">План</th>
                            <th className="px-6 py-3 text-right">Факт</th>
                            <th className="px-6 py-3 text-right">Отклонение</th>
                            <th className="px-6 py-3 text-center">%</th>
                            <th className="px-6 py-3 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {allGroupKeys.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                    <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="font-medium">Нет данных за {monthLabel}</p>
                                    <p className="text-sm mt-1">Добавьте плановые расходы кнопкой «Добавить план»</p>
                                </td>
                            </tr>
                        ) : (
                            allGroupKeys.map(key => {
                                const plan = planByGroup.get(key);
                                const fact = factByGroup.get(key);
                                const planAmount = (plan?.expense || 0) - (plan?.income || 0);
                                const factAmount = (fact?.expense || 0) - (fact?.income || 0);
                                const deviation = factAmount - planAmount;
                                const pct = planAmount !== 0 ? (factAmount / planAmount) * 100 : (factAmount > 0 ? 100 : 0);
                                const isAutoPayroll = groupBy === 'category' && key === 'payroll' && payrollBudget.count > 0
                                    && (plan?.items.length === 0);

                                return (
                                    <tr key={key} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{getGroupIcon(key)}</span>
                                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getGroupStyle(key)}`}>
                                                    {getGroupLabel(key)}
                                                </span>
                                                {isAutoPayroll && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-500 border border-blue-200">
                                                        👷 из ведомости · {payrollBudget.count} чел.
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-gray-700">
                                            {planAmount !== 0 ? fmt(Math.abs(planAmount)) : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-gray-900">
                                            {factAmount !== 0 ? fmt(Math.abs(factAmount)) : '—'}
                                        </td>
                                        <td className={`px-6 py-3 text-right font-medium ${deviation > 0 ? 'text-red-600' : deviation < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {deviation !== 0 ? `${deviation > 0 ? '+' : ''}${fmt(deviation)}` : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {planAmount !== 0 ? (
                                                <div className="flex items-center justify-center">
                                                    <div className="w-16 bg-gray-100 rounded-full h-2 relative overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="ml-2 text-xs text-gray-500 w-12 text-right">{Math.round(pct)}%</span>
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td className="px-6 py-3">
                                            {plan && plan.items.length > 0 && !isAutoPayroll && (
                                                <button
                                                    onClick={() => handleDeletePlan(plan.items[0].id)}
                                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Удалить план"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                    {allGroupKeys.length > 0 && (
                        <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                            <tr>
                                <td className="px-6 py-3 text-gray-700">ИТОГО расходы</td>
                                <td className="px-6 py-3 text-right text-gray-700">{fmt(totalPlanExpense)}</td>
                                <td className="px-6 py-3 text-right text-gray-900">{fmt(totalFactExpense)}</td>
                                <td className={`px-6 py-3 text-right ${totalFactExpense - totalPlanExpense > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {totalPlanExpense > 0 ? `${totalFactExpense - totalPlanExpense > 0 ? '+' : ''}${fmt(totalFactExpense - totalPlanExpense)}` : '—'}
                                </td>
                                <td className="px-6 py-3 text-center text-gray-500 text-xs">
                                    {totalPlanExpense > 0 ? `${Math.round((totalFactExpense / totalPlanExpense) * 100)}%` : '—'}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Planned items list */}
            {planned.length > 0 && (
                <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">Плановые записи ({planned.length})</h3>
                    <div className="space-y-2">
                        {planned.map(t => (
                            <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">{getCategoryIcon(t.categoryId)}</span>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{t.description || getCategoryLabel(t.categoryId)}</p>
                                        <p className="text-xs text-gray-500">
                                            {t.projectId ? projects.find(p => p.id === t.projectId)?.name || '' : 'Без проекта'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {t.type === 'income' ? '+' : '-'}{fmt(t.amount)} ₸
                                    </span>
                                    <button
                                        onClick={() => handleDeletePlan(t.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add Plan Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-800">Добавить плановую запись</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Тип */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setNewItem(prev => ({ ...prev, type: 'expense' }))}
                                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${newItem.type === 'expense'
                                            ? 'bg-red-100 text-red-700 border-2 border-red-300'
                                            : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                                            }`}
                                    >
                                        <TrendingDown className="w-4 h-4 inline mr-1" /> Расход
                                    </button>
                                    <button
                                        onClick={() => setNewItem(prev => ({ ...prev, type: 'income' }))}
                                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${newItem.type === 'income'
                                            ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                                            : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                                            }`}
                                    >
                                        <TrendingUp className="w-4 h-4 inline mr-1" /> Приход
                                    </button>
                                </div>
                            </div>

                            {/* Категория */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {PLAN_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setNewItem(prev => ({ ...prev, categoryId: cat.id }))}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${newItem.categoryId === cat.id
                                                ? `${cat.color} ring-2 ring-offset-1 ring-blue-400`
                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                                }`}
                                        >
                                            {cat.icon} {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Сумма */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма (₸) *</label>
                                <input
                                    type="number"
                                    placeholder="1 000 000"
                                    value={newItem.amount || ''}
                                    onChange={e => setNewItem(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                                />
                            </div>

                            {/* Описание */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                                <input
                                    type="text"
                                    placeholder="Аренда офиса за март"
                                    value={newItem.description}
                                    onChange={e => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* Проект */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Проект</label>
                                <select
                                    value={newItem.projectId}
                                    onChange={e => setNewItem(prev => ({ ...prev, projectId: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Общие расходы (без проекта)</option>
                                    {projectTree.map(g => g.children.length > 0 ? (
                                        <optgroup key={g.id} label={g.name}>
                                            {g.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </optgroup>
                                    ) : (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
                            <button
                                onClick={handleAddPlan}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Сохранение...' : 'Сохранить'}
                            </button>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200"
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
