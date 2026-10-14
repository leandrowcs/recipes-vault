export interface PantryItem {
  id: string
  name: string
  quantity: number
  unit: string
  expirationDate: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type PantryItemDraft = Omit<PantryItem, 'id' | 'createdAt' | 'updatedAt'>
