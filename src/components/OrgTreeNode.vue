<script setup>
import { computed, ref } from 'vue'

defineOptions({
  name: 'OrgTreeNode',
})

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  selectedId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select'])
const expanded = ref(true)
const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)

function selectNode() {
  emit('select', props.node)
}

function toggle() {
  if (hasChildren.value) {
    expanded.value = !expanded.value
  }
}
</script>

<template>
  <li class="org-tree-node">
    <div class="org-tree-row" :class="{ 'is-selected': node.id === selectedId }">
      <button
        v-if="hasChildren"
        class="tree-toggle"
        type="button"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? 'Collapse' : 'Expand'} ${node.name}`"
        @click="toggle"
      >
        {{ expanded ? '▾' : '▸' }}
      </button>
      <span v-else class="tree-toggle-placeholder" aria-hidden="true"></span>

      <button class="tree-select" type="button" @click="selectNode">
        {{ node.name }}
      </button>
    </div>

    <ul v-if="hasChildren && expanded" class="org-tree-children">
      <OrgTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
