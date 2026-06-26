<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import ToastContainer from '@/components/ToastContainer.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const progressStore = useProgressStore()


const sidebarOpen = ref(false)
const shellError = ref('')

const roleLabel = computed(() => {
  const value = String(authStore.role || 'employee').replaceAll('_', ' ')
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
})

const menuItems = computed(() => {
  const items = [
    {
      label: 'My Timesheet',
      routeName: 'timesheet',
      icon: '🗓️',
    },
  ]

  if (authStore.canApprove) {
    items.push({
      label: 'Approval Inbox',
      routeName: 'approval-inbox',
      icon: '✅',
    })
  }

  if (authStore.canViewReports) {
    items.push({
      label: 'Project Hours Report',
      routeName: 'report',
      icon: '📊',
    })
  }

  if (authStore.canManageOrganisation) {
    items.push({
      label: 'Organisation & Users',
      routeName: 'organisation',
      icon: '🏢',
    })
  }

  return items
})

function closeSidebar() {
  sidebarOpen.value = false
}

function isActive(item) {
  if (item.routeName === 'approval-inbox') {
    return route.name === 'approval-inbox' || route.name === 'approval-detail'
  }

  return route.name === item.routeName
}

async function handleSignOut() {
  shellError.value = ''

  try {
    await authStore.signOut()
    closeSidebar()
    await router.replace({ name: 'signin' })
  } catch (error) {
    shellError.value = error.message || 'Unable to sign out. Please try again.'
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar app-topbar">
      <div class="route-progress" :class="{ 'route-progress--active': progressStore.active }">
        <div class="route-progress-bar" :style="{ width: progressStore.width + '%' }"></div>
      </div>
      <RouterLink class="brand-link" :to="{ name: 'timesheet' }" aria-label="Go to My Timesheet">
        <span class="logo">TS</span>
        <span class="brand-copy">
          <span class="product">Timesheet Management System</span>
          <span class="sub">Internal Staff Portal</span>
        </span>
      </RouterLink>

      <div class="spacer"></div>

      <span class="pill role-pill">{{ roleLabel }}</span>

      <div class="avatar" :title="authStore.displayName">
        <span class="dot">{{ authStore.initials || 'U' }}</span>
        <span class="avatar-name">{{ authStore.displayName }}</span>
      </div>

      <button class="btn signout-button" type="button" :disabled="authStore.loading" @click="handleSignOut">
        {{ authStore.loading ? 'Signing out...' : 'Sign Out' }}
      </button>

      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="sidebarOpen"
        aria-controls="app-sidebar"
        aria-label="Toggle navigation"
        @click="sidebarOpen = !sidebarOpen"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </header>

    <div class="app-layout">
      <button
        v-if="sidebarOpen"
        class="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        @click="closeSidebar"
      ></button>

      <aside id="app-sidebar" class="side app-sidebar" :class="{ 'is-open': sidebarOpen }">
        <div class="nav-title">Main Menu</div>

        <nav class="nav" aria-label="Main navigation">
          <RouterLink
            v-for="item in menuItems"
            :key="item.routeName"
            :to="{ name: item.routeName }"
            class="nav-link"
            :class="{ active: isActive(item) }"
            @click="closeSidebar"
          >
            <span class="icon" aria-hidden="true">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="sidebar-bottom">
          <div class="nav-title">Signed in as</div>
          <p class="sidebar-profile-name">{{ authStore.displayName }}</p>
          <p class="sidebar-profile-meta">{{ authStore.profile?.employee_code || 'Employee profile' }}</p>

          <p v-if="shellError" class="sidebar-error" role="alert">{{ shellError }}</p>
        </div>
      </aside>

      <main class="app-main">
        <slot />
      </main>
    </div>
  </div>
  <ToastContainer />
</template>
