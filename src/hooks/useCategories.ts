import { useState, useEffect, useCallback, useMemo } from 'react';
import { categoriesService } from '../services/categories.service';
import { Category, CategoryInput } from '../models/category';

/**
 * Хук для работы с категориями (realtime listener)
 */
export function useCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = categoriesService.subscribe((data) => {
            setCategories(data);
            setLoading(false);
            setError(null);
        });

        return () => unsubscribe();
    }, []);

    // Категории доходов
    const incomeCategories = useMemo(
        () => categories.filter((c) => c.type === 'income'),
        [categories]
    );

    // Категории расходов
    const expenseCategories = useMemo(
        () => categories.filter((c) => c.type === 'expense'),
        [categories]
    );

    // Системные категории
    const systemCategories = useMemo(
        () => categories.filter((c) => c.isSystem),
        [categories]
    );

    // Пользовательские категории
    const userCategories = useMemo(
        () => categories.filter((c) => !c.isSystem),
        [categories]
    );

    // Иерархическая структура: корневые + дочерние
    const rootCategories = useMemo(
        () => categories.filter((c) => !c.parentId),
        [categories]
    );

    const getChildren = useCallback(
        (parentId: string) => categories.filter((c) => c.parentId === parentId),
        [categories]
    );

    // Поиск по legacyItemId (для обратной совместимости)
    const findByLegacyId = useCallback(
        (legacyItemId: string) => categories.find((c) => c.legacyItemId === legacyItemId),
        [categories]
    );

    const createCategory = useCallback(async (data: CategoryInput) => {
        try {
            return await categoriesService.create(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания категории');
            throw err;
        }
    }, []);

    const updateCategory = useCallback(async (id: string, data: Partial<CategoryInput>) => {
        try {
            await categoriesService.update(id, data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка обновления категории');
            throw err;
        }
    }, []);

    const deleteCategory = useCallback(async (id: string) => {
        // Не даём удалять системные
        const cat = categories.find((c) => c.id === id);
        if (cat?.isSystem) {
            setError('Нельзя удалить системную категорию');
            return;
        }
        try {
            await categoriesService.delete(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка удаления категории');
            throw err;
        }
    }, [categories]);

    return {
        categories,
        incomeCategories,
        expenseCategories,
        systemCategories,
        userCategories,
        rootCategories,
        getChildren,
        findByLegacyId,
        loading,
        error,
        createCategory,
        updateCategory,
        deleteCategory,
    };
}
