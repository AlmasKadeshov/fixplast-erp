import { useState, useEffect, useCallback } from 'react';
import { tagsService } from '../services/tags.service';
import { Tag, TagInput } from '../models/tag';

/**
 * Хук для работы с тегами (realtime listener)
 */
export function useTags() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = tagsService.subscribe((data) => {
            setTags(data);
            setLoading(false);
            setError(null);
        });

        return () => unsubscribe();
    }, []);

    const createTag = useCallback(async (data: TagInput) => {
        try {
            return await tagsService.create(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания тега');
            throw err;
        }
    }, []);

    const updateTag = useCallback(async (id: string, data: Partial<TagInput>) => {
        try {
            await tagsService.update(id, data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка обновления тега');
            throw err;
        }
    }, []);

    const deleteTag = useCallback(async (id: string) => {
        try {
            await tagsService.delete(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка удаления тега');
            throw err;
        }
    }, []);

    return { tags, loading, error, createTag, updateTag, deleteTag };
}
