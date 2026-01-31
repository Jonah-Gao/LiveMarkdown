<script setup lang="ts">
import {nextTick, onMounted, onUnmounted, ref, watch, reactive, computed} from 'vue'
import {storeToRefs} from 'pinia'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {useWorkspaceStore} from '@/stores/workspace'
import {
    initializeTerminal,
    ensureTerminalConnection,
    terminalInputAsync,
    terminalConnection,
    closeTerminalSession
} from '@/services/terminalService.ts'
import theme from '@/styles/GithubTerminalTheme.json'
import {v4 as uuidv4} from 'uuid'

interface TerminalTab {
    id: string
    name: string
    xterm: XTerminal | null
    fitAddon: FitAddon | null
    containerRef: HTMLElement | null
    fitAddonLoaded?: boolean
    disposed?: boolean
}

const workspace = useWorkspaceStore()
const {showTerminal, layoutState, terminalStyle} = storeToRefs(workspace)

// Terminal tabs management
const terminalTabs = reactive<TerminalTab[]>([])
const activeTabIndex = ref(0)

// Computed active tab ID for v-show binding
const activeTabId = computed(() => terminalTabs[activeTabIndex.value]?.id)

const TERMINAL_CONFIG = {
    fontFamily: 'JetBrains Mono, monospace',
    cursorBlink: true,
    rows: 20,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: 0,
    theme: theme,
    convertEol: true,
}

/**
 * Handle terminal output from SignalR.
 */
function handleTerminalOutput(output: string, sessionId?: string): void {
    // Find the tab for this session
    const tab = sessionId
        ? terminalTabs.find(t => t.id === sessionId)
        : terminalTabs[activeTabIndex.value]

    if (tab?.xterm) {
        tab.xterm.write(output)
    }
}

/**
 * Resize terminal to fit container.
 */
function handleResize(): void {
    const activeTab = terminalTabs[activeTabIndex.value]
    if (activeTab?.fitAddon) {
        activeTab.fitAddon.fit()
    }
}

/**
 * Set container ref for a terminal tab.
 */
function setContainerRef(el: HTMLElement | null, tab: TerminalTab): void {
    // Always keep the latest element in case Vue re-creates the host node
    if (el) tab.containerRef = el

    if (el && !tab.xterm) {
        initializeXtermForTab(tab)
    }
}

/**
 * Create a new terminal tab.
 */
async function createTerminalTab(): Promise<void> {
    const tabId = uuidv4()
    const tabNumber = terminalTabs.length + 1

    const newTab: TerminalTab = {
        id: tabId,
        name: `Terminal ${tabNumber}`,
        xterm: null,
        fitAddon: null,
        containerRef: null
    }

    terminalTabs.push(newTab)
    activeTabIndex.value = terminalTabs.length - 1

    // Container will be set via ref callback
    await nextTick()
}

/**
 * Initialize xterm terminal for a specific tab.
 */
async function initializeXtermForTab(tab: TerminalTab): Promise<void> {
    if (!tab.containerRef) return

    await ensureTerminalConnection()

    tab.disposed = false
    tab.fitAddonLoaded = false

    tab.xterm = new XTerminal(TERMINAL_CONFIG)
    tab.fitAddon = new FitAddon()

    tab.xterm.loadAddon(tab.fitAddon)
    tab.fitAddonLoaded = true

    tab.xterm.open(tab.containerRef)
    tab.fitAddon.fit()

    tab.xterm.onData(async data => {
        await terminalInputAsync(tab.id, data)
    })

    await initializeTerminal(tab.id, workspace.displayRootDirectory)
}

function disposeTabTerminal(tab: TerminalTab): void {
    if (tab.disposed) return
    tab.disposed = true

    // Dispose addon only if it was actually loaded for this terminal instance
    if (tab.fitAddon && tab.fitAddonLoaded) {
        try { tab.fitAddon.dispose() } catch { /* noop */ }
    }
    tab.fitAddon = null
    tab.fitAddonLoaded = false

    if (tab.xterm) {
        try { tab.xterm.dispose() } catch { /* noop */ }
    }
    tab.xterm = null
    tab.containerRef = null
}

/**
 * Switch to a terminal tab.
 */
async function switchTab(index: number): Promise<void> {
    if (index < 0 || index >= terminalTabs.length) return
    if (index === activeTabIndex.value) return

    activeTabIndex.value = index

    // Fit the newly visible terminal
    await nextTick()
    const newTab = terminalTabs[index]
    if (newTab?.fitAddon) {
        newTab.fitAddon.fit()
    }
}

/**
 * Close a terminal tab.
 */
async function closeTab(index: number, event: Event): Promise<void> {
    event.stopPropagation()

    if (terminalTabs.length <= 1) return

    const tab = terminalTabs[index]
    if (!tab) return

    await closeTerminalSession(tab.id)

    disposeTabTerminal(tab)

    terminalTabs.splice(index, 1)

    // Adjust active index
    if (activeTabIndex.value >= terminalTabs.length) {
        activeTabIndex.value = terminalTabs.length - 1
    } else if (activeTabIndex.value > index) {
        activeTabIndex.value--
    }

    // Fit the now-active terminal
    await nextTick()
    handleResize()
}

// Watch: fit terminal when shown
watch(showTerminal, async (newVal) => {
    if (newVal) {
        await nextTick()
        handleResize()
    }
})

// Watch: resize terminal when height changes
watch(() => layoutState.value.terminalHeight, async () => {
    await nextTick()
    handleResize()
})

onMounted(async () => {
    await ensureTerminalConnection()
    terminalConnection.on('TerminalOutput', handleTerminalOutput)
    terminalConnection.on('TerminalOutputSession', handleTerminalOutput)
    window.addEventListener('resize', handleResize)

    // Create initial terminal tab
    await createTerminalTab()
})

onUnmounted(async () => {
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    terminalConnection.off('TerminalOutputSession', handleTerminalOutput)
    window.removeEventListener('resize', handleResize)

    for (const tab of terminalTabs) {
        disposeTabTerminal(tab)
    }
})
</script>

<template>
    <div class="terminal-container" :style="terminalStyle">
        <div class="terminal-title-bar">
            <div class="terminal-tabs">
                <div
                    v-for="(tab, index) in terminalTabs"
                    :key="tab.id"
                    class="terminal-tab"
                    :class="{ active: index === activeTabIndex }"
                    @click="switchTab(index)"
                >
                    <span class="tab-name">{{ tab.name }}</span>
                    <span
                        v-if="terminalTabs.length > 1"
                        class="material-symbols-outlined tab-close"
                        @click="closeTab(index, $event)"
                    >close</span>
                </div>
            </div>
            <div class="terminal-actions">
                <div class="terminal-action" @click="createTerminalTab" title="New Terminal">
                    <span class="material-symbols-outlined">add</span>
                </div>
            </div>
        </div>
        <div class="terminal-hosts">
            <div
                v-for="tab in terminalTabs"
                :key="tab.id"
                class="terminal-host"
                :class="{ active: tab.id === activeTabId }"
                :ref="(el) => setContainerRef(el as HTMLElement, tab)"
            ></div>
        </div>
    </div>
</template>

<style scoped>
.terminal-container {
    display: flex;
    flex-direction: column;
    min-height: 150px;
    max-height: 80vh;
    background-color: var(--bg-tertiary);
    overflow: hidden;
}

.terminal-title-bar {
    display: flex;
    height: 35px;
    padding: 0 8px;
    font-size: 12px;
    align-items: center;
    justify-content: space-between;
    cursor: default;
    user-select: none;
    flex-shrink: 0;
    background-color: var(--bg-tertiary);
    border-bottom: 1px solid var(--widget-border-color);
}

.terminal-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    flex: 1;
    min-width: 0;
}

.terminal-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
}

.terminal-tab:hover {
    background-color: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
}

.terminal-tab.active {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.tab-name {
    font-size: 12px;
    font-weight: 500;
}

.tab-close {
    font-size: 14px;
    padding: 2px;
    border-radius: 4px;
    opacity: 0.6;
    transition: opacity var(--transition-fast), background-color var(--transition-fast);
}

.tab-close:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.1);
}

.terminal-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.terminal-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: background-color var(--transition-fast), color var(--transition-fast);
}

.terminal-action:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.terminal-action span {
    font-size: 18px;
}

.terminal-hosts {
    flex: 1;
    display: flex;
    position: relative;
    overflow: hidden;
}

.terminal-host {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    background-color: var(--bg-tertiary);
    display: none;
}

.terminal-host.active {
    display: block;
}

.terminal-host :deep(.xterm) {
    padding: 12px 16px;
    height: 100%;
}
</style>