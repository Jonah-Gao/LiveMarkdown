<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import FileExplorer from './components/FileExplorer.vue'
import SearchPanel from './components/SearchPanel.vue'
import TabsBar from './components/TabsBar.vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import Terminal from './components/Terminal.vue'
import {useWorkspaceStore} from '@/stores/workspace'
import {useKernelStore} from '@/stores/kernel'
import NavigationBar from "@/components/NavigationBar.vue"

const workspace = useWorkspaceStore()
const kernelStore = useKernelStore()

const {
    explorerStyle,
    showExplorer,
    showSearch,
    showTerminal,
    showCodePane,
    showPreviewPane,
    activeTab,
    hasTabs,
    hasWorkspace,
    layoutState
} = storeToRefs(workspace)

const { status: kernelStatus } = storeToRefs(kernelStore)

const sidebarButtons = workspace.sidebarButtons
const viewModeButtons = workspace.viewModeButtons

const editorPane = ref<HTMLElement | null>(null)

/**
 * Start preview pane resize, passing container width to store.
 */
function startPreviewResize(event: MouseEvent): void {
    const width = editorPane.value?.getBoundingClientRect().width || 0
    workspace.startPreviewResize(event, width)
}

/**
 * Check if a sidebar button is active based on layoutState.
 */
function isTopButtonActive(index: number): boolean {
    const panel = sidebarButtons.top[index]?.panel
    return layoutState.value.activeTopPanel === panel
}

/**
 * Check if a bottom sidebar button is active based on layoutState.
 */
function isBottomButtonActive(index: number): boolean {
    const panel = sidebarButtons.bottom[index]?.panel
    return layoutState.value.activeBottomPanel === panel
}

onMounted(async () => {
    const startTime = Date.now()
    let appReadyCalled = false

    const callAppReady = () => {
        if (appReadyCalled) return
        appReadyCalled = true
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, 1000 - elapsed)
        setTimeout(() => window.windowControls.appReady(), remaining)
    }

    // Timeout fallback - show main window after 10s even if loading fails
    const timeout = setTimeout(() => {
        console.warn('[App] Loading timeout, showing main window anyway')
        callAppReady()
    }, 10000)

    try {
        // Promise that resolves when kernel port is ready
        const portReady = new Promise<void>((resolve) => {
            window.kernel.onPort((port) => {
                kernelStore.setPort(port)
                resolve()
            })
        })

        window.kernel.onStatus((status, error) => {
            kernelStore.setStatus(status as any, error)
        })

        // Get initial kernel state
        const initialStatus = await window.kernel.getStatus()
        kernelStore.setStatus(initialStatus)

        // Check if port already available, otherwise wait for it
        const initialPort = await window.kernel.getPort()
        if (initialPort) {
            kernelStore.setPort(initialPort)
        } else {
            await portReady
        }

        // Initialize workspace with last working directory (after kernel port is ready)
        workspace.rootDirectory = await window.cwd.getCwd()
        workspace.displayRootDirectory = await window.cwd.getDisplayCwd()
        await workspace.loadWorkspaceSettings()

        clearTimeout(timeout)
        callAppReady()
    } catch (error) {
        console.error('[App] Loading error:', error)
        clearTimeout(timeout)
        callAppReady()
    }

    // Set up window close handler
    window.windowControls.onBeforeClose(() => {
        workspace.saveDirtyTabs()
        workspace.saveWorkspaceSettings()
        window.cwd.setCwd(workspace.rootDirectory)
        window.cwd.setDisplayCwd(workspace.displayRootDirectory)
        window.windowControls.canClose()
    })
})
</script>

<template>
    <div class="window">
        <NavigationBar/>
        <div class="window-workspace">
            <div class="tool-bar">
                <div class="general-action">
                    <div
                        v-for="(item, index) in sidebarButtons.top"
                        :key="index"
                        class="badge"
                        :class="{ active: isTopButtonActive(index) }"
                        @click="workspace.handleTopButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>

                <div class="code-action">
                    <div
                        v-for="(item, index) in sidebarButtons.bottom"
                        :key="index"
                        class="badge"
                        :class="{ active: isBottomButtonActive(index) }"
                        @click="workspace.handleBottomButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>
            </div>

            <div class="workspace-wrapper">
                <div class="workspace">
                    <template v-if="hasWorkspace">
                        <div v-show="showExplorer || showSearch" class="sidebar-panel" :style="explorerStyle">
                            <FileExplorer v-show="showExplorer"/>
                            <SearchPanel v-show="showSearch"/>
                        </div>
                        <div v-show="showExplorer || showSearch" class="vertical-resizer"
                             @mousedown="workspace.startExplorerResize"></div>

                        <div class="editor-container">
                            <TabsBar v-if="hasTabs" :view-mode-buttons="viewModeButtons"/>
                            <div
                                v-if="hasTabs"
                                class="editor"
                                ref="editorPane"
                            >
                                <Editor/>

                                <div
                                    v-show="showCodePane && showPreviewPane"
                                    class="split-resizer"
                                    @mousedown="startPreviewResize"
                                ></div>

                                <Preview/>
                            </div>
                            <div v-else class="workspace-empty">
                                <p>Select a file from the explorer to start editing.</p>
                            </div>
                        </div>
                    </template>
                    <div v-else class="workspace-empty">
                        <p>Select a workspace from File &gt; Open or File &gt; New.</p>
                    </div>
                </div>

                <div
                    v-if="hasWorkspace && showTerminal"
                    class="horizontal-resizer"
                    @mousedown="workspace.startTerminalResize"
                ></div>
                <template v-if="hasWorkspace">
                    <Terminal v-show="showTerminal"/>
                </template>
            </div>
        </div>

        <div class="status-bar">
            <div class="status-bar-left">
                <div class="status-item" :class="'kernel-' + kernelStatus">
                    <span v-if="kernelStatus === 'running'" class="status-indicator"></span>
                    <span v-else-if="kernelStatus === 'starting'" class="status-indicator warning"></span>
                    <span v-else class="status-indicator error"></span>
                    <span>{{ kernelStatus === 'running' ? 'Ready' : kernelStatus === 'starting' ? 'Starting' : 'Kernel'}}</span>
                </div>
                <div class="status-item">
                    <span class="material-symbols-outlined">description</span>
                    <span>{{ hasTabs ? activeTab?.name : 'No file open' }}</span>
                </div>
            </div>
            <div class="status-bar-right">
                <div class="status-item">
                    <span>{{ workspace.currentLanguage }}</span>
                </div>
                <div class="status-item">
                    <span>{{ workspace.currentEncoding.toUpperCase() }}</span>
                </div>
            </div>
        </div>
    </div>
</template>