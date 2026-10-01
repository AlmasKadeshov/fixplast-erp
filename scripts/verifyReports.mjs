#!/usr/bin/env node
/**
 * Сверка движка отчётов (src/services/reports) с эталоном — готовыми листами «ОПИУ» и «ДДС»
 * в Google-таблице, выгруженной в .xlsx.
 *
 *   node scripts/verifyReports.mjs [путь.xlsx]
 *
 * Лист «ОПИУ» в таблице построен по статичной цене сырья (колонка «Себес»),
 * поэтому сверка идёт в режиме costMode: 'static'. Помесячный режим считается отдельно.
 */
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const file = process.argv[2] || '../fixplast_GAS/FixPlast Ввод данных .xlsx';

mkdirSync('node_modules/.cache', { recursive: true });
const out = join(process.cwd(), 'node_modules/.cache', `reports-verify-${process.pid}.mjs`);
await build({ entryPoints: ['src/services/reports/engine.ts'], bundle: true, platform: 'node', format: 'esm', external: ['xlsx'], outfile: out, logLevel: 'error' });
const R = await import(pathToFileURL(out).href);

const names = ['Журнал_Банк', 'Сделки', 'Продажи_1С', 'Продажи_1С_физлица', 'ОПИУ', 'ДДС', 'Себестоимость',
  'Цены_Сырья_История', 'ЗП_Производство', 'ЗП_Офис', 'Бонусы_Менеджеры', 'Коммунальные_Завод', 'ОС_справочник', 'Остатки'];
const wb = XLSX.readFile(file, { sheets: names, dense: true });
const sheet = n => {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true });
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
};

const input = {
  bank: R.parseBank(sheet('Журнал_Банк')),
  cash: R.parseCash(sheet('Сделки')),
  sales: [...R.parseSalesLegal(sheet('Продажи_1С')), ...R.parseSalesPhysical(sheet('Продажи_1С_физлица'))],
  settings: R.buildSettings({
    cost: sheet('Себестоимость'), prices: sheet('Цены_Сырья_История'), zpProd: sheet('ЗП_Производство'),
    zpOffice: sheet('ЗП_Офис'), bonuses: sheet('Бонусы_Менеджеры'), utilities: sheet('Коммунальные_Завод'),
    assets: sheet('ОС_справочник'), balances: sheet('Остатки'),
  }),
};
console.log(`Строк: банк ${input.bank.length}, касса ${input.cash.length}, продажи ${input.sales.length}`);

function golden(name) {
  const rows = sheet(name);
  const hdr = rows.findIndex(r => String(r[0]).trim() === 'Статья');
  const g = {};
  for (const r of rows.slice(hdr + 1)) {
    const l = String(r[0]).trim();
    if (l) g[l] = r.slice(1, 11).map(v => (typeof v === 'number' ? Math.round(v) : 0));
  }
  return g;
}

let bad = 0, ok = 0;
function compare(title, months, rows, gold) {
  console.log(`\n=== ${title}`);
  for (const row of rows) {
    if (row.kind === 'header' || row.kind === 'percent') continue;
    const g = gold[row.label];
    if (!g) { console.log('  нет в эталоне:', row.label); bad++; continue; }
    const diffs = [];
    months.forEach((m, i) => {
      const mi = parseInt(m.slice(5), 10) - 1;
      const v = Math.round(row.values[i]);
      if (Math.abs(v - (g[mi] || 0)) > 1) diffs.push(`${R.monthLabel(m)}: ${v} вместо ${g[mi] || 0}`);
    });
    if (diffs.length) { bad++; console.log('  ✗', row.label, '\n     ', diffs.join('; ')); } else ok++;
  }
}

const opiu = R.buildOpiu(input, { costMode: 'static' });
compare('ОПиУ (себестоимость по статичной цене)', opiu.months, opiu.rows, golden('ОПИУ'));
const dds = R.buildDds(input, '2026-09');
compare('ДДС', dds.months, [...dds.sections.flatMap(s => [...s.rows, s.total]), dds.netFlow], golden('ДДС'));

const monthly = R.buildOpiu(input, { costMode: 'monthly' });
console.log(`\nСырьё: статичная ${Math.round(-opiu.rows.find(r => r.key === 'costRaw').total).toLocaleString('ru')} ₸ · помесячная ${Math.round(-monthly.rows.find(r => r.key === 'costRaw').total).toLocaleString('ru')} ₸`);
console.log(`\nСтрок совпало: ${ok}, расхождений: ${bad}`);
process.exit(bad ? 1 : 0);
