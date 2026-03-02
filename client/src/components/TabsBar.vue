<script setup lang="ts">
import {storeToRefs} from 'pinia'
import {useWorkspaceStore} from '@/stores/workspace'
import {ViewMode} from '@/types/workspace'

const props = defineProps<{
    viewModeButtons: { value: ViewMode, icon: string, label: string }[]
}>()

const workspace = useWorkspaceStore()
const {tabs, activeTabIndex, isMarkdownTab, currentViewMode} = storeToRefs(workspace)

function onWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement
    el.scrollLeft += e.deltaY  // Horizontal scroll on vertical wheel
    el.scrollLeft += e.deltaX
}

</script>

<template>
    <div class="tab-bar">
        <div class="tab-list" @wheel="onWheel">
            <div
                v-for="(tab, index) in tabs"
                :key="tab.id"
                class="tab"
                :class="{ active: activeTabIndex === index }"
                @click="workspace.openTab(tab)"
            >
                <span>{{ tab.name }}</span>
                <div class="tab-action" @click.stop="workspace.closeTab(tab)">
                    <span class="material-symbols-outlined">close</span>
                </div>
            </div>
        </div>
        <div v-if="isMarkdownTab" class="tab-view-toggle">
            <div
                v-for="btn in props.viewModeButtons"
                :key="btn.value"
                class="tab-view-btn"
                :class="{ active: currentViewMode === btn.value }"
                @click="workspace.setViewMode(btn.value)"
                :title="btn.label"
            >
                <span class="material-symbols-outlined">{{ btn.icon }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tab-bar {
    display: flex;
    height: 35px;
    background-color: var(--bg-tertiary);
    border-bottom: 1px solid var(--widget-border-color);
    overflow: hidden;
    align-items: stretch;
}

.tab-list {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
}

.tab-list::-webkit-scrollbar {
    display: none;
}

.tab-list::-webkit-scrollbar-track {
    background: transparent;
}

.tab-list::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: 2px;
}

.tab {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-width: 120px;
    max-width: 200px;
    height: 100%;
    padding: 0 4px 0 14px;
    font-size: 13px;
    color: var(--text-secondary);
    background-color: transparent;
    border-right: 1px solid var(--widget-border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
}

.tab:hover {
    background-color: rgba(255, 255, 255, 0.03);
    color: var(--text-primary);
}

.tab.active {
    color: var(--text-primary);
    background-color: var(--bg-secondary);
}

.tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background-color: var(--bg-secondary);
}

.tab.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background-color: var(--accent-color-secondary);
}

.tab span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
}

.tab-action {
    display: flex;
    height: 20px;
    width: 20px;
    margin-left: 4px;
    justify-content: center;
    text-align: center;
    align-items: center;
    cursor: pointer;
    user-select: none;
    border-radius: var(--border-radius-sm);
    color: var(--text-primary);
    opacity: 0;
    transition: opacity var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
}

.tab:hover .tab-action,
.tab.active .tab-action {
    opacity: 1;
}

.tab-action:hover {
    background-color: var(--button-hover);
    color: var(--text-primary);
}

.tab-action span {
    font-size: 16px;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16;
}

.tab-view-toggle {
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 4px;
    background-color: var(--bg-tertiary);
    flex-shrink: 0;
    z-index: 10;
}

.tab-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--border-radius-sm);
    background-color: transparent;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
    padding: 0;
}

.tab-view-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
    background-color: var(--button-hover);
}

.tab-view-btn.active {
    color: var(--text-primary);
    border-color: var(--accent-color);
}

.tab-view-btn .material-symbols-outlined {
    font-size: 20px;
    font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20;
}

.tab-view-btn.active .material-symbols-outlined {
    color: var(--accent-color);
    font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 20;
}
</style>