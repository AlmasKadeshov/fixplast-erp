// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
    Users, CheckCircle2, Clock, Banknote,
    CheckSquare, Square, RefreshCw, FileUp,
    Trash2, X, UserPlus, AlertTriangle
} from 'lucide-react';
import { payrollService } from '../../services/payroll.service';
import { PayrollRecord } from '../../models/payroll';
import { useToast } from '../../components/ui/Toast';
import { parseBankStatement } from '../../utils/bankParser';
import { isPersonName } from '../../utils/costItemMatcher';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { formatMoney as fmt } from '../../utils/formatters';

// ── Types ──────────────────────────────────────────────
interface EmployeeData {
    id: string;
    fullName: string;
    position?: string;
    salary: number;
    bonusMax?: number;
    status?: string;
    paymentType?: 'official' | 'cash';
}

interface MatchResultItem { name: string; amount: number }
interface MatchResult {
    matched: MatchResultItem[];
    unmatched: MatchResultItem[];
}

// ── Helpers ────────────────────────────────────────────
const SALARY_KEYWORDS = ['зарплата', 'зп ', 'заработн', 'перечисление зп', 'перечисление з/п'];

function normalizeName(n: string) { return n.toLowerCase().replace(/\s+/g, ' ').trim(); }

function namesMatch(a: string, b: string): boolean {
    const pa = normalizeName(a).split(' ');
    const pb = normalizeName(b).split(' ');
    return pa.filter(w => pb.includes(w)).length >= 2;
}

// ── Component ──────────────────────────────────────────
export function PayrollPage() {
    const [records, setRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Inline editing
    const [editingCell, setEditingCell] = useState<{ id: string; field: 'baseSalary' | 'bonus' | 'paidAmount' } | null>(null);
    const [editValue, setEditValue] = useState(0);

    // Add employee form
    const [showAddForm, setShowAddForm] = useState(false);
    const [allEmployees, setAllEmployees] = useState<EmployeeData[]>([]);
    const [addEmployeeId, setAddEmployeeId] = useState('');
    const [addPaymentType, setAddPaymentType] = useState<'official' | 'cash'>('official');

    // Statement matching
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
    const [isMatching, setIsMatching] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { showToast } = useToast();

    // ── Load payroll for selected month ────────────────
    useEffect(() => { loadPayroll(); }, [selectedMonth]);

    // ── Load all employees (including inactive) ────────
    useEffect(() => {
        (async () => {
            try {
                const q = query(collection(db, 'employees'), orderBy('fullName'));
                const snap = await getDocs(q);
                setAllEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeeData)));
            } catch (e) { console.error('Load employees failed', e); }
        })();
    }, []);

    const loadPayroll = async () => {
        setLoading(true);
        try {
            const data = await payrollService.getByMonth(selectedMonth);
            setRecords(data);
            setSelectedIds(new Set());
        } catch (error) {
            console.error(error);
            showToast('Ошибка загрузки ведомости', 'error');
        } finally { setLoading(false); }
    };

    // ── Generate payroll from active employees ─────────
    const handleGenerate = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'employees'), orderBy('fullName'));
            const snap = await getDocs(q);
            // Дедупликация по ФИО (берём первого активного, если есть дубли)
            const allEmps: EmployeeData[] = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as EmployeeData))
                .filter(e => e.status !== 'inactive');
            const seenNames = new Set<string>();
            const employees = allEmps.filter(e => {
                const key = (e.fullName || '').toLowerCase().trim();
                if (seenNames.has(key)) return false;
                seenNames.add(key);
                return true;
            });

            if (employees.length === 0) { showToast('Нет активных сотрудников', 'warning'); return; }

            const count = await payrollService.generatePayroll(selectedMonth, employees);
            showToast(`Ведомость сформирована: ${count} сотрудников`, 'success');
            loadPayroll();
        } catch (error) {
            console.error(error);
            showToast('Ошибка формирования ведомости', 'error');
        } finally { setLoading(false); }
    };

    // ── Import bank statement & match salary payments ──
    const handleImportStatement = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (records.length === 0) { showToast('Сначала сформируйте ведомость', 'warning'); return; }

        setIsMatching(true);
        setMatchResult(null);
        try {
            const transactions = await parseBankStatement(file);

            // Filter salary-related expense transactions
            const salaryTx = transactions.filter(t => {
                if (t.type !== 'expense') return false;
                const purpose = (t.purpose || '').toLowerCase();
                return SALARY_KEYWORDS.some(kw => purpose.includes(kw)) || isPersonName(t.partner);
            });

            if (salaryTx.length === 0) {
                showToast('В выписке не найдено зарплатных платежей', 'warning');
                return;
            }

            // Group by person (sum multiple payments for same person)
            const byPerson = new Map<string, { total: number; name: string; details: string[] }>();
            for (const tx of salaryTx) {
                const key = normalizeName(tx.partner);
                const cur = byPerson.get(key) || { total: 0, name: tx.partner, details: [] };
                cur.total += tx.amount;
                if (tx.purpose) cur.details.push(tx.purpose);
                byPerson.set(key, cur);
            }

            // Match with payroll records
            const matched: MatchResultItem[] = [];
            const unmatched: MatchResultItem[] = [];

            for (const [, payment] of byPerson) {
                const record = records.find(r => namesMatch(payment.name, r.employeeName));
                if (record) {
                    await payrollService.updateRecord(record.id, {
                        paid: true,
                        paidAmount: payment.total,
                        matchedFromStatement: true,
                        paidDate: new Date(),
                        statementDetails: payment.details.join('; '),
                    } as Partial<PayrollRecord>);
                    matched.push({ name: record.employeeName, amount: payment.total });
                } else {
                    unmatched.push({ name: payment.name, amount: payment.total });
                }
            }

            setMatchResult({ matched, unmatched });
            showToast(`Сопоставлено: ${matched.length} из ${matched.length + unmatched.length}`, 'success');
            loadPayroll();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при обработке выписки', 'error');
        } finally {
            setIsMatching(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Add employee to payroll manually ────────────────
    const handleAddEmployee = async () => {
        if (!addEmployeeId) return;
        const emp = allEmployees.find(e => e.id === addEmployeeId);
        if (!emp) return;
        if (records.some(r => r.employeeId === emp.id)) {
            showToast(`${emp.fullName} уже в ведомости`, 'warning');
            return;
        }
        try {
            await payrollService.addManualRecord({
                month: selectedMonth,
                employeeId: emp.id,
                employeeName: emp.fullName,
                position: emp.position,
                baseSalary: emp.salary || 0,
                paymentType: addPaymentType,
            });
            showToast(`${emp.fullName} добавлен в ведомость`, 'success');
            setShowAddForm(false);
            setAddEmployeeId('');
            loadPayroll();
        } catch { showToast('Ошибка добавления', 'error'); }
    };

    // ── Delete record ──────────────────────────────────
    const handleDeleteRecord = async (rec: PayrollRecord) => {
        if (!confirm(`Удалить ${rec.employeeName} из ведомости?`)) return;
        try {
            await payrollService.deleteRecord(rec.id);
            showToast(`${rec.employeeName} удалён`, 'success');
            loadPayroll();
        } catch { showToast('Ошибка удаления', 'error'); }
    };

    // ── Save inline edit ───────────────────────────────
    const handleSaveEdit = async (record: PayrollRecord) => {
        if (!editingCell) return;
        try {
            const updates: Partial<PayrollRecord> = {};
            if (editingCell.field === 'baseSalary') {
                updates.baseSalary = editValue;
                updates.totalDue = editValue + record.bonus;
            } else if (editingCell.field === 'bonus') {
                updates.bonus = editValue;
                updates.totalDue = record.baseSalary + editValue;
            } else if (editingCell.field === 'paidAmount') {
                updates.paidAmount = editValue;
                updates.paid = editValue > 0;
            }
            await payrollService.updateRecord(record.id, updates);
            setEditingCell(null);
            setRecords(prev => prev.map(r => {
                if (r.id !== record.id) return r;
                const u = { ...r, ...updates };
                if (updates.baseSalary !== undefined || updates.bonus !== undefined) {
                    u.totalDue = (updates.baseSalary ?? r.baseSalary) + (updates.bonus ?? r.bonus);
                }
                return u;
            }));
            showToast('Сохранено', 'success');
        } catch { showToast('Ошибка сохранения', 'error'); }
    };

    // ── Mark selected as paid manually (for cash employees) ──
    const handleMarkPaidManual = async () => {
        if (selectedIds.size === 0) return;
        try {
            const toMark = records.filter(r => selectedIds.has(r.id) && !r.paid);
            for (const rec of toMark) {
                await payrollService.updateRecord(rec.id, {
                    paid: true,
                    paidAmount: rec.totalDue,
                    paidDate: new Date(),
                } as Partial<PayrollRecord>);
            }
            showToast(`Отмечено как выплачено: ${toMark.length}`, 'success');
            setSelectedIds(new Set());
            loadPayroll();
        } catch { showToast('Ошибка', 'error'); }
    };

    // ── Selection helpers ──────────────────────────────
    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedIds(next);
    };
    const toggleSelectAll = () => {
        const unpaid = records.filter(r => !r.paid);
        setSelectedIds(selectedIds.size === unpaid.length ? new Set() : new Set(unpaid.map(r => r.id)));
    };

    // ── Summary ────────────────────────────────────────
    const summary = useMemo(() => {
        let totalDue = 0, totalPaid = 0, officialTotal = 0, cashTotal = 0;
        records.forEach(r => {
            totalDue += r.totalDue;
            totalPaid += r.paidAmount || 0;
            if (r.paymentType === 'official') officialTotal += r.totalDue;
            else cashTotal += r.totalDue;
        });
        return { totalDue, totalPaid, remaining: totalDue - totalPaid, officialTotal, cashTotal, count: records.length };
    }, [records]);

    // ── Month options ──────────────────────────────────
    const monthOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = -12; i <= 2; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            opts.push({ value: format(d, 'yyyy-MM'), label: format(d, 'LLLL yyyy', { locale: ru }) });
        }
        return opts;
    }, []);

    // Employees available to add (not already in payroll)
    const availableEmployees = useMemo(() => {
        const inPayroll = new Set(records.map(r => r.employeeId));
        return allEmployees.filter(e => !inPayroll.has(e.id));
    }, [allEmployees, records]);

    // ── Editable cell renderer ─────────────────────────
    const EditableCell = ({ record, field, value }: { record: PayrollRecord; field: 'baseSalary' | 'bonus' | 'paidAmount'; value: number }) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === field;
        if (isEditing) {
            return (
                <div className="flex items-center gap-1 justify-end">
                    <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(Number(e.target.value))}
                        className="w-24 border rounded px-2 py-1 text-sm text-right"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(record); if (e.key === 'Escape') setEditingCell(null); }}
                    />
                    <button onClick={() => handleSaveEdit(record)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">OK</button>
                    <button onClick={() => setEditingCell(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                </div>
            );
        }
        return (
            <span
                className="cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => { setEditingCell({ id: record.id, field }); setEditValue(value); }}
            >
                {value > 0 ? fmt(value) : '—'}
            </span>
        );
    };

    // ════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════
    return (
        <div className="space-y-6 pb-20">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">Ведомость заработной платы</h2>
                <div className="flex flex-wrap gap-2">
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-white border rounded-lg px-3 py-2 text-sm">
                        {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    {records.length === 0 && (
                        <button onClick={handleGenerate} disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                            <RefreshCw className="w-4 h-4" /> Сформировать
                        </button>
                    )}

                    {records.length > 0 && (
                        <>
                            <button onClick={() => fileInputRef.current?.click()} disabled={isMatching}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm">
                                <FileUp className="w-4 h-4" /> {isMatching ? 'Обработка...' : 'Загрузить выписку'}
                            </button>
                            <button onClick={() => setShowAddForm(!showAddForm)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                                <UserPlus className="w-4 h-4" /> Добавить
                            </button>
                        </>
                    )}
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportStatement} className="hidden" />
                </div>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Banknote className="w-4 h-4 text-blue-600" /></div>
                        <span className="text-xs text-gray-500">Начислено (ФОТ)</span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">{fmt(summary.totalDue)} &#8376;</div>
                    <div className="text-xs text-gray-400 mt-1">ТОО: {fmt(summary.officialTotal)} | Нал: {fmt(summary.cashTotal)}</div>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
                        <span className="text-xs text-gray-500">Выплачено</span>
                    </div>
                    <div className="text-xl font-bold text-emerald-600">{fmt(summary.totalPaid)} &#8376;</div>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Clock className="w-4 h-4 text-amber-600" /></div>
                        <span className="text-xs text-gray-500">Остаток к выплате</span>
                    </div>
                    <div className="text-xl font-bold text-amber-600">{fmt(summary.remaining)} &#8376;</div>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><Users className="w-4 h-4 text-violet-600" /></div>
                        <span className="text-xs text-gray-500">Сотрудников</span>
                    </div>
                    <div className="text-xl font-bold text-gray-900">{summary.count}</div>
                </div>
            </div>

            {/* ── Match Results Banner ── */}
            {matchResult && (
                <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Результат сопоставления с выпиской</h3>
                        <button onClick={() => setMatchResult(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                    {matchResult.matched.length > 0 && (
                        <div className="space-y-1">
                            {matchResult.matched.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span className="text-gray-700">{m.name}</span>
                                    <span className="text-emerald-600 font-medium ml-auto">{fmt(m.amount)} &#8376;</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {matchResult.unmatched.length > 0 && (
                        <div className="space-y-1 pt-2 border-t">
                            <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Не найдены в ведомости:</p>
                            {matchResult.unmatched.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                    <X className="w-4 h-4 text-red-400 shrink-0" />
                                    <span className="text-gray-500">{m.name}</span>
                                    <span className="text-gray-400 font-medium ml-auto">{fmt(m.amount)} &#8376;</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Add Employee Form ── */}
            {showAddForm && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Сотрудник</label>
                        <select value={addEmployeeId} onChange={e => setAddEmployeeId(e.target.value)}
                            className="w-full bg-white border rounded-lg px-3 py-2 text-sm">
                            <option value="">Выберите сотрудника...</option>
                            {availableEmployees.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.fullName} — {e.position || 'Без должности'}
                                    {e.status === 'inactive' ? ' (уволен)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Тип выплаты</label>
                        <select value={addPaymentType} onChange={e => setAddPaymentType(e.target.value as 'official' | 'cash')}
                            className="bg-white border rounded-lg px-3 py-2 text-sm">
                            <option value="official">Официально (ТОО)</option>
                            <option value="cash">Наличные</option>
                        </select>
                    </div>
                    <button onClick={handleAddEmployee}
                        className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                        <UserPlus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={() => { setShowAddForm(false); setAddEmployeeId(''); }}
                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm">Отмена</button>
                </div>
            )}

            {/* ── Action Bar (selection) ── */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl flex-wrap">
                    <span className="text-sm text-gray-600">Выбрано: {selectedIds.size}</span>
                    <button onClick={handleMarkPaidManual}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> Отметить выплату (вручную)
                    </button>
                </div>
            )}

            {/* ── Table ── */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        Загрузка...
                    </div>
                ) : records.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium">Нет ведомости за {monthOptions.find(o => o.value === selectedMonth)?.label || selectedMonth}</p>
                        <p className="text-sm mt-1">Нажмите «Сформировать» для создания</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                <tr>
                                    <th className="px-3 py-3 w-10">
                                        <button onClick={toggleSelectAll}>
                                            {selectedIds.size === records.filter(r => !r.paid).length && records.some(r => !r.paid)
                                                ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                                : <Square className="w-5 h-5 text-gray-300" />}
                                        </button>
                                    </th>
                                    <th className="px-3 py-3">ФИО</th>
                                    <th className="px-3 py-3">Должность</th>
                                    <th className="px-3 py-3">Тип</th>
                                    <th className="px-3 py-3 text-right">Начислено</th>
                                    <th className="px-3 py-3 text-right">Премия</th>
                                    <th className="px-3 py-3 text-right">К выплате</th>
                                    <th className="px-3 py-3 text-right">Выплачено</th>
                                    <th className="px-3 py-3 text-right">Остаток</th>
                                    <th className="px-3 py-3 text-center">Статус</th>
                                    <th className="px-3 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {records.map(r => {
                                    const remaining = r.totalDue - (r.paidAmount || 0);
                                    return (
                                        <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${r.paid ? 'bg-emerald-50/30' : ''}`}>
                                            <td className="px-3 py-3">
                                                {!r.paid && (
                                                    <button onClick={() => toggleSelect(r.id)}>
                                                        {selectedIds.has(r.id)
                                                            ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                                            : <Square className="w-5 h-5 text-gray-300" />}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 font-medium text-gray-900">{r.employeeName}</td>
                                            <td className="px-3 py-3 text-gray-600">{r.position || '—'}</td>
                                            <td className="px-3 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.paymentType === 'official' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {r.paymentType === 'official' ? 'ТОО' : 'Нал.'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-700">
                                                <EditableCell record={r} field="baseSalary" value={r.baseSalary} />
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <EditableCell record={r} field="bonus" value={r.bonus} />
                                            </td>
                                            <td className="px-3 py-3 text-right font-bold text-gray-900">{fmt(r.totalDue)} &#8376;</td>
                                            <td className="px-3 py-3 text-right">
                                                <EditableCell record={r} field="paidAmount" value={r.paidAmount || 0} />
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                                                    {remaining > 0 ? fmt(remaining) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {r.paid ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium" title={r.matchedFromStatement ? 'Из выписки' : 'Вручную'}>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        {r.matchedFromStatement ? 'Выписка' : 'Выплачено'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-amber-500 text-xs font-medium">
                                                        <Clock className="w-4 h-4" /> Ожидает
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <button onClick={() => handleDeleteRecord(r)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors" title="Удалить из ведомости">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                                <tr>
                                    <td colSpan={4} className="px-3 py-3 text-gray-700">ИТОГО</td>
                                    <td className="px-3 py-3 text-right text-gray-700">{fmt(records.reduce((s, r) => s + r.baseSalary, 0))}</td>
                                    <td className="px-3 py-3 text-right text-gray-700">{fmt(records.reduce((s, r) => s + r.bonus, 0))}</td>
                                    <td className="px-3 py-3 text-right text-gray-900">{fmt(summary.totalDue)} &#8376;</td>
                                    <td className="px-3 py-3 text-right text-emerald-600">{fmt(summary.totalPaid)} &#8376;</td>
                                    <td className="px-3 py-3 text-right text-amber-600">{fmt(summary.remaining)} &#8376;</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Cash employees hint ── */}
            {records.some(r => r.paymentType === 'cash' && !r.paid) && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                        <p className="font-medium">Есть сотрудники на наличном расчёте</p>
                        <p className="text-amber-600 mt-1">
                            Выберите их галочкой и нажмите «Отметить выплату» вручную — парсер выписки их не найдёт.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
