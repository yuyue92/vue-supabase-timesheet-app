import { defineStore } from 'pinia'
import {
  getSupabase,
  hasSupabaseConfig,
  supabaseConfigError,
} from '@/lib/supabase'

let initializationPromise = null
let authSubscription = null

function toFriendlyAuthError(error, fallbackMessage) {
  const message = String(error?.message || '').trim()
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email address or password.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.'
  }

  if (normalized.includes('network')) {
    return 'Unable to reach Supabase. Check your network connection and project URL.'
  }

  return message || fallbackMessage
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    user: null,
    profile: null,
    role: null,
    loading: false,
    initialized: false,
    error: '',
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.session && state.user),

    isAdmin: (state) => state.role === 'admin',

    isSupervisor: (state) =>
      state.role === 'supervisor' || state.role === 'admin',

    canApprove() {
      return this.isSupervisor
    },

    canManageOrganisation() {
      return this.isAdmin
    },

    canViewReports: (state) => Boolean(state.role),

    displayName: (state) => state.profile?.full_name || state.user?.email || 'User',

    initials() {
      return this.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('')
    },
  },

  actions: {
    clearAuthState() {
      this.session = null
      this.user = null
      this.profile = null
      this.role = null
    },

    async initialize() {
      if (this.initialized) {
        return this.session
      }

      if (initializationPromise) {
        return initializationPromise
      }

      initializationPromise = this.initializeInternal()

      try {
        return await initializationPromise
      } finally {
        initializationPromise = null
      }
    },

    async initializeInternal() {
      if (!hasSupabaseConfig) {
        this.error = supabaseConfigError
        this.initialized = true
        return null
      }

      this.subscribeToAuthChanges()

      const client = getSupabase()
      const { data, error } = await client.auth.getSession()

      if (error) {
        this.clearAuthState()
        this.error = toFriendlyAuthError(error, 'Unable to restore your login session.')
        this.initialized = true
        return null
      }

      this.session = data.session || null
      this.user = data.session?.user || null

      if (this.user) {
        try {
          await this.fetchProfile(this.user.id)

          if (this.profile?.status !== 'active') {
            await client.auth.signOut()
            this.clearAuthState()
            this.error = 'Your account is suspended. Please contact a system administrator.'
          }
        } catch (profileError) {
          await client.auth.signOut()
          this.clearAuthState()
          this.error = toFriendlyAuthError(
            profileError,
            'Your user profile could not be loaded. Please contact a system administrator.',
          )
        }
      }

      this.initialized = true
      return this.session
    },

    subscribeToAuthChanges() {
      if (!hasSupabaseConfig || authSubscription) {
        return
      }

      const client = getSupabase()
      const { data } = client.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
          this.handleAuthEvent(event, session)
        }, 0)
      })

      authSubscription = data.subscription
    },

    async handleAuthEvent(event, session) {
      if (event === 'SIGNED_OUT') {
        this.clearAuthState()
        return
      }

      if (!session) {
        return
      }

      this.session = session
      this.user = session.user

      if (event === 'INITIAL_SESSION') {
        return
      }

      try {
        await this.fetchProfile(session.user.id)
      } catch (error) {
        this.error = toFriendlyAuthError(
          error,
          'Your profile could not be refreshed.',
        )
      }
    },

    async fetchProfile(userId = this.user?.id) {
      if (!userId) {
        this.profile = null
        this.role = null
        return null
      }

      const client = getSupabase()
      const { data, error } = await client
        .from('profiles')
        .select(
          'id, full_name, employee_code, department_id, supervisor_id, second_supervisor_id, role, status, created_at, updated_at',
        )
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        throw new Error(toFriendlyAuthError(error, 'Unable to load your profile.'))
      }

      if (!data) {
        throw new Error(
          'Your authenticated account does not have a matching employee profile.',
        )
      }

      this.profile = data
      this.role = data.role

      return data
    },

    async signIn({ email, password }) {
      if (!hasSupabaseConfig) {
        throw new Error(supabaseConfigError)
      }

      const normalizedEmail = String(email || '').trim().toLowerCase()

      if (!normalizedEmail || !password) {
        throw new Error('Enter both your company email and password.')
      }

      this.loading = true
      this.error = ''

      try {
        const client = getSupabase()
        const { data, error } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (error) {
          throw error
        }

        this.session = data.session || null
        this.user = data.user || data.session?.user || null

        if (!this.user) {
          throw new Error('The sign-in response did not include a user session.')
        }

        await this.fetchProfile(this.user.id)

        if (this.profile.status !== 'active') {
          await client.auth.signOut()
          this.clearAuthState()
          throw new Error('Your account is suspended. Please contact a system administrator.')
        }

        this.initialized = true
        return data
      } catch (error) {
        this.clearAuthState()
        this.error = toFriendlyAuthError(error, 'Unable to sign in.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },

    async signOut() {
      this.loading = true
      this.error = ''

      try {
        if (hasSupabaseConfig) {
          const client = getSupabase()
          const { error } = await client.auth.signOut()

          if (error) {
            throw error
          }
        }

        this.clearAuthState()
      } catch (error) {
        this.error = toFriendlyAuthError(error, 'Unable to sign out.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
  },
})
