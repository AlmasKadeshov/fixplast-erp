// @ts-nocheck
/**
 * seed-all.ts — оркестратор импорта данных в Firestore
 * Запуск: npm run seed
 */
import { existsSync, readdirSync } from 'fs';
import path from 'path';

const SEED_DIR = path.resolve(process.cwd(), 'seed-data');

function checkSeedDir(): boolean {
  if (!existsSync(SEED_DIR)) {
    console.error('❌ Папка seed-data/ не найдена');
    return false;
  }
  const files = readdirSync(SEED_DIR).filter(f => f !== '.gitkeep' && f !== 'README.md');
  if (files.length === 0) {
    console.log('');
    console.log('⚠️  seed-data/ пустая, положите CSV-файлы согласно seed-data/README.md');
    console.log('');
    console.log('Ожидаемые файлы:');
    console.log('  📄 Журнал_Банк.csv     — банковские транзакции');
    console.log('  📄 Счета.csv            — банковские счета и кассы');
    console.log('  📄 Категории.csv        — справочник статей');
    console.log('  📄 Сделки.csv           — продажи и выручка');
    console.log('  📄 Себестоимость.csv    — себестоимость номенклатуры');
    console.log('  📄 Займы.csv            — выданные займы');
    console.log('  📄 ReEstr_OS_FixPlast_Group.xlsx — реестр основных средств');
    console.log('');
    console.log('После добавления файлов повторно запустите: npm run seed');
    console.log('');
    return false;
  }
  return true;
}

async function runSeed() {
  console.log('🚀 FixPlast ERP — Импорт данных в Firestore');
  console.log('============================================');
  console.log('');

  if (!checkSeedDir()) {
    process.exit(0);
  }

  const steps = [
    { name: 'Счета', file: 'import-accounts' },
    { name: 'Категории', file: 'import-categories' },
    { name: 'Транзакции (Журнал_Банк)', file: 'import-transactions' },
    { name: 'Продажи (Сделки)', file: 'import-sales' },
    { name: 'Себестоимость', file: 'import-cost-items' },
    { name: 'Займы', file: 'import-loans' },
    { name: 'Основные средства', file: 'import-fixed-assets' },
  ];

  let ok = 0;
  let failed = 0;

  for (const step of steps) {
    process.stdout.write(`⏳ ${step.name}... `);
    try {
      const mod = await import(`./${step.file}.js`);
      await mod.run();
      console.log('✅');
      ok++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`⚠️  пропущено (${msg})`);
      failed++;
    }
  }

  console.log('');
  console.log(`============================================`);
  console.log(`✅ Выполнено: ${ok} | ⚠️  Пропущено: ${failed}`);
  console.log('');
  console.log('Проверить данные: http://localhost:4000 → Firestore');
  console.log('');
}

runSeed().catch(console.error);
