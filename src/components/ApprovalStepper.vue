<script setup>
import { computed } from 'vue'

const props = defineProps({
  timesheet: {
    type: Object,
    default: () => ({}),
  },
  records: {
    type: Array,
    default: () => [],
  },
  approvers: {
    type: Object,
    default: () => ({}),
  },
})

function actionRecord(level, action) {
  return props.records
    .filter((record) => Number(record.level) === level && record.action === action)
    .sort((left, right) => new Date(right.acted_at || 0) - new Date(left.acted_at || 0))[0] || null
}

function labelForApprover(record, fallback) {
  return record?.approver?.full_name || record?.profiles?.full_name || fallback || ''
}

const l1Approval = computed(() => actionRecord(1, 'approved'))
const l2Approval = computed(() => actionRecord(2, 'approved'))
const rejection = computed(() =>
  props.records
    .filter((record) => record.action === 'rejected')
    .sort((left, right) => new Date(right.acted_at || 0) - new Date(left.acted_at || 0))[0] || null,
)

const steps = computed(() => {
  const status = props.timesheet?.status || 'draft'
  const isRejected = status === 'rejected'
  const submittedDone = ['submitted', 'approved_l1', 'approved_l2', 'rejected'].includes(status)
  const l1Done = Boolean(l1Approval.value)
  const l2Done = Boolean(l2Approval.value)

  return [
    {
      number: 1,
      label: 'Submitted',
      state: submittedDone ? 'done' : 'current',
      note: props.timesheet?.submitted_at ? formatDateTime(props.timesheet.submitted_at) : 'Awaiting submission',
    },
    {
      number: 2,
      label: 'Supervisor Review',
      state: isRejected && Number(rejection.value?.level) === 1 ? 'rejected' : l1Done ? 'done' : status === 'submitted' ? 'current' : 'upcoming',
      note: l1Done
        ? approvalNote(l1Approval.value, labelForApprover(l1Approval.value, props.approvers.l1Name))
        : props.approvers.l1Name || 'First-level approver',
    },
    {
      number: 3,
      label: 'Second-level Review',
      state: isRejected && Number(rejection.value?.level) === 2 ? 'rejected' : l2Done ? 'done' : status === 'approved_l1' ? 'current' : 'upcoming',
      note: l2Done
        ? approvalNote(l2Approval.value, labelForApprover(l2Approval.value, props.approvers.l2Name))
        : props.approvers.l2Name || 'Second-level approver',
    },
  ]
})

function formatDateTime(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function approvalNote(record, name) {
  const time = formatDateTime(record?.acted_at)
  return [name, time].filter(Boolean).join(' · ') || 'Approved'
}
</script>

<template>
  <section class="approval-stepper" aria-label="Timesheet approval progress">
    <div class="approval-steps">
      <div v-for="(step, index) in steps" :key="step.number" class="approval-step-wrap">
        <div class="step" :class="`step--${step.state}`">
          <span class="step-circle">{{ step.state === 'done' ? '✓' : step.state === 'rejected' ? '!' : step.number }}</span>
          <span class="step-copy">
            <strong>{{ step.label }}</strong>
            <small>{{ step.note }}</small>
          </span>
        </div>
        <span v-if="index < steps.length - 1" class="step-line" :class="{ 'step-line--done': step.state === 'done' }"></span>
      </div>
    </div>

    <div v-if="rejection" class="approval-rejection" role="status">
      <strong>Rejected at Level {{ rejection.level }}</strong>
      <span v-if="rejection.comment">{{ rejection.comment }}</span>
      <span v-else>No rejection comment was recorded.</span>
    </div>
  </section>
</template>
