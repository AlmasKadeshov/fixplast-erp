import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAccounts } from './useAccounts';
import { Transaction, getAccountId } from '../models/finance';
import { Account, AccountType } from '../models/account';

export interface AccountBalance {
    accountId: string;
    accountName: string;
    balance: number;
    currency: string;
    type: AccountType;
}

export interface FuturePayments {
    income: number;
    expense: number;
    net: number;
}

/**
 * Совпадение транзакции со счётом.
 * До миграции: walletId = account.name
 * После миграции: accountId = account.id
 */
function txMatchesAccount(t: Transaction, account: Account): boolean {
    const accId = getAccountId(t);
    return accId === account.id || accId === account.name;
}

function txMatchesAccountTo(t: Transaction, account: Account): boolean {
    if (!t.accountToId) return false;
    return t.accountToId === account.id || t.accountToId === account.name;
}

/**
 * Хук для расчёта балансов счетов в реальном времени
 *
 * Формула баланса (ТОЛЬКО фактические операции):
 * balance = startingBalance
 *   + Σ amount WHERE type="income" AND status="fact" AND accountId=X
 *   − Σ amount WHERE type="expense" AND status="fact" AND accountId=X
 *   + Σ amount WHERE type="transfer" AND status="fact" AND accountToId=X
 *   − Σ amount WHERE type="transfer" AND status="fact" AND accountId=X
 */
export function useAccountBalances() {
    const { accounts, loading: accountsLoading } = useAccounts();
    const [factTransactions, setFactTransactions] = useState<Transaction[]>([]);
    const [planTransactions, setPlanTransactions] = useState<Transaction[]>([]);
    const [factLoading, setFactLoading] = useState(true);
    const [planLoading, setPlanLoading] = useState(true);

    // Подписка на фактические транзакции (для балансов)
    useEffect(() => {
        const q = query(
            collection(db, 'transactions'),
            where('status', '==', 'fact')
        );

        const unsub = onSnapshot(q, (snap) => {
            const txns: Transaction[] = [];
            snap.forEach(doc => {
                txns.push({ id: doc.id, ...doc.data() } as Transaction);
            });
            setFactTransactions(txns);
            setFactLoading(false);
        }, () => setFactLoading(false));

        return unsub;
    }, []);

    // Подписка на плановые транзакции (для будущих платежей)
    useEffect(() => {
        const q = query(
            collection(db, 'transactions'),
            where('status', '==', 'plan')
        );

        const unsub = onSnapshot(q, (snap) => {
            const txns: Transaction[] = [];
            snap.forEach(doc => {
                txns.push({ id: doc.id, ...doc.data() } as Transaction);
            });
            setPlanTransactions(txns);
            setPlanLoading(false);
        }, () => setPlanLoading(false));

        return unsub;
    }, []);

    // Баланс по каждому счёту
    const balances = useMemo<AccountBalance[]>(() => {
        if (accounts.length === 0) return [];

        return accounts
            .filter(a => a.isActive)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(account => {
                let balance = account.startingBalance || 0;

                for (const t of factTransactions) {
                    if (t.type === 'income' && txMatchesAccount(t, account)) {
                        balance += t.amount;
                    } else if (t.type === 'expense' && txMatchesAccount(t, account)) {
                        balance -= t.amount;
                    } else if (t.type === 'transfer') {
                        if (txMatchesAccount(t, account)) {
                            balance -= t.amount;
                        }
                        if (txMatchesAccountTo(t, account)) {
                            balance += t.amount;
                        }
                    }
                }

                return {
                    accountId: account.id,
                    accountName: account.name,
                    balance,
                    currency: account.currency,
                    type: account.type,
                };
            });
    }, [accounts, factTransactions]);

    // Общий баланс
    const totalBalance = useMemo(
        () => balances.reduce((sum, b) => sum + b.balance, 0),
        [balances]
    );

    // Будущие платежи (plan-транзакции)
    const futurePayments = useMemo<FuturePayments>(() => {
        let income = 0;
        let expense = 0;
        for (const t of planTransactions) {
            if (t.type === 'income') income += t.amount;
            else if (t.type === 'expense') expense += t.amount;
        }
        return { income, expense, net: income - expense };
    }, [planTransactions]);

    return {
        balances,
        totalBalance,
        futurePayments,
        loading: factLoading || planLoading || accountsLoading,
    };
}
