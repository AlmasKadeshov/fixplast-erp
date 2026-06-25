import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Project as ProjectModel, ProjectType } from '../../models';
import { projectsService } from '../../services';

interface ContractData {
    name: string;
    contractNumber: string;
    contractDate: string;
    contractAmount: string;
    clientName: string;
    startDate: string;
    endDate: string;
}

const emptyContract = (): ContractData => ({
    name: '',
    contractNumber: '',
    contractDate: '',
    contractAmount: '',
    clientName: '',
    startDate: '',
    endDate: '',
});

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    existingProjects: ProjectModel[];
    mode: 'create' | 'edit';
    project?: ProjectModel;
    initialData?: { parentId?: string; type?: ProjectType };
}

export function ProjectModal({ isOpen, onClose, onSuccess, existingProjects, mode, project, initialData }: ProjectModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // For "quick create" mode (new project from scratch)
    const [projectName, setProjectName] = useState('');
    const [clientName, setClientName] = useState('');
    const [contracts, setContracts] = useState<ContractData[]>([emptyContract()]);

    // For "add child" or "edit" mode — single element
    const [singleMode, setSingleMode] = useState(false);
    const [projectType, setProjectType] = useState<ProjectType>('group');
    const [formData, setFormData] = useState({
        name: '',
        parentId: '',
        clientName: '',
        contractNumber: '',
        contractDate: '',
        contractAmount: '',
        startDate: '',
        endDate: '',
    });

    // Determine mode on open
    useEffect(() => {
        if (!isOpen) return;

        if (mode === 'edit' && project) {
            // Edit mode — always single
            setSingleMode(true);
            setProjectType(project.type || 'contract');
            setFormData({
                name: project.name || '',
                parentId: project.parentId || '',
                clientName: project.clientName || '',
                contractNumber: project.contractNumber || '',
                contractDate: project.contractDate ? new Date(project.contractDate).toISOString().split('T')[0] : '',
                contractAmount: project.contractAmount ? project.contractAmount.toString() : '',
                startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
                endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : '',
            });
        } else if (initialData?.parentId) {
            // Adding child to existing parent — single mode
            setSingleMode(true);
            setProjectType(initialData.type || 'block');
            setFormData({
                name: '',
                parentId: initialData.parentId,
                clientName: '',
                contractNumber: '',
                contractDate: '',
                contractAmount: '',
                startDate: '',
                endDate: '',
            });
        } else {
            // Fresh create — quick wizard mode
            setSingleMode(false);
            setProjectName('');
            setClientName('');
            setContracts([emptyContract()]);
        }
    }, [mode, project, isOpen, initialData]);

    // --- SINGLE MODE (edit / add child) ---

    const availableParents = existingProjects.filter(p => {
        if (mode === 'edit' && project && p.id === project.id) return false;
        if (projectType === 'block') return p.type === 'group';
        if (projectType === 'system') return p.type === 'block';
        if (projectType === 'contract' || projectType === 'project') return p.type === 'system' || p.type === 'block';
        return false;
    });

    const handleSingleSubmit = async () => {
        if (!formData.name.trim()) {
            alert('Введите название');
            return;
        }

        setIsSubmitting(true);
        try {
            const parentProject = existingProjects.find(p => p.id === formData.parentId);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const projectData: any = {
                name: formData.name.trim(),
                type: projectType,
                parentId: formData.parentId || null,
                complexId: parentProject?.complexId || (projectType === 'group' ? `CMP-${Date.now()}` : parentProject?.id) || null,
                complexName: parentProject?.complexName || (projectType === 'group' ? formData.name.trim() : parentProject?.name) || '',
                blockName: (projectType === 'block' ? formData.name.trim() : parentProject?.blockName) || '',
            };

            if (mode === 'create') {
                projectData.code = `PRJ-${Date.now()}`;
                projectData.status = 'planning';
                projectData.progress = 0;
            }

            if (projectType === 'contract' || projectType === 'system') {
                projectData.clientName = formData.clientName;
                projectData.contractAmount = parseFloat(formData.contractAmount) || 0;
                projectData.contractNumber = formData.contractNumber || '';
                projectData.contractDate = formData.contractDate ? new Date(formData.contractDate) : null;
                projectData.startDate = formData.startDate ? new Date(formData.startDate) : null;
                projectData.endDate = formData.endDate ? new Date(formData.endDate) : null;
            }

            if (mode === 'create') {
                await projectsService.create(projectData);
            } else if (mode === 'edit' && project) {
                await projectsService.update(project.id, projectData);
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            alert('Ошибка при сохранении');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- QUICK WIZARD MODE (create project + contracts at once) ---

    const handleQuickSubmit = async () => {
        if (!projectName.trim()) {
            alert('Введите название проекта');
            return;
        }

        // Check if at least one contract has a name
        const validContracts = contracts.filter(c => c.name.trim());
        if (validContracts.length === 0) {
            alert('Добавьте хотя бы один договор');
            return;
        }

        setIsSubmitting(true);
        try {
            const now = Date.now();

            // 1. Create the group (object/project root)
            const groupData = await projectsService.create({
                name: projectName.trim(),
                type: 'group' as ProjectType,
                code: `PRJ-${now}`,
                status: 'planning',
                progress: 0,
                complexId: `CMP-${now}`,
                complexName: projectName.trim(),
                clientName: clientName.trim() || undefined,
            } as any);

            // 2. Create contracts as direct children
            for (let i = 0; i < validContracts.length; i++) {
                const c = validContracts[i];
                await projectsService.create({
                    name: c.name.trim(),
                    type: 'contract' as ProjectType,
                    parentId: groupData.id,
                    code: `PRJ-${now + i + 1}`,
                    status: 'planning',
                    progress: 0,
                    complexId: groupData.complexId || `CMP-${now}`,
                    complexName: projectName.trim(),
                    clientName: c.clientName.trim() || clientName.trim() || undefined,
                    contractNumber: c.contractNumber || undefined,
                    contractDate: c.contractDate ? new Date(c.contractDate) : undefined,
                    contractAmount: parseFloat(c.contractAmount) || 0,
                    startDate: c.startDate ? new Date(c.startDate) : undefined,
                    endDate: c.endDate ? new Date(c.endDate) : undefined,
                } as any);
            }

            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            alert('Ошибка при создании проекта');
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateContract = (index: number, field: keyof ContractData, value: string) => {
        setContracts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
    };

    const addContract = () => {
        setContracts(prev => [...prev, emptyContract()]);
    };

    const removeContract = (index: number) => {
        if (contracts.length <= 1) return;
        setContracts(prev => prev.filter((_, i) => i !== index));
    };

    if (!isOpen) return null;

    const getTypeLabel = () => {
        switch (projectType) {
            case 'group': return 'Название объекта';
            case 'block': return 'Название блока';
            case 'system': return 'Название системы';
            case 'contract': return 'Название договора';
            default: return 'Название';
        }
    };

    const getPlaceholder = () => {
        switch (projectType) {
            case 'group': return 'Например: Школа Кошкарбаева 11/3';
            case 'block': return 'Например: Блок А';
            case 'system': return 'Например: ОВК';
            case 'contract': return 'Например: ОВК — ТМЦ';
            default: return 'Введите название';
        }
    };

    // ========================
    // SINGLE MODE RENDER (edit / add child)
    // ========================
    if (singleMode) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-6 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900">
                            {mode === 'edit' ? 'Редактирование' : 'Добавить элемент'}
                        </h2>
                        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Type switcher (only for create, not edit) */}
                        {mode === 'create' && !initialData?.parentId && (
                            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                                {(['group', 'block', 'system', 'contract'] as ProjectType[]).map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setProjectType(t)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${projectType === t ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
                                    >
                                        {t === 'group' ? 'Объект' : t === 'block' ? 'Блок' : t === 'system' ? 'Система' : 'Договор'}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Show current type badge when adding child */}
                        {mode === 'create' && initialData?.parentId && (
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm text-gray-500">Тип:</span>
                                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                                    {projectType === 'block' ? 'Блок' : projectType === 'system' ? 'Система' : projectType === 'contract' ? 'Договор' : 'Объект'}
                                </span>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{getTypeLabel()}</label>
                            <input
                                autoFocus
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={getPlaceholder()}
                            />
                        </div>

                        {projectType !== 'group' && !initialData?.parentId && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Родитель
                                </label>
                                <select
                                    value={formData.parentId}
                                    onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="">Выберите...</option>
                                    {availableParents.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} {p.type === 'group' ? '(ЖК)' : p.type === 'block' ? '(Блок)' : p.type === 'system' ? '(Система)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {(projectType === 'contract' || projectType === 'system' || projectType === 'project' || projectType === 'block' || projectType === 'group') && (
                            <div className="space-y-3 pt-3 border-t border-gray-100">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Номер договора</label>
                                        <input type="text" value={formData.contractNumber}
                                            onChange={e => setFormData({ ...formData, contractNumber: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="№ 123" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Дата договора</label>
                                        <input type="date" value={formData.contractDate}
                                            onChange={e => setFormData({ ...formData, contractDate: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Заказчик</label>
                                        <input type="text" value={formData.clientName}
                                            onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Сумма (тг)</label>
                                        <input type="number" value={formData.contractAmount}
                                            onChange={e => setFormData({ ...formData, contractAmount: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Начало</label>
                                        <input type="date" value={formData.startDate}
                                            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Завершение</label>
                                        <input type="date" value={formData.endDate}
                                            onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors">
                                Отмена
                            </button>
                            <button
                                onClick={handleSingleSubmit}
                                disabled={isSubmitting}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {isSubmitting ? 'Сохранение...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ========================
    // QUICK WIZARD MODE (create project + contracts)
    // ========================
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Новый проект</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Создайте проект и сразу добавьте договоры</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Project info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Объект</span>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Название проекта / объекта</label>
                            <input
                                autoFocus
                                type="text"
                                value={projectName}
                                onChange={e => setProjectName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg"
                                placeholder="Например: Школа Кошкарбаева 11/3"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Заказчик (общий)</label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={e => setClientName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Например: BI Group"
                            />
                        </div>
                    </div>

                    {/* Contracts */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Договоры</span>
                                <span className="text-xs text-gray-400 ml-1">({contracts.length})</span>
                            </div>
                            <button
                                type="button"
                                onClick={addContract}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Добавить договор
                            </button>
                        </div>

                        {contracts.map((contract, index) => (
                            <ContractCard
                                key={index}
                                contract={contract}
                                index={index}
                                total={contracts.length}
                                onChange={(field, value) => updateContract(index, field, value)}
                                onRemove={() => removeContract(index)}
                            />
                        ))}
                    </div>

                    {/* Submit */}
                    <div className="flex gap-3 pt-2 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors">
                            Отмена
                        </button>
                        <button
                            onClick={handleQuickSubmit}
                            disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                        >
                            {isSubmitting ? 'Создание...' : `Создать проект (${contracts.filter(c => c.name.trim()).length} договор${contracts.filter(c => c.name.trim()).length === 1 ? '' : 'а'})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========================
// CONTRACT CARD COMPONENT
// ========================

function ContractCard({ contract, index, total, onChange, onRemove }: {
    contract: ContractData;
    index: number;
    total: number;
    onChange: (field: keyof ContractData, value: string) => void;
    onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(index === 0);

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Header — always visible */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {index + 1}
                </div>
                <input
                    type="text"
                    value={contract.name}
                    onChange={e => { e.stopPropagation(); onChange('name', e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent font-medium text-gray-800 placeholder-gray-400 outline-none"
                    placeholder={index === 0 ? 'Например: ОВК — ТМЦ (Поставка)' : 'Например: ОВК — СМР (Работы)'}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                    {total > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                            title="Удалить договор"
                        >
                            <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                    )}
                    {expanded
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="p-4 space-y-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Номер договора</label>
                            <input type="text" value={contract.contractNumber}
                                onChange={e => onChange('contractNumber', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="№ 123-45" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Дата договора</label>
                            <input type="date" value={contract.contractDate}
                                onChange={e => onChange('contractDate', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Заказчик</label>
                            <input type="text" value={contract.clientName}
                                onChange={e => onChange('clientName', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Если отличается от общего" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Сумма (тг)</label>
                            <input type="number" value={contract.contractAmount}
                                onChange={e => onChange('contractAmount', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Начало работ</label>
                            <input type="date" value={contract.startDate}
                                onChange={e => onChange('startDate', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Завершение</label>
                            <input type="date" value={contract.endDate}
                                onChange={e => onChange('endDate', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
