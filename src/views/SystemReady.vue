<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import StatusBadge from '@/components/StatusBadge.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
})

const authStore = useAuthStore()

const roleLabel = computed(() =>
  String(authStore.role || 'employee')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
)
</script>

<template>
  <section class="page-section">
    <div class="page-head">
      <div>
        <h1>{{ props.title }}</h1>
        <p>{{ props.description }}</p>
      </div>
    </div>

    <section class="card system-ready-card">
      <p class="eyebrow">Foundation ready</p>
      <h2>Shared application layout is now active</h2>
      <p class="system-ready-copy">
        The remaining workflow screen is intentionally held for its scheduled implementation step.
        Authentication, route permissions and the reusable system components are ready.
      </p>

      <div class="system-ready-grid">
        <article>
          <strong>Signed-in user</strong>
          <span>{{ authStore.displayName }}</span>
          <small>{{ authStore.profile?.employee_code || 'Employee profile' }}</small>
        </article>
        <article>
          <strong>System role</strong>
          <span>{{ roleLabel }}</span>
          <StatusBadge :status="authStore.profile?.status" compact />
        </article>
        <article>
          <strong>Shared components</strong>
          <span>Navigation shell, status badges, day cards, entry table, approval stepper and organisation tree are installed.</span>
        </article>
      </div>
    </section>
  </section>
</template>
