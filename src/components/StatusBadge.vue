<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const statusMeta = {
  draft: { label: 'Draft', className: 'status--draft' },
  submitted: { label: 'Pending L1', className: 'status--pending' },
  pending: { label: 'Pending', className: 'status--pending' },
  pending_l1: { label: 'Pending L1', className: 'status--pending' },
  pending_l2: { label: 'Pending L2', className: 'status--locked' },
  approved_l1: { label: 'Approved L1', className: 'status--locked' },
  approved_l2: { label: 'Approved', className: 'status--approved' },
  approved: { label: 'Approved', className: 'status--approved' },
  rejected: { label: 'Rejected', className: 'status--rejected' },
  active: { label: 'Active', className: 'status--approved' },
  suspended: { label: 'Suspended', className: 'status--rejected' },
  complete: { label: 'Complete', className: 'status--approved' },
  incomplete: { label: 'Below standard hours', className: 'status--pending' },
  warning: { label: 'Needs attention', className: 'status--pending' },
  locked: { label: 'Locked', className: 'status--locked' },
}

const normalizedStatus = computed(() => String(props.status || '').trim().toLowerCase())

const meta = computed(() =>
  statusMeta[normalizedStatus.value] || {
    label: normalizedStatus.value
      ? normalizedStatus.value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
      : 'Unknown',
    className: 'status--neutral',
  },
)

const text = computed(() => props.label || meta.value.label)
</script>

<template>
  <span class="status" :class="[meta.className, { 'status--compact': compact }]">
    {{ text }}
  </span>
</template>
