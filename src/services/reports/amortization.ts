import type { FixedAssetAmort } from './types';
import { monthKey } from './dates';

/** Сумма мес. амортизации за период 'yyyy-MM': активы, введённые не позже этого месяца.
 *  Актив без распознанной даты считается введённым всегда (как в GAS). */
export function sumAmortForPeriod(assets: FixedAssetAmort[], period: string): number {
  let total = 0;
  for (const a of assets) {
    if (!a.date) { total += a.amort; continue; }
    if (monthKey(a.date) <= period) total += a.amort;
  }
  return total;
}
