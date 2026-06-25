<script setup>
import { computed } from 'vue'
import OrgTreeNode from '@/components/OrgTreeNode.vue'

const props = defineProps({
  departments: {
    type: Array,
    default: () => [],
  },
  selectedId: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  emptyMessage: {
    type: String,
    default: 'No organisation units found.',
  },
})

const emit = defineEmits(['select'])

function sortByName(nodes) {
  return [...nodes]
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
    .map((node) => ({
      ...node,
      children: sortByName(node.children || []),
    }))
}

const tree = computed(() => {
  const nodeMap = new Map()

  props.departments.forEach((department) => {
    if (!department?.id) return

    nodeMap.set(department.id, {
      ...department,
      children: [],
    })
  })

  const roots = []

  nodeMap.forEach((node) => {
    const parentId = node.parent_id
    const parent = parentId ? nodeMap.get(parentId) : null

    if (parent && parent.id !== node.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return sortByName(roots)
})
</script>

<template>
  <section class="org-tree" aria-label="Organisation tree">
    <div v-if="loading" class="tree-state" role="status">Loading organisation units…</div>
    <div v-else-if="!tree.length" class="tree-state">{{ emptyMessage }}</div>
    <ul v-else class="org-tree-root">
      <OrgTreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :selected-id="selectedId"
        @select="emit('select', $event)"
      />
    </ul>
  </section>
</template>
