<script setup lang="ts">
import {defineProps} from 'vue'

interface FileNode {
    name: string
    path: string
    isDirectory: boolean
    children?: FileNode[]
    expanded?: boolean
}

interface Props {
    node: FileNode
}

defineProps<Props>()

const emit = defineEmits<{
    toggleFolder: [node: FileNode]
    openFile: [node: FileNode]
}>()

function handleClick(node: FileNode) {
    if (node.isDirectory) {
        emit('toggleFolder', node)
    } else {
        emit('openFile', node)
    }
}
</script>

<template>
    <div class="file-node">
        <div
            class="file-node-content"
            @click="handleClick(node)"
        >
            <span
                v-if="node.isDirectory"
                class="material-symbols-outlined folder-arrow"
            >
                {{ node.expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}
            </span>
            <span
                v-if="node.isDirectory"
                class="material-symbols-outlined folder-icon"
            >
                folder
            </span>
            <span
                v-else
                class="material-symbols-outlined file-icon"
            >
                code
            </span>
            <span class="file-name">{{ node.name }}</span>
        </div>

        <!-- Recursive rendering for children -->
        <div
            v-if="node.expanded && node.children && node.children.length > 0"
            class="file-children"
        >
            <FileTreeNode
                v-for="child in node.children"
                :key="child.path"
                :node="child"
                @toggle-folder="emit('toggleFolder', $event)"
                @open-file="emit('openFile', $event)"
            />
        </div>
    </div>
</template>

<style scoped>
.file-node {
    margin: 0;
}

.file-node-content {
    display: flex;
    align-items: center;
    padding: 4px 8px 4px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.15s ease;
    font-size: 13px;
}

.file-node-content:hover {
    background-color: rgba(255, 255, 255, 0.05);
}

.folder-arrow {
    font-size: 18px;
    margin-right: 2px;
    color: var(--text-secondary);
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 18;
    flex-shrink: 0;
}

.folder-icon {
    font-size: 18px;
    margin-right: 6px;
    color: var(--text-secondary);
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 18;
    flex-shrink: 0;
}

.file-icon {
    font-size: 18px;
    margin-left: 20px;
    margin-right: 6px;
    color: var(--text-secondary);
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 18;
    flex-shrink: 0;
}

.file-name {
    font-weight: 400;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-children {
    padding-left: 16px;
}
</style>

