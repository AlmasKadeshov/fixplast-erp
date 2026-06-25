import { useState, useEffect, useMemo } from 'react';
import { buildProjectSelectTree } from '../../utils/projectTree';
import { format, eachMonthOfInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { financeService } from '../../services/finance.service';
import { costItemsService } from '../../services/costItems.service';
import { projectsService } from '../../services/projects.service';
import { Transaction, getPaymentDate } from '../../models/finance';
import { CostItem } from '../../models/costItems';
import { Project } from '../../models';
import { useToast } from '../../components/ui/Toast';
import { Download, FileSpreadsheet } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { quickExport } from '../../utils/excelExport';
import { formatMoney } from '../../utils/formatters';

// Типы для отображаемых строк
interface DisplayRow {
    type: 'header' | 'item' | 'subtotal' | 'divider' | 'total';
    name: string;
    values?: Record<string, number>;
    rowTotal?: number;
}

export function CashflowPage() {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('all');
    const [includePlan, setIncludePlan] = useState(false);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    // Дерево проектов для группированного select
    const projectTree = useMemo(() => buildProjectSelectTree(projects, true), [projects]);

    useEffect(() => {
        loadData();
    }, [currentYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [items, prjs, txs] = await Promise.all([
                costItemsService.getAll(),
                projectsService.getAll(),
                financeService.getTransactions({
                    startDate: new Date(2020, 0, 1), // Fetch from beginning to capture opening balance
                    endDate: new Date(currentYear, 11, 31),
                })
            ]);
            setCostItems(items);
            setProjects(prjs);
            setTransactions(txs);
        } catch (error) {
            console.error('Error loading transactions:', error);
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    const months = useMemo(() => {
        return eachMonthOfInterval({
            start: new Date(currentYear, 0, 1),
            end: new Date(currentYear, 11, 1)
        });
    }, [currentYear]);

    const costItemsMap = useMemo(() => {
        return new Map(costItems.map(item => [item.itemId, item]));
    }, [costItems]);

    // Инициализация пустых значений для всех месяцев
    const initMonthValues = (): Record<string, number> => {
        const values: Record<string, number> = {};
        months.forEach(m => {
            values[format(m, 'yyyy-MM')] = 0;
        });
        return values;
    };

    // Calculate Balances
    const { openingBalance, monthlyNetFlows, cumulativeBalances } = useMemo(() => {
        let opStats = 0;
        const netFlows = initMonthValues();
        const cumBalances = initMonthValues();

        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        // ДДС: только банковские операции (sourceType === 'bank' или старые данные без поля)
        const relevantTransactions = transactions.filter(t =>
            (t.sourceType === 'bank' || !t.sourceType) &&
            (t.status === 'fact' || (includePlan && t.status === 'plan')) &&
            (selectedProject === 'all' || t.projectId === selectedProject)
        );

        // Вспомогательная функция: найти costItem по categoryId (с двойным поиском)
        const findCostItem = (categoryId: string) => {
            let item = costItemsMap.get(categoryId);
            if (!item) {
                for (const [, ci] of costItemsMap) {
                    if (ci.itemId === categoryId) { item = ci; break; }
                }
            }
            return item;
        };

        // 1. Calculate Opening Balance (Everything before this year)
        relevantTransactions.forEach(t => {
            const tDate = getPaymentDate(t).toDate();

            // Check category for IGNORE (both old ddsCategory strings and new enum)
            if (t.categoryId) {
                const item = findCostItem(t.categoryId);
                if (item?.ddsCategory === 'IGNORE' || item?.ddsCategory === 'ignore') return;
            }

            // Determine amount sign based on transaction type (canonical field)
            let amount = Math.abs(t.amount);
            if (t.type !== 'income') {
                amount = -amount;
            }

            if (tDate < startOfYear) {
                opStats += amount;
            } else if (tDate <= endOfYear) {
                const k = format(tDate, 'yyyy-MM');
                if (netFlows[k] !== undefined) {
                    netFlows[k] += amount;
                }
            }
        });

        // 2. Calculate Cumulative Balances
        let running = opStats;
        months.forEach(m => {
            const k = format(m, 'yyyy-MM');
            running += netFlows[k];
            cumBalances[k] = running;
        });

        return { openingBalance: opStats, monthlyNetFlows: netFlows, cumulativeBalances: cumBalances };
    }, [transactions, currentYear, selectedProject, costItemsMap, months, includePlan]);

    // Группировка данных по статьям внутри каждой ddsCategory (Only Current Year for Tbody)
    interface ItemData {
        name: string;
        values: Record<string, number>;
        ddsCategory: string;
    }

    const itemsData = useMemo(() => {
        const data: Record<string, ItemData> = {};

        // ДДС: только банковские операции
        const bankTransactions = transactions.filter(t =>
            (t.sourceType === 'bank' || !t.sourceType) &&
            (t.status === 'fact' || (includePlan && t.status === 'plan')) &&
            (selectedProject === 'all' || t.projectId === selectedProject)
        );

        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        bankTransactions.forEach(t => {
            const tDate = getPaymentDate(t).toDate();
            // Only current year for the body rows
            if (tDate < startOfYear || tDate > endOfYear) return;

            const key = format(tDate, 'yyyy-MM');

            // Определяем статью и ddsCategory
            let itemName = t.categoryId || 'Прочие операции';
            let ddsCategory = 'Прочее';

            if (t.categoryId) {
                // Ищем сначала по ключу map (itemId), затем перебором по полю itemId
                let costItem = costItemsMap.get(t.categoryId);
                if (!costItem) {
                    for (const [, item] of costItemsMap) {
                        if (item.itemId === t.categoryId) { costItem = item; break; }
                    }
                }

                if (costItem) {
                    if (costItem.ddsCategory === 'IGNORE' || costItem.ddsCategory === 'ignore') return;
                    itemName = costItem.itemName;
                    ddsCategory = costItem.ddsCategory || 'Прочее';
                }
            }

            // Определяем знак суммы по типу транзакции
            const amount = t.type === 'income' ? Math.abs(t.amount) : -Math.abs(t.amount);

            const itemKey = `${ddsCategory}::${itemName}`;

            if (!data[itemKey]) {
                data[itemKey] = {
                    name: itemName,
                    values: initMonthValues(),
                    ddsCategory: ddsCategory
                };
            }

            data[itemKey].values[key] = (data[itemKey].values[key] || 0) + amount;
        });

        return data;
    }, [transactions, months, costItemsMap, currentYear, selectedProject, includePlan]);

    // Группировка по типам потока
    const flowTypeGroups = useMemo(() => {
        const groups: Record<string, ItemData[]> = {
            '1. Операционная': [],
            '2. Инвестиционная': [],
            '3. Финансовая': [],
            'Прочее': []
        };

        Object.values(itemsData).forEach(item => {
            if (item.ddsCategory.startsWith('1.')) {
                groups['1. Операционная'].push(item);
            } else if (item.ddsCategory.startsWith('2.')) {
                groups['2. Инвестиционная'].push(item);
            } else if (item.ddsCategory.startsWith('3.')) {
                groups['3. Финансовая'].push(item);
            } else {
                groups['Прочее'].push(item);
            }
        });

        return groups;
    }, [itemsData]);

    // Расчёт субитогов для каждого типа
    const subtotals = useMemo(() => {
        const result: Record<string, Record<string, number>> = {};

        Object.entries(flowTypeGroups).forEach(([type, items]) => {
            if (items.length === 0) return;

            const subtotal = initMonthValues();
            items.forEach(item => {
                Object.keys(subtotal).forEach(month => {
                    subtotal[month] += item.values[month] || 0;
                });
            });
            result[type] = subtotal;
        });

        return result;
    }, [flowTypeGroups, months]);

    // Общий итог (Сальдо - это Net Flow now)
    const netFlowTotal = useMemo(() => {
        const totals = initMonthValues();
        Object.values(subtotals).forEach(subtotal => {
            Object.keys(totals).forEach(month => {
                totals[month] += subtotal[month] || 0;
            });
        });
        return totals;
    }, [subtotals, months]);

    // Формирование массива строк для отображения
    const displayRows = useMemo((): DisplayRow[] => {
        const rows: DisplayRow[] = [];

        // 1. OPENING BALANCE ROW
        const openingBalanceValues = initMonthValues();
        // Opening balance is constant for the whole year? 
        // No, Opening Balance for Feb is Closing Balance of Jan.
        // But usually "Opening Balance" row shows the balance at start of that month.
        let runningOp = openingBalance;
        months.forEach((m) => {
            const k = format(m, 'yyyy-MM');
            openingBalanceValues[k] = runningOp;
            // Prepare for next month
            runningOp += monthlyNetFlows[k];
        });

        rows.push({
            type: 'total',
            name: 'ОСТАТОК ДЕНЕГ (На начало)', // Opening Balance
            values: openingBalanceValues,
            rowTotal: openingBalance // Total column for Opening Balance usually shows the Year Start Balance, not sum
        });

        rows.push({ type: 'divider', name: '' });


        const flowTypes = [
            { key: '1. Операционная', label: '1. ОПЕРАЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', subtotalLabel: 'Итого операционная' },
            { key: '2. Инвестиционная', label: '2. ИНВЕСТИЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', subtotalLabel: 'Итого инвестиционная' },
            { key: '3. Финансовая', label: '3. ФИНАНСОВАЯ ДЕЯТЕЛЬНОСТЬ', subtotalLabel: 'Итого финансовая' },
            { key: 'Прочее', label: '4. ПРОЧЕЕ', subtotalLabel: 'Итого прочее' },
        ];

        flowTypes.forEach(({ key, label, subtotalLabel }) => {
            const items = flowTypeGroups[key];
            if (!items || items.length === 0) return;

            // Заголовок секции
            rows.push({ type: 'header', name: label });

            // Статьи секции
            const sortedItems = [...items].sort((a, b) => {
                const totalA = Object.values(a.values).reduce((s, v) => s + v, 0);
                const totalB = Object.values(b.values).reduce((s, v) => s + v, 0);
                return totalB - totalA;
            });

            sortedItems.forEach(item => {
                const rowTotal = Object.values(item.values).reduce((s, v) => s + v, 0);
                rows.push({
                    type: 'item',
                    name: item.name,
                    values: item.values,
                    rowTotal
                });
            });

            // Субитог секции
            const subtotalValues = subtotals[key];
            if (subtotalValues) {
                const subtotalRowTotal = Object.values(subtotalValues).reduce((s, v) => s + v, 0);
                rows.push({
                    type: 'subtotal',
                    name: subtotalLabel,
                    values: subtotalValues,
                    rowTotal: subtotalRowTotal
                });
            }

            // Разделитель
            rows.push({ type: 'divider', name: '' });
        });

        // NET FLOW (Чистый денежный поток)
        const netFlowSum = Object.values(netFlowTotal).reduce((s, v) => s + v, 0);
        rows.push({
            type: 'subtotal', // Use subtotal style for Net Flow
            name: 'ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК',
            values: netFlowTotal,
            rowTotal: netFlowSum
        });

        // CLOSING BALANCE
        rows.push({
            type: 'total', // Use total style for Final Balance
            name: 'ОСТАТОК ДЕНЕГ (На конец)',
            values: cumulativeBalances,
            rowTotal: cumulativeBalances[format(months[months.length - 1], 'yyyy-MM')] // Show last month's balance as year end balance
        });

        return rows;
    }, [flowTypeGroups, subtotals, netFlowTotal, cumulativeBalances, openingBalance, months, monthlyNetFlows]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Движение денежных средств (ДДС)</h2>
                    <ReportInfoPopover
                        title="Как проверить ДДС"
                        items={[
                            { label: 'Что показывает', text: 'Приход и расход денег по банковским выпискам, сгруппированный по статьям и месяцам.' },
                            { label: 'Источник данных', text: 'ВСЕ фактические операции (банк, 1С, ручной ввод). Переводы между счетами исключены.' },
                            { label: 'Как проверить', text: 'Сравните «Остаток на конец» за каждый месяц с сальдо в банковской выписке. Если не совпадает — проверьте полноту импорта выписок.' },
                        ]}
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors print-show no-print"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        PDF
                    </button>
                    <button
                        onClick={() => {
                            const headers = ['Статья', ...months.map(m => format(m, 'LLL', { locale: ru })), 'Итого'];
                            const rows = displayRows
                                .filter(r => r.type !== 'divider')
                                .map(r => [
                                    r.name,
                                    ...months.map(m => r.values?.[format(m, 'yyyy-MM')] ?? ''),
                                    r.rowTotal ?? '',
                                ]);
                            quickExport(`ДДС_${currentYear}`, headers, rows, 'ДДС');
                        }}
                        className="flex items-center px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors no-print"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excel
                    </button>

                    <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 max-w-xs"
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

                    <select
                        value={currentYear}
                        onChange={(e) => setCurrentYear(Number(e.target.value))}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm">
                        <input
                            type="checkbox"
                            checked={includePlan}
                            onChange={(e) => setIncludePlan(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700 whitespace-nowrap">+ Плановые</span>
                    </label>
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
                    Загрузка...
                </div>
            ) : transactions.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
                    Нет данных за {currentYear} год. Загрузите выписку на вкладке «Импорт».
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[250px]">Статья</th>
                                {months.map(m => (
                                    <th key={m.toString()} className="px-4 py-3 text-right w-24">
                                        {format(m, 'LLL', { locale: ru })}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right bg-gray-100 font-bold min-w-[100px]">Итого</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayRows.map((row, idx) => {
                                // Заголовок секции
                                if (row.type === 'header') {
                                    return (
                                        <tr key={idx} className="bg-slate-200">
                                            <td
                                                colSpan={months.length + 2}
                                                className="px-4 py-2 font-bold text-slate-700 uppercase tracking-wide sticky left-0 bg-slate-200"
                                            >
                                                {row.name}
                                            </td>
                                        </tr>
                                    );
                                }

                                // Разделитель
                                if (row.type === 'divider') {
                                    return (
                                        <tr key={idx}>
                                            <td colSpan={months.length + 2} className="h-3 bg-gray-50"></td>
                                        </tr>
                                    );
                                }

                                // Субитог
                                if (row.type === 'subtotal') {
                                    return (
                                        <tr key={idx} className="bg-slate-100 font-semibold border-t border-slate-300">
                                            <td className="px-4 py-2 text-slate-700 sticky left-0 bg-slate-100">
                                                {row.name}
                                            </td>
                                            {months.map(m => {
                                                const val = row.values?.[format(m, 'yyyy-MM')] || 0;
                                                return (
                                                    <td
                                                        key={m.toString()}
                                                        className={`px-4 py-2 text-right ${val < 0 ? 'text-red-600' : val > 0 ? 'text-emerald-600' : 'text-gray-400'}`}
                                                    >
                                                        {val !== 0 ? formatMoney(val) : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className={`px-4 py-2 text-right font-bold ${(row.rowTotal || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatMoney(row.rowTotal || 0)}
                                            </td>
                                        </tr>
                                    );
                                }

                                // Итого (САЛЬДО)
                                if (row.type === 'total') {
                                    return (
                                        <tr key={idx} className="bg-slate-800 text-white font-bold">
                                            <td className="px-4 py-3 sticky left-0 bg-slate-800">
                                                {row.name}
                                            </td>
                                            {months.map(m => {
                                                const val = row.values?.[format(m, 'yyyy-MM')] || 0;
                                                return (
                                                    <td
                                                        key={m.toString()}
                                                        className={`px-4 py-3 text-right ${val < 0 ? 'text-red-300' : 'text-emerald-300'}`}
                                                    >
                                                        {formatMoney(val)}
                                                    </td>
                                                );
                                            })}
                                            <td className={`px-4 py-3 text-right ${(row.rowTotal || 0) < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                                {formatMoney(row.rowTotal || 0)}
                                            </td>
                                        </tr>
                                    );
                                }

                                // Обычная статья
                                return (
                                    <tr key={idx} className="hover:bg-gray-50 border-b border-gray-100">
                                        <td className="px-4 py-2 text-gray-700 sticky left-0 bg-white pl-8">
                                            {row.name}
                                        </td>
                                        {months.map(m => {
                                            const val = row.values?.[format(m, 'yyyy-MM')] || 0;
                                            return (
                                                <td
                                                    key={m.toString()}
                                                    className={`px-4 py-2 text-right ${val < 0 ? 'text-red-500' : val > 0 ? 'text-green-600' : 'text-gray-300'}`}
                                                >
                                                    {val !== 0 ? formatMoney(val) : '-'}
                                                </td>
                                            );
                                        })}
                                        <td className={`px-4 py-2 text-right font-medium bg-gray-50 ${(row.rowTotal || 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                            {formatMoney(row.rowTotal || 0)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

