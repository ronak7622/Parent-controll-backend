export type DurationUnit = 'minutes' | 'hours' | 'days';

export function toMs(value: number, unit: DurationUnit = 'days'): number {
  const v = Number(value) || 0;
  if (unit === 'minutes') return v * 60 * 1000;
  if (unit === 'hours')   return v * 60 * 60 * 1000;
  return v * 24 * 60 * 60 * 1000; // days
}
