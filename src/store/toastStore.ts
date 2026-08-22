import { create } from 'zustand'

export type ToastVariant = 'success' | 'error'

export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
  exiting?: boolean
}

interface ToastStore {
  toasts: ToastItem[]
  show: (variant: ToastVariant, message: string) => void
  /** Start the leave animation; toast is removed after it finishes. */
  dismiss: (id: string) => void
  /** Remove from the list (call after leave animation). */
  remove: (id: string) => void
}

export const TOAST_DURATION_MS = 3200
export const TOAST_EXIT_MS = 200

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (variant, message) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, variant, message }] }))
  },
  dismiss: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    }))
  },
  remove: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export function showToast(variant: ToastVariant, message: string): void {
  useToastStore.getState().show(variant, message)
}

export function toastItemLabel(count: number, singular = 'item', plural = 'items'): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`
}
