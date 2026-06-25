import { BaseEntity } from './index';

// ============================================
// ТЕГИ (TAGS) — Фаза 0, Задача 0.4
// ============================================

/**
 * Тег для транзакций (произвольная маркировка)
 */
export interface Tag extends BaseEntity {
    /** Название тега */
    name: string;
}

/** Данные для создания тега */
export type TagInput = Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>;
