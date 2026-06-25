// @ts-nocheck
import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, Save, Zap, ToggleLeft, ToggleRight, Play, ArrowRight } from 'lucide-react';
import { autoRulesService } from '../../services/autoRules.service';
import { costItemsService } from '../../services/costItems.service';
import { projectsService } from '../../services/projects.service';
import { partnersService } from '../../services/partners.service';
import { AutoRule } from '../../models/autoRule';
import { CostItem } from '../../models/costItems';
import { Project, Partner } from '../../models';
import { useTags } from '../../hooks/useTags';
import { useToast } from '../../components/ui/Toast';
import { testRule } from '../../utils/autoRuleMatcher';

interface FormData {
    name: string;
    priority: number;
    enabled: boolean;
    descriptionPattern: string;
    partnerPattern: string;
    transactionType: '' | 'income' | 'expense';
    minAmount: string;
    maxAmount: string;
    setCategoryId: string;
    setProjectId: string;
    setPartnerId: string;
    setTagId: string;
    setAutoAup: boolean;
}

const emptyForm: FormData = {
    name: '',
    priority: 100,
    enabled: true,
    descriptionPattern: '',
    partnerPattern: '',
    transactionType: '',
    minAmount: '',
    maxAmount: '',
    setCategoryId: '',
    setProjectId: '',
    setPartnerId: '',
    setTagId: '',
    setAutoAup: false,
};

export function AutoRulesPage() {
    const [rules, setRules] = useState<AutoRule[]>([]);
    const [costItems, setCostItems] = useState<CostItem[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<FormData>(emptyForm);

    // Тест правила
    const [testDescription, setTestDescription] = useState('');
    const [testResult, setTestResult] = useState<boolean | null>(null);

    const { tags } = useTags();
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [rulesData, itemsData, projectsData, partnersData] = await Promise.all([
                autoRulesService.getAllRules(),
                costItemsService.getAll(),
                projectsService.getAll(),
                partnersService.getAll(),
            ]);
            setRules(rulesData);
            setCostItems(itemsData);
            setProjects(projectsData);
            setPartners(partnersData);
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (rule: AutoRule) => {
        setEditingRule(rule);
        setFormData({
            name: rule.name,
            priority: rule.priority,
            enabled: rule.enabled,
            descriptionPattern: rule.descriptionPattern || '',
            partnerPattern: rule.partnerPattern || '',
            transactionType: rule.transactionType || '',
            minAmount: rule.minAmount?.toString() || '',
            maxAmount: rule.maxAmount?.toString() || '',
            setCategoryId: rule.setCategoryId || '',
            setProjectId: rule.setProjectId || '',
            setPartnerId: rule.setPartnerId || '',
            setTagId: rule.setTagId || '',
            setAutoAup: rule.setAutoAup || false,
        });
        setTestDescription('');
        setTestResult(null);
        setShowModal(true);
    };

    const handleCreate = () => {
        setEditingRule(null);
        setFormData(emptyForm);
        setTestDescription('');
        setTestResult(null);
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить это правило?')) return;
        try {
            await autoRulesService.delete(id);
            showToast('Правило удалено', 'success');
            loadData();
        } catch {
            showToast('Ошибка удаления', 'error');
        }
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        try {
            await autoRulesService.toggleEnabled(id, !enabled);
            setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
        } catch {
            showToast('Ошибка', 'error');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name) {
            showToast('Введите название правила', 'error');
            return;
        }
        if (!formData.descriptionPattern && !formData.partnerPattern && !formData.transactionType) {
            showToast('Задайте хотя бы одно условие', 'error');
            return;
        }
        if (!formData.setCategoryId && !formData.setProjectId && !formData.setPartnerId && !formData.setTagId) {
            showToast('Задайте хотя бы одно действие (категория, проект, контрагент или тег)', 'error');
            return;
        }

        try {
            setIsSaving(true);
            const data = {
                name: formData.name,
                priority: formData.priority,
                enabled: formData.enabled,
                descriptionPattern: formData.descriptionPattern || undefined,
                partnerPattern: formData.partnerPattern || undefined,
                transactionType: (formData.transactionType || undefined) as 'income' | 'expense' | undefined,
                minAmount: formData.minAmount ? Number(formData.minAmount) : undefined,
                maxAmount: formData.maxAmount ? Number(formData.maxAmount) : undefined,
                setCategoryId: formData.setCategoryId || undefined,
                setProjectId: formData.setProjectId || undefined,
                setPartnerId: formData.setPartnerId || undefined,
                setTagId: formData.setTagId || undefined,
                setAutoAup: formData.setAutoAup || undefined,
                matchCount: editingRule?.matchCount || 0,
                createdBy: editingRule?.createdBy || '',
            };

            if (editingRule) {
                await autoRulesService.update(editingRule.id, data);
                showToast('Правило обновлено', 'success');
            } else {
                await autoRulesService.create(data);
                showToast('Правило создано', 'success');
            }
            setShowModal(false);
            loadData();
        } catch {
            showToast('Ошибка сохранения', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestRule = () => {
        if (!testDescription) return;
        const fakeRule: AutoRule = {
            id: 'test',
            name: formData.name,
            priority: formData.priority,
            enabled: true,
            descriptionPattern: formData.descriptionPattern || undefined,
            partnerPattern: formData.partnerPattern || undefined,
            transactionType: (formData.transactionType || undefined) as 'income' | 'expense' | undefined,
            minAmount: formData.minAmount ? Number(formData.minAmount) : undefined,
            maxAmount: formData.maxAmount ? Number(formData.maxAmount) : undefined,
            setCategoryId: formData.setCategoryId || undefined,
            setProjectId: formData.setProjectId || undefined,
            setPartnerId: formData.setPartnerId || undefined,
            setTagId: formData.setTagId || undefined,
            setAutoAup: formData.setAutoAup || undefined,
            matchCount: 0,
            createdBy: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const result = testRule(fakeRule, testDescription, '', 'expense', 100000);
        setTestResult(result);
    };

    const getCategoryName = (id: string) => costItems.find(i => i.itemId === id)?.itemName || id;
    const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || id;

    const filteredRules = rules.filter(rule =>
        rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rule.descriptionPattern || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Авто-правила</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Автоматическая категоризация транзакций при импорте
                    </p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Новое правило
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Поиск по названию или паттерну..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            {/* Info card */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                        <p className="font-medium">Как это работает?</p>
                        <p className="mt-1">
                            При импорте банковской выписки система проверяет каждую транзакцию по вашим правилам.
                            Если описание платежа совпадает с паттерном — автоматически назначается категория, проект и контрагент.
                        </p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Правило</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Условие</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действие</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Срабатываний</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                                            Загрузка...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRules.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        {searchTerm ? 'Ничего не найдено' : 'Нет правил. Создайте первое правило!'}
                                    </td>
                                </tr>
                            ) : (
                                filteredRules.map((rule) => (
                                    <tr key={rule.id} className={`hover:bg-gray-50 ${!rule.enabled ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleToggle(rule.id, rule.enabled)}
                                                className="text-gray-500 hover:text-blue-600"
                                                title={rule.enabled ? 'Отключить' : 'Включить'}
                                            >
                                                {rule.enabled ? (
                                                    <ToggleRight className="w-6 h-6 text-green-500" />
                                                ) : (
                                                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                                            <div className="text-xs text-gray-500">Приоритет: {rule.priority}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                {rule.descriptionPattern && (
                                                    <div className="text-xs">
                                                        <span className="text-gray-500">Описание:</span>{' '}
                                                        <code className="bg-gray-100 px-1 rounded text-gray-800">{rule.descriptionPattern}</code>
                                                    </div>
                                                )}
                                                {rule.partnerPattern && (
                                                    <div className="text-xs">
                                                        <span className="text-gray-500">Контрагент:</span>{' '}
                                                        <code className="bg-gray-100 px-1 rounded text-gray-800">{rule.partnerPattern}</code>
                                                    </div>
                                                )}
                                                {rule.transactionType && (
                                                    <div className="text-xs">
                                                        <span className={`inline-block px-1.5 py-0.5 rounded text-white text-[10px] ${rule.transactionType === 'income' ? 'bg-green-500' : 'bg-red-500'}`}>
                                                            {rule.transactionType === 'income' ? 'Приход' : 'Расход'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-xs">
                                                {rule.setCategoryId && (
                                                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                                        {getCategoryName(rule.setCategoryId)}
                                                    </span>
                                                )}
                                                {rule.setCategoryId && rule.setProjectId && (
                                                    <ArrowRight className="w-3 h-3 text-gray-400" />
                                                )}
                                                {rule.setProjectId && (
                                                    <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                                                        {getProjectName(rule.setProjectId)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">{rule.matchCount}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex space-x-1">
                                                <button
                                                    onClick={() => handleEdit(rule)}
                                                    className="p-1.5 hover:bg-gray-100 rounded text-blue-600"
                                                    title="Редактировать"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(rule.id)}
                                                    className="p-1.5 hover:bg-gray-100 rounded text-red-600"
                                                    title="Удалить"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editingRule ? 'Редактировать правило' : 'Новое авто-правило'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            {/* Основное */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Название правила *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="Например: Аренда офиса → OFFICE_RENT"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Приоритет</label>
                                    <input
                                        type="number"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        min={0}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Меньше = проверяется раньше</p>
                                </div>
                                <div className="flex items-center">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.enabled}
                                            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Правило активно</span>
                                    </label>
                                </div>
                            </div>

                            {/* Условия */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Search className="w-4 h-4" />
                                    Условия (когда применять)
                                </h3>
                                <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Описание содержит</label>
                                        <input
                                            type="text"
                                            value={formData.descriptionPattern}
                                            onChange={(e) => setFormData({ ...formData, descriptionPattern: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                            placeholder="Например: аренда, зарплата, материалы..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Контрагент содержит</label>
                                        <input
                                            type="text"
                                            value={formData.partnerPattern}
                                            onChange={(e) => setFormData({ ...formData, partnerPattern: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                            placeholder="Например: ТОО Алмас, ИП Иванов..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Тип</label>
                                            <select
                                                value={formData.transactionType}
                                                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value as '' | 'income' | 'expense' })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                            >
                                                <option value="">Любой</option>
                                                <option value="income">Приход</option>
                                                <option value="expense">Расход</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Сумма от</label>
                                            <input
                                                type="number"
                                                value={formData.minAmount}
                                                onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                                placeholder="0"
                                                min={0}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Сумма до</label>
                                            <input
                                                type="number"
                                                value={formData.maxAmount}
                                                onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                                placeholder="999 999 999"
                                                min={0}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Действия */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Zap className="w-4 h-4" />
                                    Действия (что назначить)
                                </h3>
                                <div className="space-y-3 bg-blue-50 rounded-lg p-4">
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Статья расходов</label>
                                        <select
                                            value={formData.setCategoryId}
                                            onChange={(e) => setFormData({ ...formData, setCategoryId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                        >
                                            <option value="">— Не назначать —</option>
                                            {costItems.map(item => (
                                                <option key={item.itemId} value={item.itemId}>
                                                    {item.itemName} ({item.itemId})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Проект</label>
                                        <select
                                            value={formData.setProjectId}
                                            onChange={(e) => setFormData({ ...formData, setProjectId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                        >
                                            <option value="">— Не назначать —</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Контрагент</label>
                                        <select
                                            value={formData.setPartnerId}
                                            onChange={(e) => setFormData({ ...formData, setPartnerId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                        >
                                            <option value="">— Не назначать —</option>
                                            {partners.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 mb-1">Тег</label>
                                        <select
                                            value={formData.setTagId}
                                            onChange={(e) => setFormData({ ...formData, setTagId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                        >
                                            <option value="">— Не назначать —</option>
                                            {tags.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.setAutoAup}
                                            onChange={(e) => setFormData({ ...formData, setAutoAup: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Привязать к АУП (общие расходы)</span>
                                    </label>
                                </div>
                            </div>

                            {/* Тест */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Play className="w-4 h-4" />
                                    Тест правила
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={testDescription}
                                        onChange={(e) => { setTestDescription(e.target.value); setTestResult(null); }}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="Введите пример назначения платежа..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleTestRule}
                                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                                    >
                                        Проверить
                                    </button>
                                </div>
                                {testResult !== null && (
                                    <div className={`mt-2 text-sm px-3 py-2 rounded-lg ${testResult ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        {testResult ? 'Совпадает! Правило сработает.' : 'Не совпадает. Правило не сработает.'}
                                    </div>
                                )}
                            </div>

                            {/* Кнопки */}
                            <div className="pt-4 border-t flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                                >
                                    {isSaving ? (
                                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Сохранить
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
