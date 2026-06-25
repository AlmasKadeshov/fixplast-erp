import { useState, useEffect, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAccountBalances } from '../../hooks/useAccountBalances';
import { balanceEntriesService } from '../../services/balanceEntries.service';
import { partnersService } from '../../services/partners.service';
import { financeService } from '../../services/finance.service';
import {
    BalanceManualEntry,
    BalanceSection,
    BALANCE_SECTION_NAMES,
} from '../../models/balanceEntry';
import { Transaction } from '../../models/finance';
import { Partner } from '../../models';
import { useToast } from '../../components/ui/Toast';
import { Edit2, Save, X, Check, AlertCircle } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { formatMoney } from '../../utils/formatters';

// ============================================
// TYPES
// ============================================

interface BalanceLine {
    label: string;
    amount: number;
    editable: boolean;
    section?: BalanceSection;
    entryId?: string;
    sublabel?: string;
}

// ============================================
// HELPERS
// ============================================

// System category legacy IDs used for investment calculation
const INVESTMENT_CATEGORY_IDS = ['INVESTMENT'];
const LOAN_GRANTED_IDS = ['LOAN_GRANTED'];
const LOAN_RECEIVED_IDS = ['LOAN_RECEIVED'];
const LOAN_REPAYMENT_IDS = ['LOAN_REPAYMENT'];
const LOAN_RETURN_IDS = ['LOAN_RETURN'];

// ============================================
// COMPONENT
// ============================================

export function BalancePage() {
    const { loading: balancesLoading } = useAccountBalances();
    const [manualEntries, setManualEntries] = useState<BalanceManualEntry[]>([]);
    const [factTransactions, setFactTransactions] = useState<Transaction[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [entriesLoading, setEntriesLoading] = useState(true);
    const [txLoading, setTxLoading] = useState(true);
    const { showToast } = useToast();

    // Editing state
    const [editingSection, setEditingSection] = useState<BalanceSection | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [saving, setSaving] = useState(false);

    // Load manual entries (use getAll instead of subscribe to avoid permission issues)
    const loadEntries = async () => {
        try {
            const entries = await balanceEntriesService.getAll();
            setManualEntries(entries);
        } catch (err) {
            console.error('Balance entries load error:', err);
        } finally {
            setEntriesLoading(false);
        }
    };

    useEffect(() => { loadEntries(); }, []);

    // Load fact transactions + partners
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [txs, pts] = await Promise.all([
                    financeService.getTransactions({ status: 'fact' }),
                    partnersService.getAll(),
                ]);
                if (!cancelled) {
                    setFactTransactions(txs);
                    setPartners(pts);
                }
            } catch (err) {
                console.error('Balance data load error:', err);
            } finally {
                if (!cancelled) setTxLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Get manual entry amount by section
    const getManualAmount = (section: BalanceSection): { amount: number; id: string | null; description: string } => {
        const entry = manualEntries.find(e => e.section === section);
        return {
            amount: entry?.amount ?? 0,
            id: entry?.id ?? null,
            description: entry?.description ?? '',
        };
    };

    // Calculate investment balance (granted - returned)
    const investmentsNet = useMemo(() => {
        let total = 0;
        for (const t of factTransactions) {
            if (INVESTMENT_CATEGORY_IDS.includes(t.categoryId)) {
                total += t.type === 'expense' ? t.amount : -t.amount;
            }
        }
        return total;
    }, [factTransactions]);

    // Loan balance: granted loans outstanding
    const loansGranted = useMemo(() => {
        let granted = 0;
        let returned = 0;
        for (const t of factTransactions) {
            if (LOAN_GRANTED_IDS.includes(t.categoryId)) granted += t.amount;
            if (LOAN_RETURN_IDS.includes(t.categoryId)) returned += t.amount;
        }
        return granted - returned;
    }, [factTransactions]);

    // Loan liabilities: received loans outstanding
    const loanLiabilities = useMemo(() => {
        let received = 0;
        let repaid = 0;
        for (const t of factTransactions) {
            if (LOAN_RECEIVED_IDS.includes(t.categoryId)) received += t.amount;
            if (LOAN_REPAYMENT_IDS.includes(t.categoryId)) repaid += t.amount;
        }
        return received - repaid;
    }, [factTransactions]);

    // ДЗ / КЗ calculation (same logic as DebtsReportPage)
    const { receivables, payables } = useMemo(() => {
        const binToPartnerId = new Map<string, string>();
        for (const p of partners) {
            if (p.bin) binToPartnerId.set(p.bin, p.id);
        }

        // Per partner key: track income/expense by source
        const map = new Map<string, { income1c: number; incomeBank: number; expense1c: number; expenseBank: number }>();

        for (const tx of factTransactions) {
            if (tx.type === 'transfer') continue;
            // Resolve partner key
            let key = tx.partnerId || '';
            if (!key && tx.partnerBin) key = binToPartnerId.get(tx.partnerBin) || tx.partnerBin;
            if (!key) continue;

            if (!map.has(key)) map.set(key, { income1c: 0, incomeBank: 0, expense1c: 0, expenseBank: 0 });
            const entry = map.get(key)!;
            const amount = Math.abs(tx.amount);

            if (tx.type === 'income') {
                if (tx.sourceType === '1c') entry.income1c += amount;
                else entry.incomeBank += amount;
            } else if (tx.type === 'expense') {
                if (tx.sourceType === '1c') entry.expense1c += amount;
                else entry.expenseBank += amount;
            }
        }

        let totalDZ = 0;
        let totalKZ = 0;
        for (const entry of map.values()) {
            const dz = entry.income1c - entry.incomeBank;
            if (dz > 100) totalDZ += dz;
            const kz = entry.expense1c - entry.expenseBank;
            if (kz > 100) totalKZ += kz;
        }
        return { receivables: totalDZ, payables: totalKZ };
    }, [factTransactions, partners]);

    // Cash balance from bank transactions (all bank income - all bank expense)
    const cashFromDDS = useMemo(() => {
        let income = 0;
        let expense = 0;
        for (const t of factTransactions) {
            if (t.sourceType !== 'bank') continue;
            if (t.type === 'income') income += Math.abs(t.amount);
            else if (t.type === 'expense') expense += Math.abs(t.amount);
        }
        return income - expense;
    }, [factTransactions]);

    // Balance sheet data
    const fixedAssets = getManualAmount('fixed_assets');
    const inventory = getManualAmount('inventory');
    const charterCapital = getManualAmount('charter_capital');
    const additionalCapital = getManualAmount('additional_capital');

    const totalAssets =
        fixedAssets.amount +
        inventory.amount +
        receivables +
        investmentsNet +
        loansGranted +
        cashFromDDS; // cash from bank transactions (DDS)

    const totalLoanCapital = loanLiabilities + payables;

    // Retained earnings = Assets - Loan Capital - Charter - Additional
    const retainedEarnings =
        totalAssets - totalLoanCapital - charterCapital.amount - additionalCapital.amount;

    const totalEquity = charterCapital.amount + additionalCapital.amount + retainedEarnings;
    const totalLiabilities = totalEquity + totalLoanCapital;
    const isBalanced = Math.abs(totalAssets - totalLiabilities) < 1;

    const loading = balancesLoading || entriesLoading || txLoading;

    // Edit handlers
    const startEdit = (section: BalanceSection) => {
        const entry = getManualAmount(section);
        setEditingSection(section);
        setEditAmount(String(entry.amount || ''));
        setEditDescription(entry.description);
    };

    const cancelEdit = () => {
        setEditingSection(null);
        setEditAmount('');
        setEditDescription('');
    };

    const saveEdit = async () => {
        if (!editingSection) return;
        setSaving(true);
        try {
            const entry = getManualAmount(editingSection);
            await balanceEntriesService.upsert(entry.id, {
                section: editingSection,
                amount: parseFloat(editAmount) || 0,
                description: editDescription || undefined,
                asOfDate: Timestamp.now(),
            });
            showToast('Сохранено', 'success');
            cancelEdit();
            loadEntries();
        } catch {
            showToast('Ошибка сохранения', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Render a balance line
    const renderLine = (line: BalanceLine, _side: 'assets' | 'liabilities') => {
        const isEditing = editingSection === line.section;

        return (
            <div key={line.label} className="flex items-center justify-between py-2.5 px-4 hover:bg-gray-50 group">
                <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-700">{line.label}</span>
                    {line.sublabel && (
                        <span className="block text-xs text-gray-400 mt-0.5">{line.sublabel}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <>
                            <input
                                type="number"
                                value={editAmount}
                                onChange={e => setEditAmount(e.target.value)}
                                className="w-32 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                            />
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                <X className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <span className={`text-sm font-semibold tabular-nums ${
                                line.amount > 0 ? 'text-gray-900' : line.amount < 0 ? 'text-red-600' : 'text-gray-400'
                            }`}>
                                {line.amount !== 0 ? `${formatMoney(line.amount)} ₸` : '0 ₸'}
                            </span>
                            {line.editable && line.section && (
                                <button
                                    onClick={() => startEdit(line.section!)}
                                    className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Build asset lines
    const assetLines: BalanceLine[] = [
        { label: BALANCE_SECTION_NAMES.fixed_assets, amount: fixedAssets.amount, editable: true, section: 'fixed_assets' },
        { label: BALANCE_SECTION_NAMES.inventory, amount: inventory.amount, editable: true, section: 'inventory' },
        { label: 'Дебиторская задолженность', amount: receivables, editable: false, sublabel: 'Начислено (1С) − Оплачено (банк)' },
        { label: 'Инвестиции', amount: investmentsNet, editable: false, sublabel: 'Σ транзакций с категорией INVESTMENT' },
        { label: 'Выданные займы', amount: loansGranted, editable: false, sublabel: 'Выдано − Возвращено' },
        { label: 'Деньги на счетах', amount: cashFromDDS, editable: false, sublabel: 'Остаток по ДДС (банк. поступления − расходы)' },
    ];

    const liabilityLines: BalanceLine[] = [
        { label: BALANCE_SECTION_NAMES.charter_capital, amount: charterCapital.amount, editable: true, section: 'charter_capital' },
        { label: BALANCE_SECTION_NAMES.additional_capital, amount: additionalCapital.amount, editable: true, section: 'additional_capital' },
        { label: 'Нераспред. прибыль', amount: retainedEarnings, editable: false, sublabel: 'Рассчитывается автоматически' },
    ];

    const loanLines: BalanceLine[] = [
        { label: 'Кредиты и займы', amount: loanLiabilities, editable: false, sublabel: 'Получено − Погашено' },
        { label: 'Кредиторская задолженность', amount: payables, editable: false, sublabel: 'Принято актов (1С) − Оплачено (банк)' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-900">Баланс</h2>
                <ReportInfoPopover
                    title="Как устроен баланс"
                    items={[
                        { label: 'Формула', text: 'Активы = Пассивы. Нераспределённая прибыль рассчитывается автоматически для балансировки.' },
                        { label: 'Ручные статьи', text: 'Внеоборотные активы, запасы, уставной и добавочный капитал вводятся вручную.' },
                        { label: 'Автоматические', text: 'Деньги = балансы счетов. ДЗ/КЗ = начислено по 1С минус оплачено по банку. Инвестиции и займы = из транзакций по системным категориям.' },
                    ]}
                />
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ASSETS */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/50">
                                <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider">Активы</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {assetLines.map(line => renderLine(line, 'assets'))}
                            </div>
                            <div className="px-4 py-3 border-t-2 border-blue-200 bg-blue-50 flex justify-between items-center">
                                <span className="text-sm font-bold text-blue-900">ИТОГО АКТИВЫ</span>
                                <span className="text-lg font-bold text-blue-900 tabular-nums">
                                    {formatMoney(totalAssets)} ₸
                                </span>
                            </div>
                        </div>

                        {/* LIABILITIES */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50/50">
                                <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Пассивы</h3>
                            </div>

                            {/* Equity */}
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Собственный капитал</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {liabilityLines.map(line => renderLine(line, 'liabilities'))}
                            </div>
                            <div className="px-4 py-2 bg-gray-100 flex justify-between items-center border-t border-gray-200">
                                <span className="text-sm font-semibold text-gray-700">Итого собственный капитал</span>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{formatMoney(totalEquity)} ₸</span>
                            </div>

                            {/* Loans */}
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Заёмный капитал</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {loanLines.map(line => renderLine(line, 'liabilities'))}
                            </div>

                            <div className="px-4 py-3 border-t-2 border-emerald-200 bg-emerald-50 flex justify-between items-center">
                                <span className="text-sm font-bold text-emerald-900">ИТОГО ПАССИВЫ</span>
                                <span className="text-lg font-bold text-emerald-900 tabular-nums">
                                    {formatMoney(totalLiabilities)} ₸
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Balance check */}
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
                        isBalanced
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                    }`}>
                        {isBalanced ? (
                            <Check className="w-5 h-5 text-green-600" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                            {isBalanced
                                ? 'Активы = Пассивы — баланс сходится'
                                : `Расхождение: ${formatMoney(Math.abs(totalAssets - totalLiabilities))} ₸`
                            }
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
