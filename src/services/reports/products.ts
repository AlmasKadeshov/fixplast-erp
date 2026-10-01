// Классификация товаров 1С → группа / позиция справочника себестоимости.
// Порт getProductGroup_, mapProductToCost_, extractPackMultiplier_ из GAS.

export function extractPackMultiplier(name: string): number {
  if (!name) return 1;
  const m = String(name).toLowerCase().match(/\((\d+)\s*шт\.?\s*\)/);
  if (m) { const n = Number(m[1]); return n > 0 ? n : 1; }
  return 1;
}

export function getProductGroup(salesName: string): string {
  const s = salesName.toLowerCase();
  if (s.includes('экспорт')) return '📦 Экспорт';
  if (s.includes('плен') || s.includes('плёнка')) return '📦 Плёнка (перекуп)';
  if (s.includes('фиксатор')) return '🔧 Фиксаторы';
  if (s.match(/^гвоздь\s+(тм|металл|полиамид)/)) return '🔩 Гвозди (в розницу)';
  if (s.includes('стержень усиленн') || s.includes('стержень усилен')) return '🔩 Стержни металл';
  if (s.includes('стержень полиамид')) return '🔩 Стержни полиамид';
  if (s.includes('стержень тм')) return '🔩 Стержни ТМ';
  if (s.includes('термоголова') || s.includes('fdmt')) return '🔩 Дюбели FDMT (термоголова)';
  if (s.includes('fdm') && !s.includes('fdmt')) return '🔩 Дюбели FDM (мет. гвоздь)';
  if (s.includes('пласт') && s.includes('eco')) return '🔩 Дюбели ECO (пласт.)';
  if (s.includes('пласт') && !s.includes('eco')) return '🔩 Дюбели с пласт. гвоздём';
  if (/полиам/.test(s)) return '🔩 Дюбели полиамид';
  if (s.includes('зонт') || s.includes('газоблок')) return '🔩 Дюбели зонт / газоблок';
  if (s.match(/^дюбель\s+\d+/)) return '🔩 Дюбели полиамид';
  if (s.includes('дюбель') && /мет\.\s*гвозд/.test(s)) return '🔩 Дюбели FDM (мет. гвоздь)';
  return '📦 Прочее';
}

/** Категория для разбивки ПНД на ПНД/ПП/ПВД */
export function getCategoryForProduct(productName: string): 'Дюбели' | 'Фиксаторы' | null {
  const group = getProductGroup(String(productName || ''));
  if (group === '🔧 Фиксаторы') return 'Фиксаторы';
  if (group.indexOf('Дюбели') !== -1) return 'Дюбели';
  return null;
}

export const PEREKUP_MARK = '__ПЕРЕКУП__';

/** Название позиции 1С → название строки справочника «Себестоимость» (или null) */
export function mapProductToCost(salesName: string): string | null {
  const s = salesName.toLowerCase().trim();

  if (s.includes('плен') || s.includes('плёнка')) return 'Плёнка полиэтиленовая (перекуп)';
  if (s === 'экспорт') return PEREKUP_MARK;

  const sizeMatch = s.match(/(\d+)\s*[*×x]\s*(\d+)/);
  const size = sizeMatch ? sizeMatch[1] + '×' + sizeMatch[2] : '';
  const mmMatch = s.match(/(\d+)\s*мм/);

  if (s.includes('звездочка') || s.includes('звёздочка')) { const f = s.match(/(\d+-\d+\/\d+)/); return 'Фиксатор "Звёздочка" ' + (f ? f[1] : ''); }
  if (s.includes('прищепка')) { const f = s.match(/(\d+-\d+\/\d+)/); return 'Фиксатор "Прищепка" ' + (f ? f[1] : ''); }
  if (s.includes('косточка')) return 'Фиксатор "Косточка"';
  if (s.includes('стульчик')) { const f = s.match(/(\d+-\d+\/\d+)/); return 'Фиксатор "Стульчик" ' + (f ? f[1] : ''); }

  if (s.includes('зонт') || s.includes('газоблок')) { if (mmMatch) return 'Дюбель ' + mmMatch[1] + ' пристрелочный'; return null; }

  if (s.match(/^гвоздь\s+тм/) && size) return 'Гвоздь ТМ ' + size;
  if (s.match(/^гвоздь\s+полиамид/) && size) return 'Гвоздь полиамид. ' + size;
  if (s.match(/^гвоздь\s+металл/) && size) return 'Гвоздь металл. ' + size;

  if (s.includes('стержень полиамид')) return 'Гвоздь полиамид. ' + size;
  if (s.includes('стержень тм')) return 'Стержень ТМ ' + size;
  if (s.includes('стержень усиленный') || s.includes('стержень усилен')) return 'Стержень металл ' + size;

  if (s.includes('термоголова') || s.includes('fdmt')) return 'Дюбель ТМ с мет. гвоздем ' + size;
  if (s.includes('fdm') || (s.includes('со стержнем') && !s.includes('термо'))) return 'Дюбель с мет. гвоздем ' + size;
  if (s.includes('пласт') && s.includes('eco')) return 'Дюбель с пласт. гвоздем ECO ' + size;
  if (s.includes('пласт') && !s.includes('eco')) return 'Дюбель с пласт. гвоздем ' + size;
  if (s.includes('полиамид')) return 'Дюбель с полиам. гвоздем ' + size;
  if (s.match(/^дюбель\s+\d+/) && size) return 'Дюбель (корпус) ' + size;

  return null;
}

/** Короткое читаемое название позиции 1С (убирает общий длинный префикс) */
export function shortProductName(name: string): string {
  const short = shortenName(name);
  // после обрезки префикса «Дюбель для теплоизоляции Fix Plast» остаётся «со стержнем …» — вернём слово «Дюбель»
  return /^(со|с) /.test(short) ? `Дюбель ${short}` : short;
}

function shortenName(name: string): string {
  return String(name || '')
    .replace('Дюбель для теплоизоляции Fix Plast ', '')
    .replace('Фиксатор арматуры ', '')
    .replace('Полимерная пленка серая ', 'Плёнка ')
    .replace('Стержень усиленный Fix Plast ', 'Стержень усил. ')
    .replace('Стержень полиамид. ', 'Стержень полиам. ')
    .replace('Стержень ТМ Fix Plast ', 'Стержень ТМ ')
    .replace('Дюбель зонт DZ ', 'Зонт DZ ');
}
