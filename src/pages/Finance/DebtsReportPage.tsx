import { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/finance.service';
import { partnersService } from '../../services/partners.service';
import { projectsService } from '../../services/projects.service';
import { Transaction } from '../../models/finance';
import { Partner, Project } from '../../models';
import { useToast } from '../../components/ui/Toast';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { formatMoney } from '../../utils/formatters';
import { quickExport } from '../../utils/excelExport';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    Download,
    Search,
    ChevronRight,
    ChevronDown,
    X,
    FileSpreadsheet,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface DebtRow {
    partnerId: string;
    partnerName: string;
    partnerType: string;
    accrued: number;         // начислено по 1С
    paid: number;            // оплачено по банку
    debt: number;            // задолженность = accrued - paid
    lastDate?: Date;
    daysSinceLast: number;
    projects: DebtProjectRow[];
    transactions: Transaction[];
}

interface DebtProjectRow {
    projectId: string;
    projectName: string;
    accrued: number;
    paid: number;
    debt: number;
}

type Tab = 'dz' | 'kz';

// ============================================
// HELPERS
// ============================================

const DAY_MS = 24 * 60 * 60 * 1000;

const getDaysSince = (date?: Date): number => {
    if (!date) return 0;
    return Math.floor((Date.now() - date.getTime()) / DAY_MS);
};

const partnerTypeLabel = (type: string): string => {
    switch (type) {
        case 'CLIENT': return 'Заказчик';
        case 'SUPPLIER': return 'Поставщик';
        case 'SUBCONTRACTOR': return 'Субподрядчик';
        case 'BANK': return 'Банк';
        default: return type;
    }
};

// ============================================
// COMPONENT
// ============================================

export function DebtsReportPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('dz');
    const [search, setSearch] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const { showToast } = useToast();

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [txs, pts, prjs] = await Promise.all([
                financeService.getTransactions({ status: 'fact' }),
                partnersService.getAll(),
                projectsService.getAll(),
            ]);
            setTransactions(txs);
            setPartners(pts);
            setProjects(prjs);
        } catch {
            showToast('Ошибка загрузки данных', 'error');
        } finally {
            setLoading(false);
        }
    };

    const partnersMap = useMemo(() => new Map(partners.map(p => [p.id, p])), [partners]);
    const projectsMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ============================================
    // COMPUTE DEBTS
    // ============================================

    const { dzRows, kzRows, totalDZ, totalKZ } = useMemo(() => {
        // Build BIN→partnerId lookup so we can match bank txs by BIN when partnerId is empty
        const binToPartnerId = new Map<string, string>();
        for (const p of partners) {
            if (p.bin) binToPartnerId.set(p.bin, p.id);
        }

        // Resolve partner key: prefer partnerId, fallback to BIN lookup
        const resolvePartnerKey = (tx: Transaction): string => {
            if (tx.partnerId) return tx.partnerId;
            if (tx.partnerBin) return binToPartnerId.get(tx.partnerBin) || tx.partnerBin;
            return '';
        };

        // Simple logic (NO settlement type inversion):
        // ДЗ = 1C income (acts issued) − bank income (cash received) per partner
        // КЗ = 1C expense (acts received) − bank expense (cash paid) per partner
        const map = new Map<string, {
            partnerKey: string;
            partnerName: string;
            partnerType: string;
            income1c: number;      // начислено по актам (выручка)
            incomeBank: number;    // получено по банку
            expense1c: number;     // начислено по актам (себестоимость)
            expenseBank: number;   // оплачено по банку
            lastDate?: Date;
            transactions: Transaction[];
            projectData: Map<string, { projectName: string; income1c: number; incomeBank: number; expense1c: number; expenseBank: number }>;
        }>();

        for (const tx of transactions) {
            if (tx.type === 'transfer') continue;
            const key = resolvePartnerKey(tx);
            if (!key) continue;

            const partner = partnersMap.get(key);
            const partnerName = partner?.name || tx.partnerId || tx.partnerBin || 'Неизвестный';
            const partnerType = partner?.type || 'SUPPLIER';

            if (!map.has(key)) {
                map.set(key, {
                    partnerKey: key,
                    partnerName,
                    partnerType,
                    income1c: 0, incomeBank: 0,
                    expense1c: 0, expenseBank: 0,
                    transactions: [],
                    projectData: new Map(),
                });
            }

            const entry = map.get(key)!;
            const amount = Math.abs(tx.amount);

            // Direct type + sourceType classification (no inversion)
            if (tx.type === 'income') {
                if (tx.sourceType === '1c') entry.income1c += amount;
                else entry.incomeBank += amount;
            } else if (tx.type === 'expense') {
                if (tx.sourceType === '1c') entry.expense1c += amount;
                else entry.expenseBank += amount;
            }

            entry.transactions.push(tx);
            const txDate = tx.date.toDate();
            if (!entry.lastDate || txDate > entry.lastDate) entry.lastDate = txDate;

            // Project breakdown
            const projId = tx.projectId || '__no_project';
            if (!entry.projectData.has(projId)) {
                const proj = projectsMap.get(projId);
                entry.projectData.set(projId, {
                    projectName: proj?.name || 'Без проекта',
                    income1c: 0, incomeBank: 0,
                    expense1c: 0, expenseBank: 0,
                });
            }
            const pd = entry.projectData.get(projId)!;
            if (tx.type === 'income') {
                if (tx.sourceType === '1c') pd.income1c += amount;
                else pd.incomeBank += amount;
            } else if (tx.type === 'expense') {
                if (tx.sourceType === '1c') pd.expense1c += amount;
                else pd.expenseBank += amount;
            }
        }

        // Build ДЗ and КЗ rows
        const dzList: DebtRow[] = [];
        const kzList: DebtRow[] = [];

        for (const entry of map.values()) {
            // ДЗ (нам должны): начислили income по 1С больше чем получили по банку
            const dzDebt = entry.income1c - entry.incomeBank;
            if (dzDebt > 100) {
                const projectRows: DebtProjectRow[] = [];
                for (const [projId, pd] of entry.projectData) {
                    const pDebt = pd.income1c - pd.incomeBank;
                    if (Math.abs(pDebt) > 100) {
                        projectRows.push({
                            projectId: projId,
                            projectName: pd.projectName,
                            accrued: pd.income1c,
                            paid: pd.incomeBank,
                            debt: pDebt,
                        });
                    }
                }
                projectRows.sort((a, b) => b.debt - a.debt);
                dzList.push({
                    partnerId: entry.partnerKey,
                    partnerName: entry.partnerName,
                    partnerType: entry.partnerType,
                    accrued: entry.income1c,
                    paid: entry.incomeBank,
                    debt: dzDebt,
                    lastDate: entry.lastDate,
                    daysSinceLast: getDaysSince(entry.lastDate),
                    projects: projectRows,
                    transactions: entry.transactions,
                });
            }

            // КЗ (мы должны): начислили expense по 1С больше чем оплатили по банку
            const kzDebt = entry.expense1c - entry.expenseBank;
            if (kzDebt > 100) {
                const projectRows: DebtProjectRow[] = [];
                for (const [projId, pd] of entry.projectData) {
                    const pDebt = pd.expense1c - pd.expenseBank;
                    if (Math.abs(pDebt) > 100) {
                        projectRows.push({
                            projectId: projId,
                            projectName: pd.projectName,
                            accrued: pd.expense1c,
                            paid: pd.expenseBank,
                            debt: pDebt,
                        });
                    }
                }
                projectRows.sort((a, b) => b.debt - a.debt);
                kzList.push({
                    partnerId: entry.partnerKey,
                    partnerName: entry.partnerName,
                    partnerType: entry.partnerType,
                    accrued: entry.expense1c,
                    paid: entry.expenseBank,
                    debt: kzDebt,
                    lastDate: entry.lastDate,
                    daysSinceLast: getDaysSince(entry.lastDate),
                    projects: projectRows,
                    transactions: entry.transactions,
                });
            }
        }

        dzList.sort((a, b) => b.debt - a.debt);
        kzList.sort((a, b) => b.debt - a.debt);

        return {
            dzRows: dzList,
            kzRows: kzList,
            totalDZ: dzList.reduce((s, r) => s + r.debt, 0),
            totalKZ: kzList.reduce((s, r) => s + r.debt, 0),
        };
    }, [transactions, partners, partnersMap, projectsMap]);

    // Active data based on tab
    const activeRows = activeTab === 'dz' ? dzRows : kzRows;
    const filteredRows = search
        ? activeRows.filter(r => r.partnerName.toLowerCase().includes(search.toLowerCase()))
        : activeRows;

    // ============================================
    // EXPORT
    // ============================================

    const handleExport = () => {
        const label = activeTab === 'dz' ? 'Дебиторка' : 'Кредиторка';
        const headers = ['Контрагент', 'Тип', 'Начислено (1С)', 'Оплачено (банк)', 'Задолженность', 'Дней'];
        const rows: (string | number)[][] = [];

        for (const row of filteredRows) {
            rows.push([
                row.partnerName,
                partnerTypeLabel(row.partnerType),
                Math.round(row.accrued),
                Math.round(row.paid),
                Math.round(row.debt),
                row.daysSinceLast,
            ]);
            for (const p of row.projects) {
                rows.push([
                    `  → ${p.projectName}`,
                    '',
                    Math.round(p.accrued),
                    Math.round(p.paid),
                    Math.round(p.debt),
                    '',
                ]);
            }
        }

        const total = filteredRows.reduce((s, r) => s + r.debt, 0);
        rows.push(['ИТОГО', '', '', '', Math.round(total), '']);

        quickExport(`${label}_${new Date().toISOString().slice(0, 10)}`, headers, rows, label);
        showToast('Экспорт завершён', 'success');
    };

    // ============================================
    // DRILLDOWN — transaction list for a partner
    // ============================================

    const [drilldownPartner, setDrilldownPartner] = useState<DebtRow | null>(null);

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Дебиторка / Кредиторка</h2>
                    <ReportInfoPopover
                        title="Как читать отчёт"
                        items={[
                            { label: 'Дебиторка (ДЗ)', text: 'Нам должны. Начислено по актам (1С) минус оплачено по банку.' },
                            { label: 'Кредиторка (КЗ)', text: 'Мы должны. Принято актов от подрядчиков (1С) минус оплачено по банку.' },
                            { label: 'Источники', text: '1С = акты/ЭСФ (начисление), Банк = выписка (оплата).' },
                        ]}
                    />
                </div>
                <button
                    onClick={handleExport}
                    disabled={filteredRows.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                    <Download className="w-4 h-4" />
                    Excel
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowDownToLine className="w-4 h-4 text-teal-500" />
                        <span className="text-sm font-medium text-gray-500">Дебиторка (нам должны)</span>
                    </div>
                    <div className="text-2xl font-bold text-teal-600 tabular-nums">
                        {formatMoney(totalDZ)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{dzRows.length} контрагентов</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowUpFromLine className="w-4 h-4 text-rose-500" />
                        <span className="text-sm font-medium text-gray-500">Кредиторка (мы должны)</span>
                    </div>
                    <div className="text-2xl font-bold text-rose-600 tabular-nums">
                        {formatMoney(totalKZ)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{kzRows.length} контрагентов</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-medium text-gray-500">Чистая позиция</span>
                    </div>
                    <div className={`text-2xl font-bold tabular-nums ${totalDZ - totalKZ >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                        {totalDZ - totalKZ >= 0 ? '+' : ''}{formatMoney(totalDZ - totalKZ)} ₸
                    </div>
                    <div className="text-xs text-gray-400 mt-1">ДЗ − КЗ</div>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => { setActiveTab('dz'); setExpandedRows(new Set()); }}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            activeTab === 'dz' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Дебиторка ({dzRows.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('kz'); setExpandedRows(new Set()); }}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            activeTab === 'kz' ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Кредиторка ({kzRows.length})
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Поиск контрагента..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg w-64 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="p-12 text-center text-gray-500">Загрузка...</div>
            ) : filteredRows.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                    {search ? 'Ничего не найдено' : 'Нет задолженностей'}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-4 py-3 font-medium text-gray-500 w-8"></th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Контрагент</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Тип</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Начислено (1С)</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Оплачено (банк)</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Задолженность</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Дней</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRows.map(row => {
                                const isExpanded = expandedRows.has(row.partnerId);
                                const hasProjects = row.projects.length > 1;
                                return (
                                    <PartnerRow
                                        key={row.partnerId}
                                        row={row}
                                        isExpanded={isExpanded}
                                        hasProjects={hasProjects}
                                        onToggle={() => toggleRow(row.partnerId)}
                                        onDrilldown={() => setDrilldownPartner(row)}
                                        tab={activeTab}
                                    />
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className={`font-bold border-t-2 ${activeTab === 'dz' ? 'border-teal-200 bg-teal-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
                                <td className="px-4 py-3" />
                                <td className="px-4 py-3 text-gray-900">ИТОГО</td>
                                <td className="px-4 py-3" />
                                <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                    {formatMoney(filteredRows.reduce((s, r) => s + r.accrued, 0))} ₸
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                    {formatMoney(filteredRows.reduce((s, r) => s + r.paid, 0))} ₸
                                </td>
                                <td className={`px-4 py-3 text-right tabular-nums ${activeTab === 'dz' ? 'text-teal-700' : 'text-rose-700'}`}>
                                    {formatMoney(filteredRows.reduce((s, r) => s + r.debt, 0))} ₸
                                </td>
                                <td className="px-4 py-3" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* Drilldown modal */}
            {drilldownPartner && (
                <DrilldownModal
                    row={drilldownPartner}
                    tab={activeTab}
                    onClose={() => setDrilldownPartner(null)}
                />
            )}
        </div>
    );
}

// ============================================
// PARTNER ROW (expandable)
// ============================================

function PartnerRow({
    row,
    isExpanded,
    hasProjects,
    onToggle,
    onDrilldown,
    tab,
}: {
    row: DebtRow;
    isExpanded: boolean;
    hasProjects: boolean;
    onToggle: () => void;
    onDrilldown: () => void;
    tab: Tab;
}) {
    const debtColor = tab === 'dz' ? 'text-teal-700' : 'text-rose-700';

    return (
        <>
            <tr
                className="hover:bg-gray-50 cursor-pointer group"
                onClick={hasProjects ? onToggle : onDrilldown}
            >
                <td className="px-4 py-2.5 text-gray-400">
                    {hasProjects ? (
                        isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                    ) : null}
                </td>
                <td className="px-4 py-2.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDrilldown(); }}
                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                    >
                        {row.partnerName}
                    </button>
                </td>
                <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {partnerTypeLabel(row.partnerType)}
                    </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {formatMoney(row.accrued)} ₸
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {formatMoney(row.paid)} ₸
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${debtColor}`}>
                    {formatMoney(row.debt)} ₸
                </td>
                <td className="px-4 py-2.5 text-right">
                    <span className={`text-xs tabular-nums ${row.daysSinceLast > 30 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {row.daysSinceLast > 0 ? row.daysSinceLast : '—'}
                    </span>
                </td>
            </tr>
            {isExpanded && row.projects.map(p => (
                <tr key={p.projectId} className="bg-gray-50/70">
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 pl-10 text-gray-500 text-xs">
                        {p.projectName}
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400 text-xs">
                        {formatMoney(p.accrued)} ₸
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400 text-xs">
                        {formatMoney(p.paid)} ₸
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium ${p.debt > 0 ? debtColor : 'text-gray-400'}`}>
                        {formatMoney(p.debt)} ₸
                    </td>
                    <td className="px-4 py-2" />
                </tr>
            ))}
        </>
    );
}

// ============================================
// DRILLDOWN MODAL — transaction list
// ============================================

function DrilldownModal({
    row,
    tab,
    onClose,
}: {
    row: DebtRow;
    tab: Tab;
    onClose: () => void;
}) {
    // Show transactions relevant to this debt direction
    const relevantTxs = useMemo(() => {
        return row.transactions
            .filter(tx => {
                if (tx.type === 'transfer') return false;
                // ДЗ = income transactions (1C acts + bank payments from clients)
                // КЗ = expense transactions (1C acts + bank payments to suppliers)
                return tab === 'dz' ? tx.type === 'income' : tx.type === 'expense';
            })
            .sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime());
    }, [row, tab]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{row.partnerName}</h3>
                        <p className="text-sm text-gray-500">
                            {tab === 'dz' ? 'Дебиторка' : 'Кредиторка'}: <span className="font-semibold">{formatMoney(row.debt)} ₸</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div>
                        <span className="text-xs text-gray-500">Начислено (1С)</span>
                        <div className="text-lg font-bold text-gray-900 tabular-nums">{formatMoney(row.accrued)} ₸</div>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500">Оплачено (банк)</span>
                        <div className="text-lg font-bold text-gray-900 tabular-nums">{formatMoney(row.paid)} ₸</div>
                    </div>
                </div>

                {/* Transaction list */}
                <div className="flex-1 overflow-auto px-6 py-3">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                            <tr className="text-xs text-gray-500 border-b">
                                <th className="text-left py-2 font-medium">Дата</th>
                                <th className="text-left py-2 font-medium">Источник</th>
                                <th className="text-left py-2 font-medium">Описание</th>
                                <th className="text-right py-2 font-medium">Сумма</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {relevantTxs.map(tx => (
                                <tr key={tx.id} className="hover:bg-gray-50">
                                    <td className="py-2 text-gray-600 tabular-nums whitespace-nowrap">
                                        {tx.date.toDate().toLocaleDateString('ru-RU')}
                                    </td>
                                    <td className="py-2">
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                            tx.sourceType === '1c'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {tx.sourceType === '1c' ? '1С' : 'Банк'}
                                        </span>
                                    </td>
                                    <td className="py-2 text-gray-600 truncate max-w-[200px]">
                                        {tx.description || tx.sourceDoc || '—'}
                                    </td>
                                    <td className={`py-2 text-right tabular-nums font-medium ${
                                        tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                                    }`}>
                                        {tx.type === 'income' ? '+' : '−'}{formatMoney(tx.amount)} ₸
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {relevantTxs.length === 0 && (
                        <div className="text-center text-gray-400 py-8">Нет транзакций</div>
                    )}
                </div>
            </div>
        </div>
    );
}
