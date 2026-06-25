<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasSupabaseConfig, supabaseConfigError } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const form = reactive({
  email: '',
  password: '',
})

const pageError = ref('')

const configMessage = computed(() =>
  hasSupabaseConfig ? '' : supabaseConfigError,
)

async function handleSubmit() {
  pageError.value = ''

  try {
    await authStore.signIn(form)

    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : '/timesheet'

    await router.replace(redirect)
  } catch (error) {
    pageError.value = error.message || 'Unable to sign in.'
  }
}
</script>

<template>
  <div class="signin-wrap">
    <form class="signin card" @submit.prevent="handleSubmit">
      <div class="center">
        <div class="brand-mark">TS</div>
        <h1 class="login-title">Timesheet Management System</h1>
        <p class="login-sub">Internal Staff Portal</p>
      </div>

      <div v-if="configMessage" class="message message-warning" role="status">
        {{ configMessage }}
      </div>

      <div v-if="pageError" class="message message-error" role="alert">
        {{ pageError }}
      </div>

      <div class="field">
        <label for="email">Company Email</label>
        <input
          id="email"
          v-model.trim="form.email"
          class="input"
          type="email"
          autocomplete="email"
          placeholder="name@company.com"
          :disabled="authStore.loading || !hasSupabaseConfig"
          required
        />
      </div>

      <div class="field field-gap">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="form.password"
          class="input"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          :disabled="authStore.loading || !hasSupabaseConfig"
          required
        />
      </div>

      <button
        class="btn primary signin-button"
        type="submit"
        :disabled="authStore.loading || !hasSupabaseConfig"
      >
        {{ authStore.loading ? 'Signing in...' : 'Sign In' }}
      </button>

      <p class="footer-note">
        For internal use only · Contact your system administrator if you cannot sign in.
        <span>[chris.wong@company.test,Password123!]</span>        
      </p>
    </form>
  </div>
</template>
