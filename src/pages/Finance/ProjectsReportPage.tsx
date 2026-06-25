// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    differenceInDays,
    max as maxDate,
    min as minDate,
} from 'date-fns';
import { financeService } from '../../services/finance.service';
import { costItemsService } from '../../services/costItems.service';
import { projectsService } from '../../services/projects.service';
import { payrollService } from '../../services/payroll.service';
import { Transaction, getPaymentDate } from '../../models/finance';
import { CostItem } from '../../models/costItems';
import { PayrollRecord } from '../../models/payroll';
import { Project } from '../../models';
import { useCategories } from '../../hooks/useCategories';
import { useToast } from '../../components/ui/Toast';
import { Download, FileSpreadsheet } from 'lucide-react';
import { quickExport } from '../../utils/excelExport';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { formatMoney } from '../../utils/formatters';

// ============================================
// TYPES
// ============================================

type OpiuSection = 'revenue' | 'cogs' | 'opex' | 'ignore';

interface ProjectRow {
    projectId: string;
    projectName: string;
    income: number;
    expense: number;
    profit: number;
    profitPercent: number;
    ratio: number; // income/expense %
    rowType: 'project' | 'parent' | 'total';
    isChild?: boolean;
    breadcrumb?: string;
    rootId?: string;
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

export function ProjectsReportPage() {
    const navigate = useNavigate();
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState<'profit' | 'income' | 'expense' | 'profitPercent'>('profit');
    const { categories } = useCategories();
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, [currentYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const startDate = new Date(currentYear - 1, 0, 1);
            const endDate = new Date(currentYear + 1, 11, 31);

            const monthKeys: string[] = [];
            for (let m = 0; m < 12; m++) {
                monthKeys.push(`${currentYear}-${String(m + 1).padStart(2, '0')}`);
            }

            const [prjs, txs, items, payroll] = await Promise.all([
                projectsService.getAll(),
                financeService.getTransactions({ startDate, endDate }),
                costItemsService.getAll(),
                payrollService.getByMonths(monthKeys),
            ]);

            setProjects(prjs);
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
        const map = new Map<string, { name: string; opiuCategory: OpiuSection; isSystem: boolean }>();
        for (const cat of categories) {
            const entry = { name: cat.name, opiuCategory: normalizeOpiuCategory(cat.opiuCategory), isSystem: cat.isSystem };
            map.set(cat.id, entry);
            if (cat.legacyItemId) map.set(cat.legacyItemId, entry);
        }
        for (const item of costItems) {
            if (!map.has(item.itemId)) {
                map.set(item.itemId, { name: item.itemName, opiuCategory: normalizeOpiuCategory(item.opiuCategory), isSystem: false });
            }
        }
        return map;
    }, [categories, costItems]);

    const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    const getProjectBreadcrumb = useMemo(() => (projectId: string): { breadcrumb: string; rootId: string } => {
        const path: string[] = [];
        let current = projectsById.get(projectId);
        const visited = new Set<string>();
        while (current?.parentId && !visited.has(current.id)) {
            visited.add(current.id);
            const parent = projectsById.get(current.parentId);
            if (parent) path.unshift(parent.name);
            current = parent;
        }
        return { breadcrumb: path.join(' › '), rootId: current?.id || projectId };
    }, [projectsById]);

    /**
     * Get proportional amount of a transaction for the current year
     */
    const getYearAmount = (t: Transaction): number => {
        const accrualFrom = t.accrualDateFrom ? t.accrualDateFrom.toDate() : getPaymentDate(t).toDate();
        const accrualTo = t.accrualDateTo ? t.accrualDateTo.toDate() : accrualFrom;
        const periodDays = differenceInDays(accrualTo, accrualFrom) + 1;
        if (periodDays <= 0) return 0;

        const yearStart = new Date(currentYear, 0, 1);
        const yearEnd = new Date(currentYear, 11, 31);
        const overlapStart = maxDate([accrualFrom, yearStart]);
        const overlapEnd = minDate([accrualTo, yearEnd]);
        if (overlapStart > overlapEnd) return 0;

        const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
        return periodDays <= 1 || periodDays === overlapDays ? t.amount : (t.amount / periodDays) * overlapDays;
    };

    const reportData = useMemo<ProjectRow[]>(() => {
        const data: Record<string, { income: number; expense: number }> = {};

        for (const t of transactions) {
            if (t.type === 'transfer') continue;
            if (t.status !== 'fact') continue;

            const cat = categoryLookup.get(t.categoryId);
            const opiuCat = cat?.opiuCategory || 'ignore';
            if (opiuCat === 'ignore' || cat?.isSystem) continue;

            const pId = t.projectId || 'no_project';
            const amount = getYearAmount(t);
            if (amount <= 0) continue;

            if (!data[pId]) data[pId] = { income: 0, expense: 0 };
            if (t.type === 'income' && opiuCat === 'revenue') data[pId].income += amount;
            else if (t.type === 'expense') data[pId].expense += amount;
        }

        // Payroll expenses
        for (const pr of payrollRecords) {
            if (pr.totalDue <= 0) continue;
            const pId = pr.projectId || 'no_project';
            if (!data[pId]) data[pId] = { income: 0, expense: 0 };
            data[pId].expense += pr.totalDue;
        }

        // Build rows
        const rows: ProjectRow[] = [];
        const byRoot = new Map<string, ProjectRow[]>();

        for (const [pId, vals] of Object.entries(data)) {
            if (vals.income === 0 && vals.expense === 0) continue;
            const project = projectsById.get(pId);
            const { breadcrumb, rootId } = pId !== 'no_project'
                ? getProjectBreadcrumb(pId)
                : { breadcrumb: '', rootId: 'no_project' };

            const profit = vals.income - vals.expense;
            const profitPercent = vals.income > 0 ? (profit / vals.income) * 100 : 0;
            const ratio = vals.expense > 0 ? (vals.income / vals.expense) * 100 : 0;

            const row: ProjectRow = {
                projectId: pId,
                projectName: project?.name || (pId === 'no_project' ? 'Без проекта' : 'Неизвестный проект'),
                income: vals.income,
                expense: vals.expense,
                profit,
                profitPercent: parseFloat(profitPercent.toFixed(1)),
                ratio: parseFloat(ratio.toFixed(1)),
                rowType: 'project',
                breadcrumb,
                rootId,
            };

            if (!byRoot.has(rootId)) byRoot.set(rootId, []);
            byRoot.get(rootId)!.push(row);
        }

        // Sort groups by total profit
        const sortedGroups = Array.from(byRoot.entries()).sort((a, b) => {
            const sumA = a[1].reduce((s, r) => s + r[sortBy === 'profitPercent' ? 'profitPercent' : sortBy], 0);
            const sumB = b[1].reduce((s, r) => s + r[sortBy === 'profitPercent' ? 'profitPercent' : sortBy], 0);
            return sumB - sumA;
        });

        for (const [rootId, children] of sortedGroups) {
            if (children.length > 1) {
                const income = children.reduce((s, r) => s + r.income, 0);
                const expense = children.reduce((s, r) => s + r.expense, 0);
                const profit = income - expense;
                rows.push({
                    projectId: rootId,
                    projectName: projectsById.get(rootId)?.name || rootId,
                    income, expense, profit,
                    profitPercent: parseFloat((income > 0 ? (profit / income) * 100 : 0).toFixed(1)),
                    ratio: parseFloat((expense > 0 ? (income / expense) * 100 : 0).toFixed(1)),
                    rowType: 'parent',
                });
                for (const child of children.sort((a, b) => b[sortBy] - a[sortBy])) {
                    rows.push({ ...child, isChild: true });
                }
            } else {
                rows.push(children[0]);
            }
        }

        // Total row
        const totalIncome = rows.filter(r => r.rowType !== 'parent').reduce((s, r) => s + r.income, 0);
        const totalExpense = rows.filter(r => r.rowType !== 'parent').reduce((s, r) => s + r.expense, 0);
        const totalProfit = totalIncome - totalExpense;
        rows.push({
            projectId: 'total',
            projectName: 'ИТОГО',
            income: totalIncome,
            expense: totalExpense,
            profit: totalProfit,
            profitPercent: parseFloat((totalIncome > 0 ? (totalProfit / totalIncome) * 100 : 0).toFixed(1)),
            ratio: parseFloat((totalExpense > 0 ? (totalIncome / totalExpense) * 100 : 0).toFixed(1)),
            rowType: 'total',
        });

        return rows;
    }, [transactions, categoryLookup, projectsById, getProjectBreadcrumb, currentYear, payrollRecords, sortBy]);

    const getRowStyle = (row: ProjectRow): string => {
        switch (row.rowType) {
            case 'parent': return 'bg-slate-100 font-semibold border-t border-slate-200';
            case 'total': return 'bg-slate-800 text-white font-bold';
            default: return row.isChild ? 'hover:bg-gray-50 bg-white' : 'hover:bg-gray-50';
        }
    };

    const profitColor = (val: number, isTotal: boolean) => {
        if (isTotal) return val >= 0 ? 'text-emerald-300' : 'text-red-300';
        return val >= 15 ? 'text-emerald-600' : val >= 0 ? 'text-amber-600' : 'text-red-600';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Рентабельность проектов</h2>
                    <ReportInfoPopover
                        title="Формула рентабельности"
                        items={[
                            { label: 'Доходы', text: 'Транзакции с opiuCategory=revenue по accrualDate.' },
                            { label: 'Расходы', text: 'Транзакции с opiuCategory=cogs/opex + зарплата из ведомости.' },
                            { label: 'Рентабельность', text: '(Прибыль / Доходы) × 100%. Соотношение = (Доходы / Расходы) × 100%.' },
                        ]}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors no-print"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        PDF
                    </button>
                    <button
                        onClick={() => {
                            const headers = ['Проект', 'Доходы', 'Расходы', 'Прибыль', 'Рент. %', 'Соотн. %'];
                            const rows = reportData.map(r => [
                                (r.isChild ? '  ' : '') + r.projectName,
                                r.income,
                                r.expense,
                                r.profit,
                                r.profitPercent,
                                r.ratio,
                            ]);
                            quickExport(`Проекты_${currentYear}`, headers, rows, 'Проекты');
                        }}
                        className="flex items-center px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors no-print"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excel
                    </button>
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
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3 min-w-[240px]">Проект</th>
                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                                    onClick={() => setSortBy('income')}
                                >
                                    Доходы {sortBy === 'income' && '▼'}
                                </th>
                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                                    onClick={() => setSortBy('expense')}
                                >
                                    Расходы {sortBy === 'expense' && '▼'}
                                </th>
                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                                    onClick={() => setSortBy('profit')}
                                >
                                    Прибыль {sortBy === 'profit' && '▼'}
                                </th>
                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                                    onClick={() => setSortBy('profitPercent')}
                                >
                                    Рентаб. % {sortBy === 'profitPercent' && '▼'}
                                </th>
                                <th className="px-4 py-3 text-right">Соотн. %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reportData.map(row => {
                                const isTotalRow = row.rowType === 'total';
                                return (
                                    <tr key={row.projectId} className={getRowStyle(row)}>
                                        <td className={`px-4 py-3 font-medium ${isTotalRow ? 'text-white' : 'text-gray-900'}`}>
                                            {row.rowType === 'parent' ? (
                                                <span className="flex items-center gap-2">
                                                    <span className="text-slate-400 text-xs">▶</span>
                                                    <button
                                                        onClick={() => navigate(`/projects/${row.projectId}?tab=finance`)}
                                                        className="hover:underline hover:text-blue-600 transition-colors text-left"
                                                    >
                                                        {row.projectName}
                                                    </button>
                                                </span>
                                            ) : row.isChild ? (
                                                <span className="pl-5 flex items-start gap-1.5">
                                                    <span className="text-gray-300 text-xs mt-1">└</span>
                                                    <span className="flex flex-col min-w-0">
                                                        <button
                                                            onClick={() => navigate(`/projects/${row.projectId}?tab=finance`)}
                                                            className="hover:underline hover:text-blue-600 transition-colors text-left leading-tight"
                                                        >
                                                            {row.projectName}
                                                        </button>
                                                        {row.breadcrumb && (
                                                            <span className="text-xs text-gray-400 font-normal mt-0.5 truncate">{row.breadcrumb}</span>
                                                        )}
                                                    </span>
                                                </span>
                                            ) : (
                                                row.projectName
                                            )}
                                        </td>

                                        <td className={`px-4 py-3 text-right tabular-nums ${isTotalRow ? 'text-white' : 'text-gray-600'}`}>
                                            {row.income > 0 ? formatMoney(row.income) : '–'}
                                        </td>
                                        <td className={`px-4 py-3 text-right tabular-nums ${isTotalRow ? 'text-white' : 'text-gray-600'}`}>
                                            {row.expense > 0 ? formatMoney(row.expense) : '–'}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${
                                            isTotalRow
                                                ? (row.profit >= 0 ? 'text-emerald-300' : 'text-red-300')
                                                : (row.profit > 0 ? 'text-emerald-600' : row.profit < 0 ? 'text-red-600' : 'text-gray-400')
                                        }`}>
                                            {row.profit !== 0 ? formatMoney(row.profit) : '–'}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${profitColor(row.profitPercent, isTotalRow)}`}>
                                            {row.income > 0 || row.rowType === 'total' || row.rowType === 'parent'
                                                ? `${row.profitPercent}%`
                                                : '–'
                                            }
                                        </td>
                                        <td className={`px-4 py-3 text-right tabular-nums ${isTotalRow ? 'text-white' : 'text-gray-600'}`}>
                                            {row.expense > 0 ? `${row.ratio}%` : '–'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-6 flex-wrap">
                        <span><span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1"></span> Рентаб. &ge;15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1"></span> Рентаб. 0-15%</span>
                        <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1"></span> Убыток</span>
                        <span className="ml-auto text-gray-400">Клик на проект → карточка проекта</span>
                    </div>
                </div>
            )}
        </div>
    );
}
