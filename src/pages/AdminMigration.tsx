// @ts-nocheck — страница миграции, адаптируется под FixPlast
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { recreateLaFamiliaHierarchy } from '../utils/initProjectHierarchy';
import { financeService } from '../services/finance.service';
import { projectsService } from '../services/projects.service';

// Данные контрактов
const CONTRACT_DATA: Array<{ nameContains: string; contractNumber: string; contractAmount: number }> = [
    // Школа Кошкарбаева
    { nameContains: 'ТМЦ поставка',      contractNumber: '08-ASB/POS',  contractAmount: 22_790_056 },
    { nameContains: 'ТМЦ поставка -ОВК', contractNumber: '08-ASB/POS',  contractAmount: 22_790_056 },
    { nameContains: 'СМР - ОВК',         contractNumber: '08-ASB/POD',  contractAmount: 34_209_945 },
    { nameContains: 'CМР - ОВК',         contractNumber: '08-ASB/POD',  contractAmount: 34_209_945 },
    // La Familia — Блок А
    { nameContains: 'Блок А (СМР',       contractNumber: '06-12-SS25 Доп.№1',  contractAmount: 22_756_273 },
    { nameContains: 'Блок А (ОВК)',       contractNumber: '10/01-08-TS Доп.№5', contractAmount: 100_415_173 },
    // La Familia — НВК
    { nameContains: 'НВК - СМР',          contractNumber: '',                    contractAmount: 35_815_739 },
    { nameContains: 'НВК — СМР',          contractNumber: '',                    contractAmount: 35_815_739 },
    { nameContains: 'НВК поставка',        contractNumber: '13-08-TS',            contractAmount: 38_836_789 },
    // La Familia — Блок Б
    { nameContains: 'Блок Б (СМР',        contractNumber: '',                    contractAmount: 21_435_450 },
];

interface MigrationResult {
    success: boolean;
    message: string;
    deletedCount: number;
    createdCount: number;
}

export function AdminMigration() {
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<MigrationResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const runMigration = async () => {
        if (!confirm('⚠️ Это удалит ВСЕ существующие проекты! Продолжить?')) {
            return;
        }

        setIsRunning(true);
        setResult(null);
        setLogs([]);

        // Перехватываем console.log
        const originalLog = console.log;
        console.log = (...args) => {
            originalLog(...args);
            setLogs((prev) => [...prev, args.map(String).join(' ')]);
        };

        try {
            const migrationResult = await recreateLaFamiliaHierarchy();
            setResult(migrationResult);
        } catch (error) {
            setResult({
                success: false,
                message: error instanceof Error ? error.message : String(error),
                deletedCount: 0,
                createdCount: 0,
            });
        } finally {
            console.log = originalLog;
            setIsRunning(false);
        }
    };

    const [opiuMigrating, setOpiuMigrating] = useState(false);
    const [opiuResult, setOpiuResult] = useState<string | null>(null);

    const [contractMigrating, setContractMigrating] = useState(false);
    const [contractResult, setContractResult] = useState<string | null>(null);

    const runContractMigration = async () => {
        if (!confirm('Обновить суммы контрактов для Школы Кошкарбаева?')) return;
        setContractMigrating(true);
        setContractResult(null);
        try {
            const allProjects = await projectsService.getAll();
            let updated = 0;
            for (const project of allProjects) {
                const match = CONTRACT_DATA.find(c =>
                    project.name.toLowerCase().includes(c.nameContains.toLowerCase())
                );
                if (match) {
                    await projectsService.update(project.id, {
                        contractAmount: match.contractAmount,
                        contractNumber: match.contractNumber,
                    });
                    updated++;
                }
            }
            setContractResult(`✅ Обновлено ${updated} проектов`);
        } catch (error) {
            setContractResult(`❌ Ошибка: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setContractMigrating(false);
        }
    };

    const runOpiuMigration = async () => {
        if (!confirm('Обновить категории для ОПиУ?\n\n1. CLIENT_PAYMENT → IGNORE (выручка только по актам)\n2. SALARY_AUP → IGNORE (ЗП только по ведомости)\n3. 1С income транзакции: CLIENT_PAYMENT → CLIENT_REVENUE')) {
            return;
        }
        setOpiuMigrating(true);
        setOpiuResult(null);
        try {
            await financeService.migrateCostItemsOpiuCategory();
            const txResult = await financeService.migrate1cIncomeCategory();
            setOpiuResult(`✅ Готово! CostItems обновлены. Транзакции: ${txResult.updated} из ${txResult.total} обновлены.`);
        } catch (error) {
            setOpiuResult(`❌ Ошибка: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setOpiuMigrating(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
                Миграция: Иерархия проектов
            </h1>

            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg mb-6">
                    <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-amber-800">Внимание!</p>
                        <p className="text-sm text-amber-700">
                            Эта операция <strong>удалит все существующие проекты</strong> и создаст новую структуру La Familia.
                        </p>
                    </div>
                </div>

                <h2 className="text-lg font-semibold mb-4">Будет создана структура:</h2>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm mb-6 font-mono">
                    {`🏙 ЖК La Familia
├── 💧 НВК - Наружные сети
│   ├── 📦 НВК - ТМЦ
│   └── 🚜 НВК - СМР
├── 🏠 Блок Б
│   └── 🔥 ОВК
│       ├── 📦 ОВК - ТМЦ
│       └── 🔨 ОВК - СМР
└── 🏗 Блок А
    └── 🔥 ОВК
        ├── 📦 ОВК - ТМЦ
        └── 🔨 ОВК - СМР`}
                </pre>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={runMigration}
                    disabled={isRunning}
                    className={`
            w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2
            ${isRunning
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }
          `}
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Выполняется...
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5" />
                            Удалить всё и создать заново
                        </>
                    )}
                </motion.button>
            </div>

            {/* Logs */}
            {logs.length > 0 && (
                <div className="bg-gray-900 rounded-xl p-4 mb-6 max-h-80 overflow-y-auto">
                    <h3 className="text-white font-medium mb-2">Лог выполнения:</h3>
                    <div className="font-mono text-sm text-green-400 space-y-1">
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* ОПиУ Migration */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">Миграция ОПиУ: Метод начислений</h2>
                <p className="text-sm text-gray-600 mb-4">
                    Убирает банковские поступления и ЗП из ОПиУ. Выручка будет считаться по актам из 1С, зарплата — по ведомости.
                </p>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={runOpiuMigration}
                    disabled={opiuMigrating}
                    className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                        opiuMigrating
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {opiuMigrating ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Выполняется...</>
                    ) : (
                        <><RefreshCw className="w-5 h-5" /> Запустить миграцию ОПиУ</>
                    )}
                </motion.button>
                {opiuResult && (
                    <p className={`mt-3 text-sm ${opiuResult.startsWith('✅') ? 'text-green-700' : 'text-red-700'}`}>
                        {opiuResult}
                    </p>
                )}
            </div>

            {/* Контракты */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <h2 className="text-lg font-semibold mb-2">Суммы контрактов по проектам</h2>
                <p className="text-sm text-gray-600 mb-3">
                    Обновит суммы и номера договоров для подпроектов:
                </p>
                <ul className="text-sm text-gray-700 mb-4 space-y-1 bg-gray-50 rounded-lg p-3">
                    <li className="font-medium text-gray-500 mb-1">Школа Кошкарбаева:</li>
                    <li>• ТМЦ поставка -ОВК → <strong>22 790 056 ₸</strong> (№ 08-ASB/POS)</li>
                    <li>• СМР - ОВК → <strong>34 209 945 ₸</strong> (№ 08-ASB/POD)</li>
                    <li className="font-medium text-gray-500 mt-2 mb-1">La Familia — Блок А:</li>
                    <li>• Блок А (СМР) → <strong>22 756 273 ₸</strong> (№ 06-12-SS25 Доп.№1)</li>
                    <li>• Блок А (ОВК) → <strong>100 415 173 ₸</strong> (№ 10/01-08-TS Доп.№5)</li>
                    <li className="font-medium text-gray-500 mt-2 mb-1">La Familia — НВК и Блок Б:</li>
                    <li>• НВК - СМР → <strong>35 815 739 ₸</strong></li>
                    <li>• НВК поставка ТМЦ → <strong>38 836 789 ₸</strong> (№ 13-08-TS)</li>
                    <li>• Блок Б (СМР) → <strong>21 435 450 ₸</strong></li>
                </ul>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={runContractMigration}
                    disabled={contractMigrating}
                    className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                        contractMigrating
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                >
                    {contractMigrating ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Обновляю...</>
                    ) : (
                        <><RefreshCw className="w-5 h-5" /> Обновить суммы контрактов</>
                    )}
                </motion.button>
                {contractResult && (
                    <p className={`mt-3 text-sm ${contractResult.startsWith('✅') ? 'text-green-700' : 'text-red-700'}`}>
                        {contractResult}
                    </p>
                )}
            </div>

            {/* Result */}
            {result && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`
            rounded-xl p-4 flex items-start gap-3
            ${result.success ? 'bg-green-50' : 'bg-red-50'}
          `}
                >
                    {result.success ? (
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : (
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    )}
                    <div>
                        <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                            {result.message}
                        </p>
                        {result.success && (
                            <p className="text-sm text-gray-600 mt-1">
                                Удалено: {result.deletedCount} | Создано: {result.createdCount}
                            </p>
                        )}
                        {result.success && (
                            <a
                                href="/projects"
                                className="inline-block mt-3 text-sm text-blue-600 hover:underline"
                            >
                                → Перейти к проектам
                            </a>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
