<script setup lang="ts">
import {storeToRefs} from 'pinia'
import FileTreeNode from './FileTreeNode.vue'
import {useWorkspaceStore} from '@/stores/workspace'

const workspace = useWorkspaceStore()
const {fileTree} = storeToRefs(workspace)
</script>

<template>
    <div class="view-content">
        <div class="content-title-bar">
            <div class="title-label">
                <span>EXPLORER</span>
            </div>
            <div class="title-actions">
                <div class="title-action">
                    <span class="material-symbols-outlined">add</span>
                </div>
                <div class="title-action" @click="workspace.toggleExplorer">
                    <span class="material-symbols-outlined">collapse_content</span>
                </div>
            </div>
        </div>

        <div v-if="fileTree" class="file-explorer">
            <FileTreeNode
                v-for="node in fileTree"
                :key="node.path"
                :node="node"
                @toggleFolder="workspace.toggleFolder"
                @openFile="workspace.openFile"
            />
        </div>
    </div>
</template>

<style scoped>
.file-explorer {
    font-family: inherit;
    color: var(--text-primary);
    padding: 0;
    overflow-y: auto;
    height: 100%;
    user-select: none;
}
</style>
