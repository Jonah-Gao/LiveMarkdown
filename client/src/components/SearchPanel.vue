<script setup lang="ts">
import {ref, watch} from 'vue'
import {useWorkspaceStore} from '@/stores/workspace'
import {UIFileNode} from '@/types/workspace'

const workspace = useWorkspaceStore()

const searchQuery = ref('')
const searchResults = ref<UIFileNode[]>([])

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (query) => {
    if (searchTimeout) {
        clearTimeout(searchTimeout)
    }
    searchTimeout = setTimeout(() => {
        searchResults.value = workspace.searchFiles(query)
    }, 150)
})

function handleResultClick(node: UIFileNode): void {
    workspace.openFile(node)
}

function getFileIcon(extension: string): string {
    const iconMap: Record<string, string> = {
        '.json': 'data_object',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'javascript',
        '.tsx': 'javascript',
        '.md': 'markdown',
        '.mdx': 'markdown',
        '.png': 'image',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.gif': 'image',
        '.svg': 'image',
        '.csv': 'csv',
        '.db': 'database',
        '.sql': 'database',
    }
    return iconMap[extension] || 'code'
}

/**
 * Get relative path from workspace root for display (preserving original case).
 */
function getRelativePath(displayPath: string): string {
    const root = workspace.displayRootDirectory
    if (!root) return displayPath

    // Normalize both paths for comparison (lowercase)
    const normalizedPath = window.nodePath.normalize(displayPath)
    const normalizedRoot = window.nodePath.normalize(root)

    if (normalizedPath.startsWith(normalizedRoot + '\\') || normalizedPath === normalizedRoot) {
        // Use display path for the result but calculate offset from normalized paths
        return displayPath.slice(root.length + 1)
    }
    return displayPath
}
</script>

<template>
    <div class="view-content">
        <div class="content-title-bar">
            <div class="title-label">
                <span>SEARCH</span>
            </div>
        </div>

        <div class="search-panel">
            <div class="search-input-wrapper">
                <span class="material-symbols-outlined search-icon">search</span>
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search files..."
                    class="search-input"
                />
            </div>

            <div v-if="searchQuery && searchResults.length === 0" class="search-empty">
                <p>No files found</p>
            </div>

            <div v-else-if="searchResults.length > 0" class="search-results">
                <div
                    v-for="result in searchResults"
                    :key="result.path"
                    class="search-result-item"
                    @click="handleResultClick(result)"
                >
                    <span class="material-symbols-outlined file-icon">
                        {{ getFileIcon(result.extension) }}
                    </span>
                    <div class="result-info">
                        <span class="result-name">{{ result.name }}</span>
                        <span class="result-path">{{ getRelativePath(result.displayPath) }}</span>
                    </div>
                </div>
            </div>

            <div v-else class="search-placeholder">
                <p>Type to search files in workspace</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.search-panel {
    display: flex;
    flex-direction: column;
    padding: 8px;
    height: calc(100% - 35px);
    overflow: hidden;
}

.search-input-wrapper {
    display: flex;
    align-items: center;
    background-color: var(--bg-secondary);
    border: 1px solid var(--widget-border-color);
    border-radius: var(--border-radius-sm);
    padding: 0 8px;
}

.search-icon {
    font-size: 16px;
    color: var(--text-muted);
    margin-right: 6px;
}

.search-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 13px;
    padding: 8px 0;
    outline: none;
}

.search-input::placeholder {
    color: var(--text-muted);
}

.search-results {
    flex: 1;
    overflow-y: auto;
    margin-top: 8px;
}

.search-result-item {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
}

.search-result-item:hover {
    background-color: rgba(255, 255, 255, 0.06);
}

.file-icon {
    font-size: 16px;
    color: var(--text-secondary);
    margin-right: 8px;
    flex-shrink: 0;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 16;
}

.result-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.result-name {
    font-size: 13px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.result-path {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.search-empty,
.search-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
}
</style>