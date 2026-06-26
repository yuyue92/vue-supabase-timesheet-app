import { defineStore } from 'pinia'

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({ toasts: [] }),
  actions: {
    show(message, type = 'info', duration = 3500) {
      const id = nextId++
      this.toasts.push({ id, message, type })
      setTimeout(() => this.dismiss(id), duration)
    },
    success(message, duration) { this.show(message, 'success', duration) },
    error(message, duration)   { this.show(message, 'error',   duration ?? 6000) },
    info(message, duration)    { this.show(message, 'info',    duration) },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})