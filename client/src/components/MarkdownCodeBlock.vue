<script setup lang="ts">
import {kernelConnection} from "@/services/kernelSignalr.ts";
import {onMounted, onUnmounted, ref, nextTick, watch} from "vue";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import '@xterm/xterm/css/xterm.css';
import {theme} from "@/styles/GithubTerminalTheme.ts";
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import {v4 as uuidv4} from "uuid";

const props = defineProps<{ code: string, lang: string }>();
const mdTerminal = ref<HTMLDivElement | null>(null);
const terminal = ref<HTMLDivElement | null>(null); // Renamed to avoid confusion
const codeEl = ref<HTMLElement | null>(null)

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
    // 2. Register SignalR listener
    // Remove old listener with same name first (prevent duplicate printing caused by hot reload or component reuse)
    // TODO: add function to run code in Run terminal
    kernelConnection.off('CodeOutput');
    kernelConnection.on('CodeOutput', onOutputReceived);

    kernelConnection.on('CodeExecutionCompleted', onCodeExecutionCompleted);
    // 3. Ensure connection is started
    if (kernelConnection.state !== 'Connected') {
        try {
            await kernelConnection.start();
            console.log('SignalR Connected');
        } catch (err) {
            console.error('SignalR Start Failed', err);
        }
    }

});
onUnmounted(() => {
    // Cleanup
    kernelConnection.off('CodeOutput', onOutputReceived);
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
        theme: theme,
        convertEol: true
    });

    fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminal.value!);

    // Initial fit might be invalid (because parent container might be hidden), but do it anyway
    fitAddon.fit();
    xterm.onData(data => {
        console.log('Input:', JSON.stringify(data));
        kernelConnection.invoke('PythonInput', terminalId, data);
    })
}

async function executeCodeBlock() {
    // When clicking execute, show terminal and fit first
    if (mdTerminal.value) {
        mdTerminal.value.style.display = 'block';
        xterm?.clear(); // Clear previous run results
        fitAddon?.fit();
    }

    try {
        console.log("Invoking ExecuteCodeAsync...");
        // It's recommended to let the backend handle the path, don't pass absolute paths from the frontend, it's unsafe and inflexible
        // TODO: Remove hardcoded paths. These should be configured on the server side or passed via configuration.
        await kernelConnection.invoke(
            'ExecuteCodeAsync',
            terminalId,
            props.code,
            "C:\\Users\\OOOOMGOSH\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
            "E:\\CS_NEA_Project\\test\\.venv"
        );
    } catch (err) {
        console.error('Error invoking code:', err);
        xterm?.writeln(`\r\n[Error] ${err}`);
    }
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
            <div class="md-icon-btn md-execute-terminal-btn">
                <span class="material-symbols-outlined">fast_forward</span>
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