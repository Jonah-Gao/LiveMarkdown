<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
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

function handleTerminalOutput(output: string) {
    if (xterm) {
        xterm.write(output)
    }
}

function handleResize() {
    if (fitAddon) {
        fitAddon.fit()
    }
}

async function initializeTerminal() {
    await ensureTerminalConnection()
    xterm = new XTerminal(TERMINAL_CONFIG)
    fitAddon = new FitAddon()

    xterm.loadAddon(fitAddon)
    if (terminalHost.value) {
        xterm.open(terminalHost.value)
        fitAddon.fit()
    }

    xterm.onData(data => {
        terminalConnection.invoke('TerminalInput', data);
    })
}

async function ensureKernelConnected() {
    if (kernelConnection.state === signalR.HubConnectionState.Disconnected) {
        await kernelConnection.start();
    }
}

watch(showTerminal, (newVal) => {
    if (newVal && fitAddon) {
        setTimeout(() => fitAddon!.fit(), 100)
    }
})

watch(() => layoutState.value.TerminalHeight, () => {
    setTimeout(handleResize, 50)
})

onMounted(async () => {
    await initializeTerminal()
    await ensureKernelConnected()
    try {
        await terminalConnection.invoke('TerminalInit')
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    terminalConnection.on('TerminalOutput', handleTerminalOutput)
    window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    xterm?.dispose()
    terminalConnection.stop().catch(err => console.error('Error closing terminal connection:', err))
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