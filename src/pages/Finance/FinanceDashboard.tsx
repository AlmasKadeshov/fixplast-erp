import { useState, useEffect, useMemo } from 'react';
import { buildProjectSelectTree } from '../../utils/projectTree';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Calendar
} from 'lucide-react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Area
} from 'recharts';
import { financeService } from '../../services/finance.service';
import { projectsService } from '../../services/projects.service';
import { costItemsService } from '../../services/costItems.service';
import { Transaction } from '../../models/finance';
import { Project } from '../../models';
import { CostItem } from '../../models/costItems';
import {
    generateCashFlowChartData,
    DayFlow
} from '../../utils/finance.utils';
import { format } from 'date-fns';
import { formatMoneyCompact, formatFullMoney } from '../../utils/formatters';

export function FinanceDashboard() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(2025);
    const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');

    // Дерево проектов для группированного select
    const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [txs, prjs, items] = await Promise.all([
                    financeService.getTransactions({}),
                    projectsService.getAll(),
                    costItemsService.getAll()
                ]);
                setTransactions(txs);
                setProjects(prjs);
                setCostItems(items);
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const availableYears = useMemo(() => {
        if (transactions.length === 0) return [new Date().getFullYear()];
        const years = new Set(transactions.map(t => t.date.toDate().getFullYear()));
        years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        if (selectedProjectId === 'all') return transactions;
        return transactions.filter(t => t.projectId === selectedProjectId);
    }, [transactions, selectedProjectId]);

    const cashFlowData: DayFlow[] = useMemo(() =>
        generateCashFlowChartData(filteredTransactions, costItems, selectedYear, selectedMonth),
        [filteredTransactions, costItems, selectedYear, selectedMonth]);

    // Расчёт сводки
    const summary = useMemo(() => {
        const totalIncome = cashFlowData.reduce((sum, d) => sum + d.income, 0);
        const totalExpense = cashFlowData.reduce((sum, d) => sum + d.expense, 0);
        const currentBalance = cashFlowData.length > 0 ? cashFlowData[cashFlowData.length - 1].balance : 0;
        const startBalance = cashFlowData.length > 0 ? cashFlowData[0].balance - cashFlowData[0].income + cashFlowData[0].expense : 0;
        const netFlow = totalIncome - totalExpense;

        return {
            totalIncome,
            totalExpense,
            currentBalance,
            startBalance,
            netFlow,
            operationsCount: filteredTransactions.filter(t => {
                const date = t.date.toDate();
                return date.getFullYear() === selectedYear &&
                    (selectedMonth === 'all' || date.getMonth() === selectedMonth);
            }).length
        };
    }, [cashFlowData, filteredTransactions, selectedYear, selectedMonth]);

    if (loading) {
        return (
            <div className="p-10 flex justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
            </div>
        );
    }

    const today = format(new Date(), 'dd.MM');

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Движение денег</h1>
                    <p className="text-gray-500 text-sm">Приходы, расходы и остаток на счёте</p>
                </div>
                <div className="flex gap-2">
                    <select
                        className="bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    >
                        <option value="all">Весь год</option>
                        {['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>
                    <select
                        className="bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <select
                        className="bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                    >
                        <option value="all">Все проекты</option>
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

            {/* Main Chart Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Summary Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 border-b border-gray-100">
                    {/* Текущий остаток */}
                    <div className="p-5 border-r border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Wallet className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Остаток</span>
                        </div>
                        <div className={`text-2xl font-bold ${summary.currentBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatFullMoney(summary.currentBalance)}
                        </div>
                    </div>

                    {/* Приход */}
                    <div className="p-5 border-r border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Приход</span>
                        </div>
                        <div className="text-2xl font-bold text-emerald-600">
                            +{formatFullMoney(summary.totalIncome)}
                        </div>
                    </div>

                    {/* Расход */}
                    <div className="p-5 border-r border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                <TrendingDown className="w-4 h-4 text-red-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Расход</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                            −{formatFullMoney(summary.totalExpense)}
                        </div>
                    </div>

                    {/* Сальдо */}
                    <div className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Calendar className="w-4 h-4 text-purple-600" />
                            </div>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Сальдо периода</span>
                        </div>
                        <div className={`text-2xl font-bold ${summary.netFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {summary.netFlow >= 0 ? '+' : ''}{formatFullMoney(summary.netFlow)}
                        </div>
                    </div>
                </div>

                {/* Chart */}
                <div className="p-6">
                    <div className="h-[500px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={cashFlowData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <defs>
                                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.8} />
                                    </linearGradient>
                                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#F43F5E" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#F43F5E" stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />

                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11, fill: '#6B7280' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#E5E7EB' }}
                                />

                                <YAxis
                                    tick={{ fontSize: 11, fill: '#6B7280' }}
                                    tickFormatter={formatMoneyCompact}
                                    tickLine={false}
                                    axisLine={false}
                                    width={80}
                                />

                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
                                        padding: '12px 16px'
                                    }}
                                    formatter={(value: any, name: any) => {
                                        const labels: Record<string, string> = {
                                            income: 'Приход',
                                            expense: 'Расход',
                                            balance: 'Остаток'
                                        };
                                        const val = Number(value) || 0;
                                        return [formatFullMoney(val), labels[name] || name];
                                    }}
                                    labelStyle={{ fontWeight: 'bold', marginBottom: '8px' }}
                                />

                                <Legend
                                    formatter={(value) => {
                                        const labels: Record<string, string> = {
                                            income: 'Приход',
                                            expense: 'Расход',
                                            balance: 'Остаток'
                                        };
                                        return <span className="text-sm text-gray-600">{labels[value] || value}</span>;
                                    }}
                                    iconType="circle"
                                    wrapperStyle={{ paddingTop: '20px' }}
                                />

                                {/* Линия "Сегодня" */}
                                <ReferenceLine
                                    x={today}
                                    stroke="#6366F1"
                                    strokeDasharray="5 5"
                                    strokeWidth={2}
                                    label={{
                                        value: 'Сегодня',
                                        position: 'top',
                                        fill: '#6366F1',
                                        fontSize: 12,
                                        fontWeight: 'bold'
                                    }}
                                />

                                {/* Нулевая линия */}
                                <ReferenceLine y={0} stroke="#E5E7EB" strokeWidth={2} />

                                {/* Area под линией баланса */}
                                <Area
                                    type="monotone"
                                    dataKey="balance"
                                    fill="url(#balanceGradient)"
                                    stroke="none"
                                />

                                {/* Приходы - зелёные бары */}
                                <Bar
                                    dataKey="income"
                                    name="income"
                                    fill="url(#incomeGradient)"
                                    barSize={selectedMonth === 'all' ? 16 : 24}
                                    radius={[4, 4, 0, 0]}
                                />

                                {/* Расходы - красные бары (отрицательные для наглядности) */}
                                <Bar
                                    dataKey="expense"
                                    name="expense"
                                    fill="url(#expenseGradient)"
                                    barSize={selectedMonth === 'all' ? 16 : 24}
                                    radius={[4, 4, 0, 0]}
                                />

                                {/* Линия остатка */}
                                <Line
                                    type="monotone"
                                    dataKey="balance"
                                    name="balance"
                                    stroke="#3B82F6"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-sm text-gray-500">
                        Всего операций: <strong>{summary.operationsCount}</strong>
                    </span>
                    <span className="text-xs text-gray-400">
                        Данные из банковской выписки
                    </span>
                </div>
            </div>
        </div>
    );
}
