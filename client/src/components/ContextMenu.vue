<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'

export interface MenuItem {
    label: string
    icon?: string
    action: () => void
    disabled?: boolean
    separator?: boolean
}

interface Props {
    items: MenuItem[]
    x: number
    y: number
}

defineProps<Props>()
const emit = defineEmits<{
    close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

function handleClickOutside(event: MouseEvent): void {
    if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
        emit('close')
    }
}

function handleItemClick(item: MenuItem): void {
    if (!item.disabled && !item.separator) {
        item.action()
        emit('close')
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('contextmenu', handleClickOutside)
})
</script>

<template>
    <Teleport to="body">
        <div
            ref="menuRef"
            class="context-menu"
            :style="{ left: `${x}px`, top: `${y}px` }"
        >
            <template v-for="(item, index) in items" :key="index">
                <div v-if="item.separator" class="context-menu-separator"></div>
                <div
                    v-else
                    class="context-menu-item"
                    :class="{ disabled: item.disabled }"
                    @click="handleItemClick(item)"
                >
                    <span v-if="item.icon" class="material-symbols-outlined menu-icon">{{ item.icon }}</span>
                    <span class="menu-label">{{ item.label }}</span>
                </div>
            </template>
        </div>
    </Teleport>
</template>

<style scoped>
.context-menu {
    position: fixed;
    background-color: var(--bg-secondary);
    border: 1px solid var(--widget-border-color);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 10000;
}

.context-menu-item {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    transition: background-color 0.1s ease;
}

.context-menu-item:hover:not(.disabled) {
    background-color: rgba(255, 255, 255, 0.08);
}

.context-menu-item.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
}

.menu-icon {
    font-size: 16px;
    margin-right: 8px;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16;
}

.menu-label {
    flex: 1;
}

.context-menu-separator {
    height: 1px;
    background-color: var(--widget-border-color);
    margin: 4px 8px;
}
</style>