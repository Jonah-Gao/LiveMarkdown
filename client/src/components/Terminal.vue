<script setup lang="ts">
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {useWorkspaceStore} from '@/stores/workspace'
import {
    initializeTerminal,
    ensureTerminalConnection,
    terminalInputAsync,
    terminalConnection
} from '@/services/terminalService.ts'
import {theme} from '@/styles/GithubTerminalTheme'

const workspace = useWorkspaceStore()
const {showTerminal, layoutState, terminalStyle} = storeToRefs(workspace)

const terminalHost = ref<HTMLElement | null>(null)

let xterm: XTerminal | null = null
let fitAddon: FitAddon | null = null

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
function handleTerminalOutput(output: string): void {
    if (xterm) {
        xterm.write(output)
    }
}

/**
 * Resize terminal to fit container.
 */
function handleResize(): void {
    if (fitAddon) {
        fitAddon.fit()
    }
}

/**
 * Initialize xterm terminal and connect to backend.
 */
async function initializeXterm(): Promise<void> {
    await ensureTerminalConnection()
    xterm = new XTerminal(TERMINAL_CONFIG)
    fitAddon = new FitAddon()

    xterm.loadAddon(fitAddon)
    if (terminalHost.value) {
        xterm.open(terminalHost.value)
        fitAddon.fit()
    }

    xterm.onData(async data => {
        await terminalInputAsync(data)
    })
}

// Watch: fit terminal when shown
watch(showTerminal, async (newVal) => {
    if (newVal && fitAddon) {
        await nextTick()
        fitAddon.fit()
    }
})

// Watch: resize terminal when height changes
watch(() => layoutState.value.terminalHeight, async () => {
    await nextTick()
    handleResize()
})

onMounted(async () => {
    await initializeXterm()
    await initializeTerminal(workspace.displayRootDirectory)
    terminalConnection.on('TerminalOutput', handleTerminalOutput)
    window.addEventListener('resize', handleResize)
})

onUnmounted(async () => {
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    window.removeEventListener('resize', handleResize)
    xterm?.dispose()
    xterm = null
})
</script>

<template>
    <div class="terminal-container" :style="terminalStyle">
        <div class="terminal-title-bar">
            <div class="terminal-title">
                <span>{{ 'TERMINAL' }}</span>
            </div>
        </div>
        <div class="terminal-host" ref="terminalHost"></div>
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
    padding: 0 12px;
    font-size: 12px;
    align-items: center;
    cursor: default;
    user-select: none;
    flex-shrink: 0;
    background-color: var(--bg-tertiary);
    //border-bottom: 1px solid var(--widget-border-color);
    gap: 12px;
}

.terminal-title {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 2px;
    color: var(--text-primary);
    font-weight: 500;
    position: relative;
}

.terminal-title::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background-color: var(--accent-color-secondary);
}

.terminal-title span {
    padding: 0;
    box-shadow: none;
}

.terminal-host {
    flex: 1;
    overflow: hidden;
    background-color: var(--bg-tertiary);
}

.terminal-host :deep(.xterm) {
    padding: 12px 16px;
    height: 100%;
}
</style>