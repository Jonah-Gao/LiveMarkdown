<script setup lang="ts">
import {storeToRefs} from 'pinia'
import {useWorkspaceStore} from '@/stores/workspace'
import {ViewMode} from '@/types/workspace'

const props = defineProps<{
    viewModeButtons: { value: ViewMode, icon: string, label: string }[]
}>()

const workspace = useWorkspaceStore()
const {tabs, activeTabIndex, isMarkdownTab, currentViewMode} = storeToRefs(workspace)
</script>

<template>
    <div class="tab-bar">
        <div class="tab-list">
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
            <button
                v-for="btn in props.viewModeButtons"
                :key="btn.value"
                class="tab-view-btn"
                :class="{ active: currentViewMode === btn.value }"
                @click="workspace.setViewMode(btn.value)"
                :title="btn.label"
            >
                <span class="material-symbols-outlined">{{ btn.icon }}</span>
            </button>
        </div>
    </div>
</template>
