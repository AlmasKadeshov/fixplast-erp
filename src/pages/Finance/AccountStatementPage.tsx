import { useState, useEffect, useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAccounts } from '../../hooks/useAccounts';
import { Transaction, getPaymentDate, getAccountId } from '../../models/finance';
import { Account } from '../../models/account';
import { Download, FileSpreadsheet } from 'lucide-react';
import { ReportInfoPopover } from '../../components/finance/ReportInfoPopover';
import { quickExport } from '../../utils/excelExport';
import { formatMoney } from '../../utils/formatters';

// ============================================
// TYPES
// ============================================

interface StatementRow {
    id: string;
    date: Date;
    description: string;
    debit: number;   // приход
    credit: number;  // расход
    balance: number;  // running balance
    type: string;
    status: string;
}

// ============================================
// HELPERS
// ============================================

function txMatchesAccount(t: Transaction, account: Account): boolean {
    const accId = getAccountId(t);
    return accId === account.id || accId === account.name;
}

function txMatchesAccountTo(t: Transaction, account: Account): boolean {
    if (!t.accountToId) return false;
    return t.accountToId === account.id || t.accountToId === account.name;
}

// ============================================
// COMPONENT
// ============================================

export function AccountStatementPage() {
    const { activeAccounts, loading: accountsLoading } = useAccounts();
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [txLoading, setTxLoading] = useState(false);

    // Auto-select first account
    useEffect(() => {
        if (!selectedAccountId && activeAccounts.length > 0) {
            setSelectedAccountId(activeAccounts[0].id);
        }
    }, [activeAccounts, selectedAccountId]);

    const selectedAccount = useMemo(
        () => activeAccounts.find(a => a.id === selectedAccountId),
        [activeAccounts, selectedAccountId],
    );

    // Subscribe to fact transactions
    useEffect(() => {
        setTxLoading(true);
        const q = query(
            collection(db, 'transactions'),
            where('status', '==', 'fact'),
            orderBy('date', 'asc'),
        );

        const unsub = onSnapshot(q, (snap) => {
            const txns: Transaction[] = [];
            snap.forEach(doc => txns.push({ id: doc.id, ...doc.data() } as Transaction));
            setTransactions(txns);
            setTxLoading(false);
        }, () => setTxLoading(false));

        return unsub;
    }, []);

    // Parse month
    const [year, month] = currentMonth.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));

    const statementData = useMemo<{ openingBalance: number; rows: StatementRow[]; closingBalance: number }>(() => {
        if (!selectedAccount) return { openingBalance: 0, rows: [], closingBalance: 0 };

        let runningBalance = selectedAccount.startingBalance || 0;
        const rows: StatementRow[] = [];

        // Sort all transactions by date
        const sorted = [...transactions].sort((a, b) => {
            const dateA = getPaymentDate(a).toDate().getTime();
            const dateB = getPaymentDate(b).toDate().getTime();
            return dateA - dateB;
        });

        let openingBalance = selectedAccount.startingBalance || 0;

        for (const t of sorted) {
            const txDate = getPaymentDate(t).toDate();
            let debit = 0;
            let credit = 0;
            let relevant = false;

            if (t.type === 'income' && txMatchesAccount(t, selectedAccount)) {
                debit = t.amount;
                relevant = true;
            } else if (t.type === 'expense' && txMatchesAccount(t, selectedAccount)) {
                credit = t.amount;
                relevant = true;
            } else if (t.type === 'transfer') {
                if (txMatchesAccount(t, selectedAccount)) {
                    credit = t.amount;
                    relevant = true;
                }
                if (txMatchesAccountTo(t, selectedAccount)) {
                    debit = t.amount;
                    relevant = true;
                }
            }

            if (!relevant) continue;

            runningBalance += debit - credit;

            // Before the month → accumulate opening balance
            if (txDate < monthStart) {
                openingBalance = runningBalance;
                continue;
            }

            // After the month → stop
            if (txDate > monthEnd) break;

            // In the month → add row
            rows.push({
                id: t.id,
                date: txDate,
                description: t.description || t.sourceDoc || '—',
                debit,
                credit,
                balance: runningBalance,
                type: t.type,
                status: t.status,
            });
        }

        const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

        return { openingBalance, rows, closingBalance };
    }, [selectedAccount, transactions, monthStart, monthEnd]);

    const loading = accountsLoading || txLoading;

    // Month navigation
    const months: string[] = useMemo(() => {
        const result: string[] = [];
        const now = new Date();
        for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
            for (let m = 0; m < 12; m++) {
                result.push(format(new Date(y, m, 1), 'yyyy-MM'));
            }
        }
        return result;
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">Выписка по счёту</h2>
                    <ReportInfoPopover
                        title="Как работает выписка"
                        items={[
                            { label: 'Что показывает', text: 'Движение по одному счёту за месяц: приход, расход и текущий остаток.' },
                            { label: 'Остаток', text: 'Вх. остаток = стартовый баланс + все операции до выбранного месяца.' },
                        ]}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                        {activeAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <select
                        value={currentMonth}
                        onChange={e => setCurrentMonth(e.target.value)}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                        {months.map(m => (
                            <option key={m} value={m}>
                                {format(new Date(Number(m.split('-')[0]), Number(m.split('-')[1]) - 1, 1), 'LLLL yyyy', { locale: ru })}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors no-print text-sm"
                    >
                        <Download className="w-4 h-4 mr-1" />
                        PDF
                    </button>
                    <button
                        onClick={() => {
                            if (!selectedAccount) return;
                            const headers = ['Дата', 'Описание', 'Приход', 'Расход', 'Остаток'];
                            const rows: (string | number)[][] = [
                                ['', 'Входящий остаток', '', '', statementData.openingBalance],
                                ...statementData.rows.map(r => [
                                    format(r.date, 'dd.MM.yyyy'),
                                    r.description,
                                    r.debit || '',
                                    r.credit || '',
                                    r.balance,
                                ]),
                                ['', 'Исходящий остаток', '', '', statementData.closingBalance],
                            ];
                            quickExport(
                                `Выписка_${selectedAccount.name}_${currentMonth}`,
                                headers, rows, 'Выписка'
                            );
                        }}
                        className="flex items-center px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors no-print text-sm"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-1" />
                        Excel
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : !selectedAccount ? (
                <div className="p-8 text-center text-gray-500">Выберите счёт</div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    {/* Opening balance */}
                    <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                        <span className="text-sm font-medium text-blue-800">Входящий остаток</span>
                        <span className="text-sm font-bold text-blue-900 tabular-nums">
                            {formatMoney(statementData.openingBalance)} ₸
                        </span>
                    </div>

                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-4 py-2.5 w-24">Дата</th>
                                <th className="px-4 py-2.5">Описание</th>
                                <th className="px-4 py-2.5 text-right">Приход</th>
                                <th className="px-4 py-2.5 text-right">Расход</th>
                                <th className="px-4 py-2.5 text-right">Остаток</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {statementData.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                                        Нет операций за выбранный период
                                    </td>
                                </tr>
                            ) : (
                                statementData.rows.map(row => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums">
                                            {format(row.date, 'dd.MM.yy')}
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-700 max-w-[300px] truncate" title={row.description}>
                                            {row.description}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-green-600 font-medium">
                                            {row.debit > 0 ? `+${formatMoney(row.debit)}` : ''}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-red-500 font-medium">
                                            {row.credit > 0 ? `−${formatMoney(row.credit)}` : ''}
                                        </td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                                            row.balance >= 0 ? 'text-gray-900' : 'text-red-600'
                                        }`}>
                                            {formatMoney(row.balance)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Closing balance */}
                    <div className="px-4 py-3 bg-slate-800 text-white flex justify-between items-center">
                        <span className="text-sm font-medium">Исходящий остаток</span>
                        <span className="text-sm font-bold tabular-nums">
                            {formatMoney(statementData.closingBalance)} ₸
                        </span>
                    </div>

                    {/* Summary */}
                    <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-6">
                        <span>
                            Приход: <strong className="text-green-600">
                                +{formatMoney(statementData.rows.reduce((s, r) => s + r.debit, 0))} ₸
                            </strong>
                        </span>
                        <span>
                            Расход: <strong className="text-red-500">
                                −{formatMoney(statementData.rows.reduce((s, r) => s + r.credit, 0))} ₸
                            </strong>
                        </span>
                        <span>
                            Операций: <strong>{statementData.rows.length}</strong>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
