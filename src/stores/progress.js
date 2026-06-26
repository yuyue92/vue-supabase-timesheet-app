import { defineStore } from 'pinia'

export const useProgressStore = defineStore('progress', {
  state: () => ({
    active: false,
    width: 0,
    timer: null,
  }),
  actions: {
    start() {
      this.active = true
      this.width = 0
      clearInterval(this.timer)
      this.timer = setInterval(() => {
        // 缓慢推进到 90%，等 finish() 跳到 100%
        if (this.width < 90) this.width += (90 - this.width) * 0.08
      }, 50)
    },
    finish() {
      clearInterval(this.timer)
      this.width = 100
      setTimeout(() => {
        this.active = false
        this.width = 0
      }, 320)
    },
  },
})