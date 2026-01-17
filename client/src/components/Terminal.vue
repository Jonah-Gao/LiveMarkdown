<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import * as signalR from '@microsoft/signalr'
import {useWorkspaceStore} from '@/stores/workspace'
import {terminalConnection, ensureTerminalConnection} from '@/services/terminalSignalr'
import {kernelConnection} from '@/services/kernelSignalr'
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
async function initializeTerminal(): Promise<void> {
    await ensureTerminalConnection()
    xterm = new XTerminal(TERMINAL_CONFIG)
    fitAddon = new FitAddon()

    xterm.loadAddon(fitAddon)
    if (terminalHost.value) {
        xterm.open(terminalHost.value)
        fitAddon.fit()
    }

    xterm.onData(data => {
        terminalConnection.invoke('TerminalInput', data)
    })
}

/**
 * Ensure kernel connection is established.
 */
async function ensureKernelConnected(): Promise<void> {
    if (kernelConnection.state === signalR.HubConnectionState.Disconnected) {
        await kernelConnection.start()
    }
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
    await initializeTerminal()
    await ensureKernelConnected()
    try {
        await terminalConnection.invoke('TerminalInit', workspace.rootDirectory)
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    terminalConnection.on('TerminalOutput', handleTerminalOutput)
    window.addEventListener('resize', handleResize)
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