import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  ChevronDown, ChevronUp,
  AlertTriangle, Loader2, FileSpreadsheet, Eye,
  ArrowRight,
} from 'lucide-react';
import { parseXlsxFile } from '../../services/import/xlsxParser';
import { mapSheet } from '../../services/import/mappers';
import { writeAllSheets } from '../../services/import/firestoreWriter';
import type { RecognizedSheet, MappedSheet, ImportResult, ImportStatus } from '../../services/import/types';

function StatusBadge({ status }: { status: ImportStatus }) {
  const map: Record<ImportStatus, { label: string; color: string }> = {
    idle: { label: 'Ожидание', color: 'bg-gray-100 text-gray-600' },
    parsing: { label: 'Анализ файла…', color: 'bg-blue-100 text-blue-700' },
    preview: { label: 'Готов к импорту', color: 'bg-amber-100 text-amber-700' },
    importing: { label: 'Импортируем…', color: 'bg-blue-100 text-blue-700' },
    done: { label: 'Готово', color: 'bg-green-100 text-green-700' },
    error: { label: 'Ошибка', color: 'bg-red-100 text-red-700' },
  };
  const { label, color } = map[status];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>{label}</span>
  );
}

interface FirestoreTimestamp {
  seconds: number;
}

function renderCellValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object' && v !== null && 'seconds' in v) {
    return new Date((v as FirestoreTimestamp).seconds * 1000).toLocaleDateString('ru-RU');
  }
  return String(v);
}

interface SheetRowProps {
  sheet: RecognizedSheet;
  mapped?: MappedSheet;
  selected: boolean;
  onToggle: () => void;
}

function SheetRow({ sheet, mapped, selected, onToggle }: SheetRowProps) {
  const [open, setOpen] = useState(false);
  const cols = sheet.config.collections;

  return (
    <div className={`border rounded-xl transition-all ${selected ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-3 p-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{sheet.sheetName}</span>
            <span className="text-xs text-gray-500">→</span>
            <span className="text-xs font-medium text-blue-700">{sheet.config.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-500">{sheet.dataRowCount.toLocaleString('ru')} строк</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">{cols.join(', ')}</span>
          </div>
        </div>
        {mapped && (
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Превью
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && mapped && mapped.previewRows.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 pb-4 pt-3 overflow-x-auto">
              <table className="text-xs w-full min-w-max">
                <thead>
                  <tr className="text-gray-400">
                    {Object.keys(mapped.previewRows[0]).slice(0, 8).map(k => (
                      <th key={k} className="text-left px-2 py-1 font-medium whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapped.previewRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      {Object.values(row).slice(0, 8).map((v, j) => (
                        <td key={j} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                          {renderCellValue(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ImportPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [recognized, setRecognized] = useState<RecognizedSheet[]>([]);
  const [mapped, setMapped] = useState<MappedSheet[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [currentOp, setCurrentOp] = useState('');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setFileName(file.name);
    setStatus('parsing');
    setError('');
    setRecognized([]);
    setMapped([]);
    setSelected(new Set());
    setResults([]);

    try {
      const buf = await file.arrayBuffer();
      const sheets = parseXlsxFile(buf);

      if (sheets.length === 0) {
        setError('Не удалось распознать ни одного листа. Убедитесь, что файл — выгрузка FixPlast.');
        setStatus('error');
        return;
      }

      const mappedSheets = sheets.map(s => mapSheet(s));

      setRecognized(sheets);
      setMapped(mappedSheets);
      setSelected(new Set(sheets.map(s => s.sheetName)));
      setStatus('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при разборе файла');
      setStatus('error');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: status === 'importing',
  });

  function toggleSheet(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === recognized.length) setSelected(new Set());
    else setSelected(new Set(recognized.map(s => s.sheetName)));
  }

  async function handleImport() {
    const sheetsToWrite = mapped.filter(m => selected.has(m.sheetName));
    if (sheetsToWrite.length === 0) return;

    setStatus('importing');
    setProgress(0);
    setResults([]);

    try {
      const allResults = await writeAllSheets(sheetsToWrite, (overall, detail) => {
        setProgress(overall);
        setCurrentOp(`${detail.collection}: ${detail.processed}/${detail.total}`);
      });
      setResults(allResults);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при записи в Firestore');
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle');
    setFileName('');
    setRecognized([]);
    setMapped([]);
    setSelected(new Set());
    setProgress(0);
    setResults([]);
    setError('');
  }

  const totalDocs = mapped
    .filter(m => selected.has(m.sheetName))
    .reduce((s, m) => s + m.collections.reduce((s2, c) => s2 + c.docs.length, 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-[#1a365d] text-white px-4 pt-6 pb-8 md:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest">Fix Plast Group</p>
              <h1 className="text-2xl font-bold mt-0.5">Импорт данных</h1>
            </div>
            <StatusBadge status={status} />
          </div>
          <p className="text-white/50 text-sm mt-2">
            Загрузите xlsx-файл выгрузки из Google Sheets FixPlast
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-8 -mt-4 space-y-4">

        {(status === 'idle' || status === 'error') && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div
              {...getRootProps()}
              className={`
                flex flex-col items-center justify-center gap-4 p-12 cursor-pointer
                transition-all border-2 border-dashed rounded-2xl m-4
                ${isDragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                }
              `}
            >
              <input {...getInputProps()} />
              <div className={`p-4 rounded-2xl ${isDragActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <FileSpreadsheet className={`w-10 h-10 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-700">
                  {isDragActive ? 'Отпустите файл' : 'Перетащите xlsx-файл сюда'}
                </p>
                <p className="text-sm text-gray-400 mt-1">или нажмите для выбора</p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">.xlsx</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">.xls</span>
              </div>
            </div>

            {status === 'error' && error && (
              <div className="mx-4 mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </motion.div>
        )}

        {status === 'parsing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-gray-700">Анализируем файл…</p>
              <p className="text-sm text-gray-400 mt-1">{fileName}</p>
            </div>
          </motion.div>
        )}

        {(status === 'preview' || status === 'importing' || status === 'done') && recognized.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Распознанные листы</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fileName} · {recognized.length} листов
                </p>
              </div>
              {status === 'preview' && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  {selected.size === recognized.length ? 'Снять все' : 'Выбрать все'}
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {recognized.map(sheet => (
                <SheetRow
                  key={sheet.sheetName}
                  sheet={sheet}
                  mapped={mapped.find(m => m.sheetName === sheet.sheetName)}
                  selected={selected.has(sheet.sheetName)}
                  onToggle={() => status === 'preview' && toggleSheet(sheet.sheetName)}
                />
              ))}
            </div>

            {status === 'preview' && (
              <div className="p-4 pt-0">
                <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {selected.size} листов · ~{totalDocs.toLocaleString('ru')} документов
                  </p>
                  <button
                    onClick={handleImport}
                    disabled={selected.size === 0}
                    className="flex items-center gap-2 bg-[#1a365d] hover:bg-[#2d4a7a] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Импортировать
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {status === 'importing' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <p className="font-semibold text-gray-900">Запись в Firestore…</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <motion.div
                className="bg-blue-500 h-2 rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">{currentOp}</p>
              <p className="text-xs font-semibold text-gray-700">{progress}%</p>
            </div>
          </motion.div>
        )}

        {status === 'done' && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden"
          >
            <div className="p-5 border-b border-green-100 bg-green-50 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Импорт завершён</p>
                <p className="text-sm text-green-700">
                  Всего записано: {results.reduce((s, r) => s + r.inserted, 0).toLocaleString('ru')} документов
                </p>
              </div>
            </div>

            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Коллекция</th>
                    <th className="text-right py-2 font-medium">Добавлено</th>
                    <th className="text-right py-2 font-medium">Пропущено</th>
                    <th className="text-right py-2 font-medium">Ошибок</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.map(r => (
                    <tr key={r.collection}>
                      <td className="py-2.5 font-medium text-gray-800">{r.collection}</td>
                      <td className="py-2.5 text-right text-green-700 font-semibold">{r.inserted.toLocaleString('ru')}</td>
                      <td className="py-2.5 text-right text-gray-400">{r.skipped.toLocaleString('ru')}</td>
                      <td className="py-2.5 text-right text-red-500">{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 pt-0">
              <button
                onClick={reset}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Загрузить ещё один файл
              </button>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
