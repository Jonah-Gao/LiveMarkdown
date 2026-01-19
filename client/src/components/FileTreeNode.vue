<script setup lang="ts">
import {UIFileNode} from "@/types/workspace"

interface Props {
    node: UIFileNode
}

defineProps<Props>()

// Icon mappings for file types
const ICONS = {
    folder: 'folder',
    file: 'code',
    json: 'data_object',
    javascript: 'javascript',
    markdown: 'markdown',
    image: 'image',
    csv: 'csv',
    database: 'database',
    arrowDown: 'keyboard_arrow_down',
    arrowRight: 'keyboard_arrow_right',
} as const

type IconKey = keyof typeof ICONS

// Extension to icon category mapping
const CATEGORY_MAP: Partial<Record<IconKey, string[]>> = {
    image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'],
    json: ['.json'],
    javascript: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
    markdown: ['.md', '.mdx'],
    csv: ['.csv'],
    database: ['.db', '.sqlite', '.sqlite3', '.sql'],
}

// Build extension index for fast lookup
const extensionIndex = new Map<string, IconKey>()
for (const [category, extensions] of Object.entries(CATEGORY_MAP)) {
    for (const ext of extensions) {
        extensionIndex.set(ext, category as IconKey)
    }
}

const emit = defineEmits<{
    toggleFolder: [node: UIFileNode]
    openFile: [node: UIFileNode]
}>()

/**
 * Handle node click - toggle folder or open file.
 */
function handleClick(node: UIFileNode): void {
    if (node.isDirectory) {
        emit('toggleFolder', node)
    } else {
        emit('openFile', node)
    }
}

/**
 * Get the icon name for a file based on its extension.
 */
function getFileIcon(extension: string): string {
    return ICONS[extensionIndex.get(extension) ?? 'file']
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
                {{ node.expanded ? ICONS.arrowDown : ICONS.arrowRight }}
            </span>
            <span
                v-if="node.isDirectory"
                class="material-symbols-outlined folder-icon"
            >
                {{ ICONS.folder }}
            </span>
            <span
                v-else
                class="material-symbols-outlined file-icon"
            >
                {{ getFileIcon(node.extension) }}
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
    padding: 5px 8px 5px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin: 1px 4px;
    transition: background-color 0.1s ease;
    font-size: 13px;
}

.file-node-content:hover {
    background-color: rgba(255, 255, 255, 0.06);
}

.file-node-content:active {
    background-color: rgba(255, 255, 255, 0.08);
}

.folder-arrow {
    font-size: 16px;
    margin-right: 2px;
    color: var(--text-muted);
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16;
    flex-shrink: 0;
    transition: transform 0.15s ease;
}

.folder-icon {
    font-size: 16px;
    margin-right: 6px;
    color: var(--text-secondary);
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 16;
    flex-shrink: 0;
}

.file-icon {
    font-size: 16px;
    margin-left: 18px;
    margin-right: 6px;
    color: var(--text-secondary);
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16;
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
    padding-left: 12px;
}
</style>