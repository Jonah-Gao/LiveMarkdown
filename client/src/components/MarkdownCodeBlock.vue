<script setup lang="ts">
import {getKernelConnection, ensureKernelServiceConnection, executePythonCodeAsync, pythonInputAsync} from "@/services/kernelService.ts";
import {onMounted, onUnmounted, ref, nextTick, watch} from "vue";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import '@xterm/xterm/css/xterm.css';
import terminalTheme from "@/styles/GithubTerminalTheme.json";
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import {v4 as uuidv4} from "uuid";
import {useWorkspaceStore} from "@/stores/workspace.ts";
import {useKernelStore} from "@/stores/kernel.ts";

const props = defineProps<{ code: string, lang: string }>();
const mdTerminal = ref<HTMLDivElement | null>(null);
const terminal = ref<HTMLDivElement | null>(null); // Renamed to avoid confusion
const codeEl = ref<HTMLElement | null>(null)
const workspace = useWorkspaceStore()
const kernelStore = useKernelStore()

const terminalId: string = uuidv4();
let xterm: Terminal | null = null;

let fitAddon: FitAddon | null = null;
// Define callback reference for easier disposal later
const onOutputReceived = (targetId: string, output: string) => {
    console.log('[SignalR] Received:', output);
    if (terminalId !== targetId) return;
    // 1. Ensure container is visible
    if (mdTerminal.value && mdTerminal.value.style.display !== 'block') {
        mdTerminal.value.style.display = 'block';
        // After container becomes block, must re-fit, otherwise xterm thinks its size is 0
        // Use nextTick to ensure DOM rendering is complete
        nextTick(() => {
            fitAddon?.fit();
        });

    }
    // 2. Write to Xterm
    // Note: Handle line breaks, backend python print defaults to \n, xterm needs \r\n
    if (xterm) {
        // Simple line break fix to prevent stepped output
        const formatted = output.replace(/\n/g, '\r\n');
        xterm.write(formatted);
    }

};
const onCodeExecutionCompleted = (targetId: string) => {
    if (terminalId !== targetId) return;
    console.log(`[SignalR] Code execution completed for terminal ${terminalId}`);
    if (xterm) {
        xterm.options.cursorBlink = false;
        xterm.options.cursorStyle = 'block';
    }

};
onMounted(async () => {
    // 1. Initialize Terminal UI
    initializeTerminal();

    // Wait for kernel to be running
    if (!kernelStore.isRunning) {
        console.log('Waiting for kernel to start...')
        return
    }

    // 2. Register SignalR listener
    await ensureKernelServiceConnection()
    const conn = getKernelConnection()
    conn.off('CodeOutput');
    conn.on('CodeOutput', onOutputReceived);
    conn.on('CodeExecutionCompleted', onCodeExecutionCompleted);
});
onUnmounted(() => {
    // Cleanup
    if (kernelStore.isRunning) {
        try {
            const conn = getKernelConnection()
            conn.off('CodeOutput', onOutputReceived);
        } catch (e) {
            // Ignore if kernel not running
        }
    }
    xterm?.dispose();
    xterm = null;
});

watch(
    [() => props.code, () => props.lang],
    async () => {
        await nextTick()
        const el = codeEl.value
        if (!el) return

        // remove previous highlight
        delete (el as any).dataset.highlighted

        // hljs highlight
        hljs.highlightElement(el)
    },
    {immediate: true}
)

function initializeTerminal() {
    xterm = new Terminal({
        fontFamily: 'JetBrains Mono, monospace',
        cursorBlink: true,
        rows: 10,
        cols: 20,
        fontSize: 13,
        lineHeight: 1.2,
        theme: terminalTheme,
        convertEol: true
    });

    fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminal.value!);

    // Initial fit might be invalid (because parent container might be hidden), but do it anyway
    fitAddon.fit();
    xterm.onData(async data => {
        await pythonInputAsync(terminalId, data);
    })
}

async function executeCodeBlock() {
    // When clicking execute, show terminal and fit first
    if (mdTerminal.value) {
        mdTerminal.value.style.display = 'block';
        xterm?.clear(); // Clear previous run results
        fitAddon?.fit();
    }

    const venvPath = window.nodePath.join(workspace.rootDirectory, '.venv');

    await executePythonCodeAsync(terminalId, props.code, workspace.pythonInterpreterPath, venvPath)
}

function copyCodeBlock() {
    navigator.clipboard.writeText(props.code).then(() => {
        console.log('Code copied to clipboard')
    }).catch(err => {
        console.error('Failed to copy code: ', err)
    })
}

</script>

<template>
    <div class="md-code-wrapper">
        <div class="md-code-actions">
            <div class="md-icon-btn md-execute-btn" @click="executeCodeBlock">
                <span class="material-symbols-outlined">play_arrow</span>
            </div>
            <div class="md-icon-btn md-copy-btn" @click="copyCodeBlock">
                <span class="material-symbols-outlined">content_copy</span>
            </div>
        </div>
        <pre><code ref="codeEl" :class="`language-${lang}`">{{ code }}</code></pre>
        <div class="md-output-console" id="md-terminal" ref="mdTerminal">
            <div id="terminal" ref="terminal"></div>
        </div>
    </div>
</template>

<style scoped>
pre code.hljs {
    padding: 0;
}
</style>