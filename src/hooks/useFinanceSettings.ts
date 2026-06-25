import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface FinanceSettings {
    /** Дата закрытия периода (yyyy-MM-dd). Транзакции до этой даты нельзя редактировать. */
    closedDate: string | null;
}

const SETTINGS_DOC = doc(db, 'settings', 'finance');

const DEFAULT_SETTINGS: FinanceSettings = {
    closedDate: null,
};

export function useFinanceSettings() {
    const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(SETTINGS_DOC, (snap) => {
            if (snap.exists()) {
                setSettings(snap.data() as FinanceSettings);
            } else {
                setSettings(DEFAULT_SETTINGS);
            }
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    }, []);

    const updateClosedDate = async (date: string | null) => {
        await setDoc(SETTINGS_DOC, { closedDate: date }, { merge: true });
    };

    const isLocked = (txDate: Date): boolean => {
        if (!settings.closedDate) return false;
        const closed = new Date(settings.closedDate);
        closed.setHours(23, 59, 59, 999);
        return txDate <= closed;
    };

    return {
        settings,
        loading,
        updateClosedDate,
        isLocked,
    };
}
