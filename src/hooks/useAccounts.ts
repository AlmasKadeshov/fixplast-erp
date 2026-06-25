import { useState, useEffect, useCallback, useMemo } from 'react';
import { accountsService } from '../services/accounts.service';
import { Account, AccountInput } from '../models/account';

/**
 * Хук для работы со счетами (realtime listener)
 */
export function useAccounts() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Realtime подписка
    useEffect(() => {
        setLoading(true);
        const unsubscribe = accountsService.subscribe((data) => {
            setAccounts(data);
            setLoading(false);
            setError(null);
        });

        return () => unsubscribe();
    }, []);

    // Только активные
    const activeAccounts = useMemo(
        () => accounts.filter((a) => a.isActive),
        [accounts]
    );

    const createAccount = useCallback(async (data: AccountInput) => {
        try {
            return await accountsService.create(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания счёта');
            throw err;
        }
    }, []);

    const updateAccount = useCallback(async (id: string, data: Partial<AccountInput>) => {
        try {
            await accountsService.update(id, data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка обновления счёта');
            throw err;
        }
    }, []);

    const archiveAccount = useCallback(async (id: string) => {
        try {
            await accountsService.archive(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка архивации счёта');
            throw err;
        }
    }, []);

    return {
        accounts,
        activeAccounts,
        loading,
        error,
        createAccount,
        updateAccount,
        archiveAccount,
    };
}
