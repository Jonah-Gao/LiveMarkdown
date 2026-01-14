<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {Terminal as XTerminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {v4 as uuidv4} from 'uuid'
import * as signalR from '@microsoft/signalr'
import {useWorkspaceStore} from '@/stores/workspace'
import {terminalConnection, ensureTerminalConnection} from '@/services/terminalSignalr'
import {kernelConnection} from '@/services/kernelSignalr'
import {theme} from '@/styles/GithubTerminalTheme'

const workspace = useWorkspaceStore()
const {showRunTerminal, showTerminal, layoutState, rootDirectory, terminalStyle} = storeToRefs(workspace)

const terminalHost = ref<HTMLElement | null>(null)
const runTerminalHost = ref<HTMLElement | null>(null)

let xterm: XTerminal | null = null
let fitAddon: FitAddon | null = null
let runXterm: XTerminal | null = null
let runFitAddon: FitAddon | null = null
const runTerminalId = uuidv4()

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

const RUN_TERMINAL_CONFIG = {
    ...TERMINAL_CONFIG,
    rows: 14
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
    if (runFitAddon) {
        runFitAddon.fit()
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

function ensureRunTerminal() {
    if (runXterm || !runTerminalHost.value) {
        return
    }

    runXterm = new XTerminal(RUN_TERMINAL_CONFIG)
    runFitAddon = new FitAddon()
    runXterm.loadAddon(runFitAddon)
    runXterm.open(runTerminalHost.value)
    runFitAddon.fit()

    runXterm.onData(data => {
        kernelConnection.invoke('PythonInput', runTerminalId, data);
    })
}

async function ensureKernelConnected() {
    if (kernelConnection.state === signalR.HubConnectionState.Disconnected) {
        await kernelConnection.start();
    }
}

function getRunPaths() {
    const pyEnv = (window as any).process?.env?.PYTHON_PATH;
    const pythonPath = pyEnv && typeof pyEnv === 'string' && pyEnv.length > 0 ? pyEnv : 'python';
    const nodePath = (window as any).nodePath;
    const separator = rootDirectory.value.endsWith('/') ? '' : '/';
    const fallbackVenv = `${rootDirectory.value}${separator}.venv`;
    const venvPath = nodePath?.join
        ? nodePath.join(rootDirectory.value, '.venv')
        : fallbackVenv;
    return {pythonPath, venvPath};
}

function handleRunOutput(targetId: string, output: string) {
    if (targetId !== runTerminalId || !runXterm) return;
    if (!showRunTerminal.value) {
        workspace.activeIndexBottom = 0;
    }
    const formatted = output.replace(/\n/g, '\r\n')
    runXterm.write(formatted)
}

function handleRunCompletion(targetId: string) {
    if (targetId !== runTerminalId || !runXterm) return;
    runXterm.options.cursorBlink = false;
    runXterm.options.cursorStyle = 'block';
}

function openRunTerminal() {
    workspace.activeIndexBottom = 0
    ensureRunTerminal()
    setTimeout(() => runFitAddon?.fit(), 50)
}

async function runCodeInTerminal(codeToRun: string, lang?: string, options?: { clear?: boolean }) {
    await ensureKernelConnected()
    openRunTerminal()
    if (options?.clear !== false) {
        runXterm?.clear()
    }
    const {pythonPath, venvPath} = getRunPaths()
    try {
        await kernelConnection.invoke(
            'ExecuteCodeAsync',
            runTerminalId,
            codeToRun,
            pythonPath,
            venvPath
        )
    } catch (err) {
        console.error('Error invoking code run:', err)
        runXterm?.writeln(`\r\n[Error] ${err}`)
    }
}

watch(showTerminal, (newVal) => {
    if (newVal && fitAddon) {
        setTimeout(() => fitAddon!.fit(), 100)
    }
})

watch(showRunTerminal, (newVal) => {
    if (newVal) {
        ensureRunTerminal()
    }
    if (newVal && runFitAddon) {
        setTimeout(() => runFitAddon!.fit(), 100)
    }
})

watch(() => layoutState.value.TerminalHeight, () => {
    setTimeout(handleResize, 50)
})

onMounted(async () => {
    await initializeTerminal()
    await ensureKernelConnected()
    kernelConnection.off('CodeOutput', handleRunOutput)
    kernelConnection.off('CodeExecutionCompleted', handleRunCompletion)
    kernelConnection.on('CodeOutput', handleRunOutput)
    kernelConnection.on('CodeExecutionCompleted', handleRunCompletion)
    try {
        await terminalConnection.invoke('TerminalInit')
    } catch (err) {
        console.error('Terminal initialization failed:', err)
    }
    workspace.registerRunTerminalApi({runCode: runCodeInTerminal, open: openRunTerminal})
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    terminalConnection.on('TerminalOutput', handleTerminalOutput)
    window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    workspace.registerRunTerminalApi(null)
    terminalConnection.off('TerminalOutput', handleTerminalOutput)
    xterm?.dispose()
    runXterm?.dispose()
    terminalConnection.stop().catch(err => console.error('Error closing terminal connection:', err))
    kernelConnection.off('CodeOutput', handleRunOutput)
    kernelConnection.off('CodeExecutionCompleted', handleRunCompletion)
})
</script>

<template>
    <div class="terminal-container" :style="terminalStyle">
        <div class="terminal-title-bar">
            <div class="terminal-title">
                <span>{{ showRunTerminal ? 'Run Output' : 'Terminal' }}</span>
            </div>
        </div>
        <div v-if="showRunTerminal" class="terminal-host" ref="runTerminalHost"></div>
        <div v-else class="terminal-host" ref="terminalHost"></div>
    </div>
</template>
