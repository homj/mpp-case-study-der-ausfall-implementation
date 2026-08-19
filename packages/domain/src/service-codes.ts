import type { ServiceCode } from './types.js';

/** Termino service label → our service code. Termino strips umlauts. Unknown → null. */
const LABEL_TO_CODE: Record<string, ServiceCode> = {
  Krankengymnastik: 'KG',
  'Manuelle Therapie': 'MT',
  'Lymphdrainage 45 Min.': 'MLD45',
  'Geraetegestuetzte Krankengymnastik': 'KGG',
};

export function serviceCodeFromLabel(label: string): ServiceCode | null {
  return LABEL_TO_CODE[label.trim()] ?? null;
}
