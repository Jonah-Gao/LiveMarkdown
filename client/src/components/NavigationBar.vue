<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {useWorkspaceStore} from '@/stores/workspace'
import {createDirectory} from "@/services/fileService.ts";
import {createPythonVenvAsync} from "@/services/kernelService.ts";

const workspace = useWorkspaceStore()

const isMenuOpen = ref(false)
const showOpenDialog = ref(false)
const showNewDialog = ref(false)

const openPath = ref('')
const newProjectName = ref('')
const newDirPath = ref('')
const pythonInterpreter = ref('')

const menuRef = ref<HTMLElement | null>(null)

const isMaximized = ref(true)

window.windowControls.onMaximize((maximised: boolean) => {
    isMaximized.value = maximised;
})

function toggleMenu() {
    isMenuOpen.value = !isMenuOpen.value
}

function openExistingWorkspace() {
    isMenuOpen.value = false
    showOpenDialog.value = true
}

function createWorkspace() {
    isMenuOpen.value = false
    showNewDialog.value = true
}

function closeDialogs() {
    showOpenDialog.value = false
    showNewDialog.value = false
}

async function confirmOpen() {
    const target = openPath.value.trim()
    if (!target) return
    try {
        await workspace.openWorkspace(target)
        openPath.value = ''
        closeDialogs()
    } catch (err) {
        console.error('Failed to open workspace', err)
    }
}

async function confirmCreate() {
    const dirPath = newDirPath.value.trim()
    const projectName = newProjectName.value.trim()
    const directoryPath = window.nodePath.join(dirPath, projectName)
    const venvPath = window.nodePath.join(directoryPath, '.venv')
    if (!directoryPath) return
    try {
        await createDirectory(directoryPath)
        await createPythonVenvAsync(venvPath, pythonInterpreter.value.trim())
        await workspace.createNewWorkspace({
            projectName: newProjectName.value.trim(),
            directoryPath,
            pythonInterpreter: pythonInterpreter.value.trim()
        })
        newProjectName.value = ''
        newDirPath.value = ''
        pythonInterpreter.value = ''
        closeDialogs()
    } catch (err) {
        console.error('Failed to create workspace', err)
    }
}

function handleGlobalClick(e: MouseEvent) {
    if (!isMenuOpen.value) return
    const target = e.target as Node
    if (menuRef.value && !menuRef.value.contains(target)) {
        isMenuOpen.value = false
    }
}

function handleGlobalKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        isMenuOpen.value = false
    }
}

// Window control functions (Placeholder: Hook these up to Electron/Tauri)
const minimizeWindow = () => { window.windowControls.minimize()}
const maximizeWindow = () => { window.windowControls.maximize() }
const closeWindow = () => { window.windowControls.close() }

onMounted(() => {
    window.addEventListener('click', handleGlobalClick)
    window.addEventListener('keydown', handleGlobalKey)
})

onBeforeUnmount(() => {
    window.removeEventListener('click', handleGlobalClick)
    window.removeEventListener('keydown', handleGlobalKey)
})
</script>

<template>
    <div class="app-nav">
        <div class="nav-left">
            <div class="menu-root" ref="menuRef">
                <button class="nav-button" @click="toggleMenu">File</button>
                <div v-if="isMenuOpen" class="menu-dropdown">
                    <div class="menu-item" @click="openExistingWorkspace">Open</div>
                    <div class="menu-item" @click="createWorkspace">New</div>
                </div>
            </div>
        </div>
        <div class="nav-right window-controls">
            <div class="window-btn minimize" @click="minimizeWindow" title="Minimize">
                <svg width="10" height="1" viewBox="0 0 10 1">
                    <path d="M0 0h10v1H0z" fill="currentColor"/>
                </svg>
            </div>
            <div class="window-btn maximize" @click="maximizeWindow" title="Maximize">
                <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2.1 0v2H0v8.1h8.2v-2h2V0H2.1zm1.1 1h6v6h-1V2.1H3.2V1zM1 3h6v6H1V3z" fill="currentColor"/>
                </svg>
                <svg v-else width="10" height="10" viewBox="0 0 10 10">
                    <path d="M1 1h8v8H1V1zm1 1v6h6V2H2z" fill="currentColor"/>
                </svg>
            </div>
            <div class="window-btn close" @click="closeWindow" title="Close">
                <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M5 4.293L1.354.646l-.708.708L4.293 5 .646 8.646l.708.708L5 5.707l3.646 3.647.708-.708L5.707 5l3.647-3.646-.708-.708L5 4.293z" fill="currentColor"/>
                </svg>
            </div>
        </div>
    </div>

    <div v-if="showOpenDialog" class="dialog-backdrop" @click.self="closeDialogs">
        <div class="dialog">
            <h3>Open Workspace</h3>
            <label class="input-group">
                <span>Directory path</span>
                <input v-model="openPath" type="text" placeholder="Enter directory path" />
            </label>
            <div class="dialog-actions">
                <button @click="closeDialogs">Cancel</button>
                <button class="primary" @click="confirmOpen">Open</button>
            </div>
        </div>
    </div>

    <div v-if="showNewDialog" class="dialog-backdrop" @click.self="closeDialogs">
        <div class="dialog">
            <h3>Create Workspace</h3>
            <label class="input-group">
                <span>Project name</span>
                <input v-model="newProjectName" type="text" placeholder="Enter project name" />
            </label>
            <label class="input-group">
                <span>Directory path</span>
                <input v-model="newDirPath" type="text" placeholder="Enter directory path" />
            </label>
            <label class="input-group">
                <span>Python interpreter path</span>
                <input v-model="pythonInterpreter" type="text" placeholder="Enter python interpreter path" />
            </label>
            <div class="dialog-actions">
                <button @click="closeDialogs">Cancel</button>
                <button class="primary" @click="confirmCreate">Create</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.app-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 35px;
    padding-left: 8px; /* Remove right padding so buttons hit the edge */
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--widget-border-color);
    position: relative;
    z-index: 5;
    -webkit-app-region: drag;
}

.app-nav .nav-button,
.app-nav .menu-dropdown,
.app-nav .window-controls {
    -webkit-app-region: no-drag;
}

.nav-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Windows Style Window Controls */
.window-controls {
    display: flex;
    height: 100%;
}

.window-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px; /* Standard Windows width */
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: default;
    transition: background-color 0.1s;
}

.window-btn svg {
    pointer-events: none; /* Let clicks pass through to div */
}

.window-btn:hover {
    background-color: var(--bg-hover); /* Subtle hover for min/max */
}

/* Specific Close Button Styles */
.window-btn.close:hover {
    background-color: #e81123; /* Windows standard red */
    color: white;
}

.window-btn.close:active {
    background-color: #b90d1c;
    color: white;
}

/* File Menu Styles */
.menu-root {
    position: relative;
}

.nav-button {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: var(--border-radius-sm);
    cursor: default;
    font-size: 12px;
    transition: background-color var(--transition-fast);
}

.nav-button:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
}

.menu-dropdown {
    position: absolute;
    top: 28px;
    left: 0;
    min-width: 160px;
    background-color: var(--bg-secondary);
    border: 1px solid var(--widget-border-color);
    box-shadow: var(--shadow-md);
    border-radius: var(--border-radius-sm);
    padding: 4px 0;
    z-index: 10;
}

.menu-item {
    padding: 8px 12px;
    color: var(--text-primary);
    cursor: default;
    font-size: 13px;
    transition: background-color var(--transition-fast);
}

.menu-item:hover {
    background-color: rgba(255, 255, 255, 0.06);
}

/* Dialog Styles (Unchanged) */
.dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    padding: 16px;
}

.dialog {
    width: 380px;
    background: var(--bg-secondary);
    border: 1px solid var(--widget-border-color);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-lg);
    padding: 16px;
    color: var(--text-primary);
}

.dialog h3 {
    margin-bottom: 12px;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    color: var(--text-secondary);
    font-size: 13px;
}

.input-group input {
    padding: 8px 10px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--widget-border-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.input-group input:focus {
    outline: 1px solid var(--accent-color);
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
}
</style>
