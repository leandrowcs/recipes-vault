export type NutritionLevel = 'low' | 'medium' | 'high' | 'not-rated'

export interface NutritionAssessment {
  key: 'fat' | 'saturatedFat' | 'sugars' | 'salt'
  label: string
  value: number | null
  level: NutritionLevel
}

export interface PositiveNutritionFact {
  key: 'protein' | 'fiber'
  label: string
  value: number | null
  claim: 'high' | 'source' | 'not-rated'
}

export interface NutrientValues {
  energyKcal: number | null
  proteinG: number | null
  fiberG: number | null
  fatG: number | null
  saturatedFatG: number | null
  sugarsG: number | null
  sodiumMg: number | null
  saltG: number | null
}

export function classifyFrontOfPack(value: number | null, greenMaximum: number, amberMaximum: number): NutritionLevel {
  if (value === null || !Number.isFinite(value) || value < 0) return 'not-rated'
  if (value <= greenMaximum) return 'low'
  if (value <= amberMaximum) return 'medium'
  return 'high'
}

export function assessNutrition(values: NutrientValues): {
  ratings: NutritionAssessment[]
  positives: PositiveNutritionFact[]
} {
  const saltG = values.saltG ?? (values.sodiumMg === null ? null : values.sodiumMg / 1_000 * 2.5)
  const proteinEnergyPercentage = values.proteinG === null || values.energyKcal === null || values.energyKcal <= 0
    ? null
    : values.proteinG * 4 * 100 / values.energyKcal
  return {
    ratings: [
      { key: 'fat', label: 'Gordura total', value: values.fatG, level: classifyFrontOfPack(values.fatG, 3, 17.5) },
      { key: 'saturatedFat', label: 'Gordura saturada', value: values.saturatedFatG, level: classifyFrontOfPack(values.saturatedFatG, 1.5, 5) },
      { key: 'sugars', label: 'Açúcares totais', value: values.sugarsG, level: classifyFrontOfPack(values.sugarsG, 5, 22.5) },
      { key: 'salt', label: 'Sal', value: saltG, level: classifyFrontOfPack(saltG, 0.3, 1.5) },
    ],
    positives: [
      {
        key: 'protein',
        label: 'Proteína',
        value: values.proteinG,
        claim: proteinEnergyPercentage === null
          ? 'not-rated'
          : proteinEnergyPercentage >= 20
            ? 'high'
            : proteinEnergyPercentage >= 12
              ? 'source'
              : 'not-rated',
      },
      {
        key: 'fiber',
        label: 'Fibra',
        value: values.fiberG,
        claim: values.fiberG === null
          ? 'not-rated'
          : values.fiberG >= 6 || (values.energyKcal !== null && values.energyKcal > 0 && values.fiberG * 100 / values.energyKcal >= 3)
            ? 'high'
            : values.fiberG >= 3 || (values.energyKcal !== null && values.energyKcal > 0 && values.fiberG * 100 / values.energyKcal >= 1.5)
              ? 'source'
              : 'not-rated',
      },
    ],
  }
}

export function formatNutrition(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return 'Não informado'
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} ${unit}`
}

export function normalizeBarcode(value: string): string | null {
  const barcode = value.replace(/[\s-]/g, '')
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode) ? barcode : null
}

export function isValidEanUpc(value: string): boolean {
  const barcode = normalizeBarcode(value)
  if (!barcode) return false
  const digits = [...barcode].map(Number)
  const checkDigit = digits.pop()
  if (checkDigit === undefined) return false
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === checkDigit
}
