<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'

const route = useRoute()

const usesAppShell = computed(() =>
  route.matched.some((record) => record.meta.requiresAuth),
)
</script>

<template>
  <AppShell v-if="usesAppShell">
    <RouterView />
  </AppShell>

  <RouterView v-else />
</template>
