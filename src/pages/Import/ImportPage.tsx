import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertTriangle, CheckCircle, FileSpreadsheet, Info, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts';
import {
  addViewer, invalidateReportData, listViewers, parseReportWorkbook, removeViewer, saveReportData, summarize, validateInput,
  type DataSummary, type Issue, type ParsedWorkbook, type ReportMeta, type Viewer,
} from '../../services/reports';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

function IssueRow({ issue }: { issue: Issue }) {
  const Icon = issue.level === 'error' ? XCircle : issue.level === 'warn' ? AlertTriangle : Info;
  const color = issue.level === 'error' ? 'text-red-600' : issue.level === 'warn' ? 'text-amber-600' : 'text-blue-600';
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`w-5 h-5 flex-none mt-0.5 ${color}`} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">
          {issue.title}
          {issue.amount ? <span className="ml-2 text-gray-500 font-normal">{fmt(issue.amount)} ₸</span> : null}
        </div>
        {issue.detail && <div className="text-sm text-gray-500 mt-0.5">{issue.detail}</div>}
      </div>
    </li>
  );
}

function ViewersCard({ adder }: { adder: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => { listViewers().then(setViewers).catch(e => setErr(e instanceof Error ? e.message : 'Ошибка')); }, []);
  useEffect(load, [load]);

  async function add() {
    setErr('');
    try { await addViewer(email, adder); setEmail(''); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
  }
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-4">
      <div className="text-sm font-semibold text-gray-900">Кто видит отчёты</div>
      <p className="text-sm text-gray-500 mt-1">
        Добавьте почту учредителя — и он увидит ОПиУ и ДДС по ссылке <b>/reports</b>. Аккаунт для входа создаётся отдельно
        в Firebase Console → Authentication → Add user.
      </p>
      <ul className="mt-3 divide-y divide-gray-100">
        {viewers.map(v => (
          <li key={v.email} className="flex items-center justify-between py-2 text-sm">
            <span className="text-gray-800">{v.email}</span>
            <button onClick={() => removeViewer(v.email).then(load)} className="text-gray-400 hover:text-red-600 text-xs">убрать</button>
          </li>
        ))}
        {viewers.length === 0 && <li className="py-2 text-sm text-gray-400">Пока никого</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="почта@учредителя" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button onClick={add} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">Добавить</button>
      </div>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </div>
  );
}

export function ImportPage() {
  const { appUser } = useAuth();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState<'parse' | 'save' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState<ReportMeta | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(''); setDone(null); setParsed(null); setBusy('parse'); setFileName(file.name);
    try {
      const p = parseReportWorkbook(await file.arrayBuffer());
      setParsed(p);
      setSummary(summarize(p.input));
      setIssues([
        ...p.dropped.map((d): Issue => ({
          level: 'warn', title: `«${d.sheet}»: ${d.count} строк с непонятной датой — не загружены`,
          detail: `Исправьте дату в таблице. Примеры: ${d.examples.join('; ')}`,
        })),
        ...validateInput(p.input),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    } finally {
      setBusy(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
  });

  const hasErrors = issues.some(i => i.level === 'error') || (parsed?.missing.length ?? 0) > 0;

  async function save() {
    if (!parsed) return;
    setBusy('save'); setProgress(0); setError('');
    try {
      const meta = await saveReportData(parsed.input, { importedBy: appUser?.email || '', fileName },
        (d, t) => setProgress(Math.round((d / t) * 100)));
      invalidateReportData();
      setDone(meta);
    } catch (e) {
      console.error('Импорт не удался', e);
      setError(e instanceof Error ? e.message : 'Не удалось сохранить данные');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Импорт данных</h1>
        <p className="text-gray-500 mt-1">
          Загрузите Google-таблицу «FixPlast Ввод данных» (Файл → Скачать → .xlsx). Данные в приложении
          полностью заменятся данными из файла — таблица остаётся источником правды.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-white'
        }`}
      >
        <input {...getInputProps()} />
        {busy === 'parse' ? (
          <Loader2 className="w-10 h-10 mx-auto text-blue-500 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-400" />
        )}
        <p className="mt-3 font-medium text-gray-700">{fileName || 'Перетащите .xlsx сюда или нажмите для выбора'}</p>
      </div>


      {parsed && summary && (
        <>
          {parsed.missing.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
              В файле нет обязательных листов: <b>{parsed.missing.join(', ')}</b>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { t: 'Банк', n: summary.bank.count, r: `${summary.bank.from} … ${summary.bank.to}` },
              { t: 'Касса (Сделки)', n: summary.cash.count, r: `${summary.cash.from} … ${summary.cash.to}` },
              { t: 'Продажи 1С', n: summary.sales.count, r: `${summary.sales.from} … ${summary.sales.to}` },
            ].map(c => (
              <div key={c.t} className="rounded-xl bg-white border border-gray-200 p-4">
                <div className="text-sm text-gray-500">{c.t}</div>
                <div className="text-2xl font-bold text-gray-900">{fmt(c.n)}</div>
                <div className="text-xs text-gray-400 mt-1">{c.r}</div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-500">
            Выручка без НДС по продажам: <b className="text-gray-900">{fmt(summary.sales.revenueNet)} ₸</b>
          </div>

          {parsed.usedWalletFallback && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm">
              В файле нет листа «Кошельки» (начальные остатки кассы и подотчётников). Использованы временные значения —
              остатки подотчётников могут немного отличаться от таблицы.
            </div>
          )}

          {issues.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-200 px-4">
              <div className="pt-4 text-sm font-semibold text-gray-900">Что проверить в данных</div>
              <ul className="divide-y divide-gray-100">{issues.map((i, k) => <IssueRow key={k} issue={i} />)}</ul>
            </div>
          )}

          {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm">{error}</div>}

          {done ? (
            <div className="rounded-xl bg-green-50 border border-green-200 text-green-800 p-4 flex gap-3 items-start">
              <CheckCircle className="w-5 h-5 flex-none mt-0.5" />
              <div className="text-sm">
                Данные загружены: банк {fmt(done.counts.bank)}, касса {fmt(done.counts.cash)}, продажи {fmt(done.counts.sales)}.
                Отчёты ОПиУ и ДДС уже построены на них.
              </div>
            </div>
          ) : (
            <button
              onClick={save}
              disabled={busy !== null || hasErrors}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {busy === 'save' ? `Загружаем… ${progress}%` : 'Загрузить в приложение'}
            </button>
          )}
        </>
      )}

      {appUser?.role === 'owner' && <ViewersCard adder={appUser.email || ''} />}
    </div>
  );
}
