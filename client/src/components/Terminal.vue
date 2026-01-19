<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch} from 'vue'
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
watch(showTerminal, (newVal) => {
    if (newVal && fitAddon) {
        setTimeout(() => fitAddon!.fit(), 100)
    }
})

// Watch: resize terminal when height changes
watch(() => layoutState.value.terminalHeight, () => {
    setTimeout(handleResize, 50)
})

onMounted(async () => {
    await initializeXterm()
    await initializeTerminal(workspace.rootDirectory)
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
                <span>{{ 'Terminal' }}</span>
            </div>
        </div>
        <div class="terminal-host" ref="terminalHost"></div>
    </div>
</template>