<script setup lang="ts">
import {ref} from 'vue'
import {storeToRefs} from 'pinia'
import FileTreeNode from './FileTreeNode.vue'
import ContextMenu, {MenuItem} from './ContextMenu.vue'
import {useWorkspaceStore} from '@/stores/workspace'
import {UIFileNode} from '@/types/workspace'

const workspace = useWorkspaceStore()
const {visibleFileTree, hasWorkspace, rootDirectory} = storeToRefs(workspace)

// Context menu state
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuItems = ref<MenuItem[]>([])
const contextMenuNode = ref<UIFileNode | null>(null)

// Input dialog state
const showInputDialog = ref(false)
const inputDialogTitle = ref('')
const inputDialogValue = ref('')
const inputDialogCallback = ref<((value: string) => void) | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

function handleContextMenu(event: MouseEvent, node: UIFileNode | null): void {
    event.preventDefault()
    contextMenuNode.value = node
    contextMenuX.value = event.clientX
    contextMenuY.value = event.clientY

    const targetPath = node?.path ?? rootDirectory.value

    if (node === null || node.isDirectory) {
        // Context menu for directory or empty space
        contextMenuItems.value = [
            {
                label: 'New File',
                icon: 'note_add',
                action: () => showNewFileDialog(targetPath)
            },
            {
                label: 'New Folder',
                icon: 'create_new_folder',
                action: () => showNewFolderDialog(targetPath)
            },
            {separator: true, label: '', action: () => {}},
            {
                label: 'Copy',
                icon: 'content_copy',
                action: () => {
                    if (node) workspace.copyToClipboard(node.path, node.isDirectory)
                },
                disabled: !node
            },
            {
                label: 'Cut',
                icon: 'content_cut',
                action: () => {
                    if (node) workspace.cutToClipboard(node.path, node.isDirectory)
                },
                disabled: !node
            },
            {
                label: 'Paste',
                icon: 'content_paste',
                action: () => workspace.pasteFromClipboard(targetPath),
                disabled: !workspace.hasClipboardContent()
            },
            {separator: true, label: '', action: () => {}},
            {
                label: 'Rename',
                icon: 'edit',
                action: () => {
                    if (node) showRenameDialog(node)
                },
                disabled: !node
            },
            {
                label: 'Delete',
                icon: 'delete',
                action: () => {
                    if (node) workspace.deleteFileNode(node.path, node.isDirectory)
                },
                disabled: !node
            }
        ]
    } else {
        // Context menu for file
        contextMenuItems.value = [
            {
                label: 'Open',
                icon: 'open_in_new',
                action: () => workspace.openFile(node)
            },
            {separator: true, label: '', action: () => {}},
            {
                label: 'Copy',
                icon: 'content_copy',
                action: () => workspace.copyToClipboard(node.path, false)
            },
            {
                label: 'Cut',
                icon: 'content_cut',
                action: () => workspace.cutToClipboard(node.path, false)
            },
            {separator: true, label: '', action: () => {}},
            {
                label: 'Rename',
                icon: 'edit',
                action: () => showRenameDialog(node)
            },
            {
                label: 'Delete',
                icon: 'delete',
                action: () => workspace.deleteFileNode(node.path, false)
            }
        ]
    }

    showContextMenu.value = true
}

function closeContextMenu(): void {
    showContextMenu.value = false
    contextMenuNode.value = null
}

function showNewFileDialog(parentPath: string): void {
    inputDialogTitle.value = 'New File'
    inputDialogValue.value = ''
    inputDialogCallback.value = (name: string) => {
        if (name.trim()) {
            workspace.createNewFile(parentPath, name.trim())
        }
    }
    showInputDialog.value = true
    setTimeout(() => inputRef.value?.focus(), 50)
}

function showNewFolderDialog(parentPath: string): void {
    inputDialogTitle.value = 'New Folder'
    inputDialogValue.value = ''
    inputDialogCallback.value = (name: string) => {
        if (name.trim()) {
            workspace.createNewFolder(parentPath, name.trim())
        }
    }
    showInputDialog.value = true
    setTimeout(() => inputRef.value?.focus(), 50)
}

function showRenameDialog(node: UIFileNode): void {
    inputDialogTitle.value = 'Rename'
    inputDialogValue.value = node.name
    inputDialogCallback.value = (name: string) => {
        if (name.trim() && name.trim() !== node.name) {
            workspace.renameFileNode(node.path, name.trim(), node.isDirectory)
        }
    }
    showInputDialog.value = true
    setTimeout(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
    }, 50)
}

function confirmInputDialog(): void {
    if (inputDialogCallback.value && inputDialogValue.value.trim()) {
        inputDialogCallback.value(inputDialogValue.value)
    }
    closeInputDialog()
}

function closeInputDialog(): void {
    showInputDialog.value = false
    inputDialogValue.value = ''
    inputDialogCallback.value = null
}

function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        confirmInputDialog()
    } else if (event.key === 'Escape') {
        closeInputDialog()
    }
}
</script>

<template>
    <div class="view-content" @contextmenu="handleContextMenu($event, null)">
        <div class="content-title-bar">
            <div class="title-label">
                <span>EXPLORER</span>
            </div>
            <div class="title-actions">
                <div class="title-action" @click="showNewFileDialog(rootDirectory)">
                    <span class="material-symbols-outlined">add</span>
                </div>
                <div class="title-action" @click="workspace.toggleExplorer">
                    <span class="material-symbols-outlined">collapse_content</span>
                </div>
            </div>
        </div>

        <div v-if="hasWorkspace && visibleFileTree.length" class="file-explorer">
            <FileTreeNode
                v-for="node in visibleFileTree"
                :key="node.path"
                :node="node"
                @toggleFolder="workspace.toggleFolder"
                @openFile="workspace.openFile"
                @contextmenu="handleContextMenu"
            />
        </div>
        <div v-else class="file-explorer empty">
            <p>Select a workspace to load files.</p>
        </div>

        <!-- Context Menu -->
        <ContextMenu
            v-if="showContextMenu"
            :items="contextMenuItems"
            :x="contextMenuX"
            :y="contextMenuY"
            @close="closeContextMenu"
        />

        <!-- Input Dialog -->
        <Teleport to="body">
            <div v-if="showInputDialog" class="input-dialog-overlay" @click.self="closeInputDialog">
                <div class="input-dialog">
                    <div class="input-dialog-title">{{ inputDialogTitle }}</div>
                    <input
                        ref="inputRef"
                        v-model="inputDialogValue"
                        type="text"
                        class="input-dialog-input"
                        @keydown="handleInputKeydown"
                    />
                    <div class="input-dialog-actions">
                        <button class="dialog-btn cancel" @click="closeInputDialog">Cancel</button>
                        <button class="dialog-btn confirm" @click="confirmInputDialog">OK</button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.file-explorer {
    font-family: inherit;
    color: var(--text-primary);
    padding: 0;
    overflow-y: scroll;
    overflow-x: auto;
    height: 100%;
    user-select: none;
    contain: strict;
}

.file-explorer.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    overflow: hidden;
}

.input-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1001;
}

.input-dialog {
    background-color: var(--bg-secondary);
    border: 1px solid var(--widget-border-color);
    border-radius: 8px;
    padding: 16px;
    min-width: 300px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.input-dialog-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 12px;
}

.input-dialog-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 13px;
    background-color: var(--bg-primary);
    border: 1px solid var(--widget-border-color);
    border-radius: 4px;
    color: var(--text-primary);
    outline: none;
    box-sizing: border-box;
}

.input-dialog-input:focus {
    border-color: var(--accent-color);
}

.input-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}

.dialog-btn {
    padding: 6px 16px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background-color 0.1s ease;
}

.dialog-btn.cancel {
    background-color: transparent;
    color: var(--text-secondary);
}

.dialog-btn.cancel:hover {
    background-color: rgba(255, 255, 255, 0.08);
}

.dialog-btn.confirm {
    background-color: var(--accent-color);
    color: white;
}

.dialog-btn.confirm:hover {
    background-color: var(--accent-color-hover);
}
</style>