<script setup lang="ts">
// ==================== IMPORTS ====================
import {computed, onBeforeUnmount, onMounted, provide, reactive, ref, watch} from 'vue'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import '../styles/github-markdown.css'
import 'highlight.js/styles/github-dark.css'
import * as signalR from '@microsoft/signalr'
import {CodeEditor} from 'monaco-editor-vue3'
import FileTreeNode from './FileTreeNode.vue'
import {MarkdownParser} from '@markdown/markdown'
import {kernelConnection} from "@/services/kernelSignalr.ts";
import {layoutConnection} from "@/services/layoutSignalr.ts";
import {theme} from "@/styles/GithubTerminalTheme.ts";
import SIGNALR_CONFIG_JSON from '@/config/signalr.json'
import {v4 as uuidv4} from "uuid";

// ==================== TYPES ====================
interface FileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children?: FileNode[]
    expanded?: boolean
}

interface FileIndexEntry {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    parentPath?: string
    depth: number
}

interface Tab {
    id: string
    name: string
    path: string
    content: string
    isDirty: boolean
}

interface TabChunk {
    id: string
    name: string
    path: string
    content: string
    isMetadata: boolean
    isError: boolean
}

type ViewMode = 'code' | 'split' | 'preview'

interface PanelLayout {
    ExplorerWidth: number
    TerminalHeight: number
    EditorPreviewRatio: number
    PreferredViewMode: ViewMode
}

// ==================== CONSTANTS ====================
const SIGNALR_CONFIG = SIGNALR_CONFIG_JSON

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

const EDITOR_OPTIONS = {
    fontSize: 14,
    minimap: {enabled: true},
    automaticLayout: true,
    wordWrap: 'on'
}

const SIDEBAR_BUTTONS = {
    top: [
        {icon: 'folder', panel: 'explorer'},
        {icon: 'search', panel: 'search'},
        {icon: 'account_circle', panel: 'account'}
    ],
    bottom: [
        {icon: 'play_arrow', panel: 'run'},
        {icon: 'terminal', panel: 'terminal'}
    ]
}

const VIEW_MODE_BUTTONS: { value: ViewMode, icon: string, label: string }[] = [
    {value: 'code', icon: 'code', label: 'Code only'},
    {value: 'split', icon: 'split_scene', label: 'Code & Preview'},
    {value: 'preview', icon: 'visibility', label: 'Preview only'}
]

const DEFAULT_UNTITLED_NAME = 'Untitled.md'

const MIN_EXPLORER_WIDTH = 160
const MAX_EXPLORER_WIDTH = 520
const MIN_TERMINAL_HEIGHT = 150
const MAX_TERMINAL_HEIGHT = 900
const MIN_PREVIEW_RATIO = 0.15
const MAX_PREVIEW_RATIO = 0.85

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.py': 'python',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.java': 'java',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.sql': 'sql',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.vue': 'vue'
}

const RUN_TERMINAL_KEY = 'runTerminal'

// ==================== STATE ====================
// UI State
const activeIndexTop = ref<number | null>(0)
const activeIndexBottom = ref<number | null>(null)
const explorerVisible = ref(true)

// Editor State
const code = ref('# Untitled')
const tabs = ref<Tab[]>([
    {
        id: 'untitled-1',
        name: DEFAULT_UNTITLED_NAME,
        path: '',
        content: '# Untitled',
        isDirty: false,
    }
])
const activeTabIndex = ref(0)
const currentViewMode = ref<ViewMode>('split')

// Layout persistence State
const layoutState = reactive<PanelLayout>({
    ExplorerWidth: 240,
    TerminalHeight: 250,
    EditorPreviewRatio: 0.5,
    PreferredViewMode: 'split'
})

// File Explorer State
const fileTree = ref<FileNode[]>([])
// TODO: Change this hardcoded path to a dynamic one or a configuration
const rootDirectory = ref('E:\\CS_NEA_Project\\test')

// Terminal State
const terminal = ref<HTMLElement | null>(null)
const runTerminal = ref<HTMLElement | null>(null)
const explorerPane = ref<HTMLElement | null>(null)
const editorPane = ref<HTMLElement | null>(null)
const workspaceWrapper = ref<HTMLElement | null>(null)
let xterm: Terminal
let fitAddon: FitAddon
let runXterm: Terminal | null = null
let runFitAddon: FitAddon | null = null
const runTerminalId = uuidv4()

const resizeState = reactive({
    type: null as 'explorer' | 'preview' | 'terminal' | null,
    startX: 0,
    startY: 0,
    startSize: 0,
    containerWidth: 0
})
let deepIndexSubscription: signalR.ISubscription<FileIndexEntry> | null = null

// ==================== SIGNALR CONNECTIONS ====================
const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.terminalHub)
    .build()

const fileServiceConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.fileHub)
    .build();

// ==================== MARKDOWN ====================
const md = new MarkdownParser()

const renderedVNode = computed(() => md.render(code.value))

// ==================== COMPUTED ====================
const activeTab = computed(() => tabs.value[activeTabIndex.value] ?? null)
const isMarkdownTab = computed(() => {
    const name = activeTab.value?.name?.toLowerCase() || ''
    const path = activeTab.value?.path?.toLowerCase() || ''
    return name.endsWith('.md') || path.endsWith('.md')
})
const showExplorer = computed(() => activeIndexTop.value === 0 && explorerVisible.value)
const showRunTerminal = computed(() => activeIndexBottom.value === 0)
const showTerminal = computed(() => activeIndexBottom.value === 1)
const showTerminalArea = computed(() => showTerminal.value || showRunTerminal.value)
const showPreviewPane = computed(() => isMarkdownTab.value && currentViewMode.value !== 'code')
const showCodePane = computed(() => !isMarkdownTab.value || currentViewMode.value !== 'preview')
const explorerStyle = computed(() => ({width: `${layoutState.ExplorerWidth}px`}))
const terminalStyle = computed(() => ({height: `${layoutState.TerminalHeight}px`}))
const currentLanguage = computed(() => {
    const name = (activeTab.value?.path || activeTab.value?.name || '').toLowerCase()
    const extIndex = name.lastIndexOf('.')
    const ext = extIndex >= 0 ? name.slice(extIndex) : ''
    if (ext && LANGUAGE_BY_EXTENSION[ext]) {
        return LANGUAGE_BY_EXTENSION[ext]
    }
    return isMarkdownTab.value ? 'markdown' : 'plaintext'
})
const editorPaneStyle = computed(() => {
    if (!showCodePane.value) {
        return {display: 'none'}
    }
    if (!showPreviewPane.value) {
        return {flex: 1, minWidth: 0}
    }
    return {flex: layoutState.EditorPreviewRatio, minWidth: 0}
})
const previewPaneStyle = computed(() => {
    if (!showPreviewPane.value) {
        return {display: 'none'}
    }
    if (!showCodePane.value) {
        return {flex: 1, minWidth: 0}
    }
    return {flex: 1 - layoutState.EditorPreviewRatio, minWidth: 0}
})

// ==================== TERMINAL HANDLERS ====================
terminalConnection.on('TerminalOutput', (output: string) => {
    console.log('TerminalOutput:', JSON.stringify(output));
    if (xterm) {
        xterm.write(output)
    }
})

function initializeTerminal() {
    xterm = new Terminal(TERMINAL_CONFIG)
    fitAddon = new FitAddon()

    xterm.loadAddon(fitAddon)
    xterm.open(terminal.value!)
    fitAddon.fit()

    xterm.onData(data => {
        console.log('Input:', JSON.stringify(data));
        terminalConnection.invoke('TerminalInput', data);
    })
}

function handleResize() {
    if (fitAddon) {
        fitAddon.fit()
    }
    if (runFitAddon) {
        runFitAddon.fit()
    }
}

// ==================== RUN TERMINAL ====================
function ensureRunTerminal() {
    if (runXterm || !runTerminal.value) {
        return
    }

    runXterm = new Terminal(RUN_TERMINAL_CONFIG)
    runFitAddon = new FitAddon()
    runXterm.loadAddon(runFitAddon)
    runXterm.open(runTerminal.value)
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
        activeIndexBottom.value = 0;
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
    activeIndexBottom.value = 0
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

provide(RUN_TERMINAL_KEY, {runCode: runCodeInTerminal, open: openRunTerminal})

// ==================== UI HANDLERS ====================
function handleTopButtonClick(index: number) {
    if (activeIndexTop.value === index) {
        if (index === 0) {
            explorerVisible.value = !explorerVisible.value
        } else {
            activeIndexTop.value = null
        }
    } else {
        activeIndexTop.value = index
        if (index === 0) {
            explorerVisible.value = true
        }
    }
}

function handleBottomButtonClick(index: number) {
    if (activeIndexBottom.value === index) {
        activeIndexBottom.value = null
    } else {
        activeIndexBottom.value = index
        if (index === 0) {
            openRunTerminal()
        } else if (index === 1 && fitAddon) {
            setTimeout(() => fitAddon.fit(), 100)
        }
    }
}

function toggleExplorer() {
    explorerVisible.value = !explorerVisible.value
    if (!explorerVisible.value) {
        activeIndexTop.value = null
    }
}

function openTab(tab: Tab) {
    activeTabIndex.value = tabs.value.findIndex(t => t.id === tab.id)
    code.value = tab.content
    applyViewModeForActiveTab()
}

function closeTab(tab: Tab) {
    const index = tabs.value.findIndex(t => t.id === tab.id)
    if (index !== -1) {
        tabs.value.splice(index, 1)
        if (activeTabIndex.value === index) {
            activeTabIndex.value = Math.max(0, index - 1)
            code.value = tabs.value[activeTabIndex.value]?.content || ''
            applyViewModeForActiveTab()
        }
    }
}

function applyViewModeForActiveTab() {
    currentViewMode.value = isMarkdownTab.value ? layoutState.PreferredViewMode : 'code'
}

function setViewMode(mode: ViewMode) {
    if (!isMarkdownTab.value) {
        return
    }
    currentViewMode.value = mode
    layoutState.PreferredViewMode = mode
    scheduleLayoutSave()
}

// ==================== RESIZE HANDLERS ====================
function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

function startExplorerResize(event: MouseEvent) {
    if (!showExplorer.value) return
    resizeState.type = 'explorer'
    resizeState.startX = event.clientX
    resizeState.startSize = layoutState.ExplorerWidth
    attachResizeListeners()
}

function startPreviewResize(event: MouseEvent) {
    if (!showPreviewPane.value || !showCodePane.value || !editorPane.value) return
    const rect = editorPane.value.getBoundingClientRect()
    resizeState.type = 'preview'
    resizeState.startX = event.clientX
    resizeState.containerWidth = rect.width
    resizeState.startSize = rect.width * layoutState.EditorPreviewRatio
    attachResizeListeners()
}

function startTerminalResize(event: MouseEvent) {
    if (!showTerminalArea.value) return
    resizeState.type = 'terminal'
    resizeState.startY = event.clientY
    resizeState.startSize = layoutState.TerminalHeight
    attachResizeListeners()
}

function attachResizeListeners() {
    window.addEventListener('mousemove', handleResizeDrag)
    window.addEventListener('mouseup', stopResize)
    document.body.style.userSelect = 'none'
}

function handleResizeDrag(event: MouseEvent) {
    if (resizeState.type === 'explorer') {
        const delta = event.clientX - resizeState.startX
        layoutState.ExplorerWidth = clamp(resizeState.startSize + delta, MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH)
    } else if (resizeState.type === 'preview') {
        const delta = event.clientX - resizeState.startX
        const allowedMin = resizeState.containerWidth * MIN_PREVIEW_RATIO
        const allowedMax = resizeState.containerWidth * MAX_PREVIEW_RATIO
        const newWidth = clamp(resizeState.startSize + delta, allowedMin, allowedMax)
        const safeContainerWidth = Math.max(resizeState.containerWidth, 1)
        layoutState.EditorPreviewRatio = clamp(newWidth / safeContainerWidth, MIN_PREVIEW_RATIO, MAX_PREVIEW_RATIO)
    } else if (resizeState.type === 'terminal') {
        const delta = resizeState.startY - event.clientY
        layoutState.TerminalHeight = clamp(resizeState.startSize + delta, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT)
    }
}

function stopResize() {
    if (!resizeState.type) return
    window.removeEventListener('mousemove', handleResizeDrag)
    window.removeEventListener('mouseup', stopResize)
    document.body.style.userSelect = ''
    if (resizeState.type === 'terminal') {
        setTimeout(() => {
            if (showTerminal.value && fitAddon) {
                fitAddon.fit()
            }
            if (showRunTerminal.value && runFitAddon) {
                runFitAddon.fit()
            }
        }, 50)
    }
    resizeState.type = null
    scheduleLayoutSave()
}

// ==================== FILE EXPLORER ====================
async function readDirAsync(directoryPath: string, targetArray: FileNode[]): Promise<void> {
    fileServiceConnection.stream<FileNode>('QuickScanAsync', directoryPath, 1)
        .subscribe({
            next: (fileNode) => {
                console.log('Received file:', fileNode.name)
                if (fileNode.isDirectory) {
                    fileNode.children = []
                }
                targetArray.push(fileNode)
            },
            complete: () => {
                console.log('Loaded', targetArray.length, 'items from', directoryPath)
            },
            error: (err) => {
                console.error('Failed to load', directoryPath, err)
            }
        })
}

async function StreamTabAsync(fileName: string, filePath: string): Promise<void> {
    fileServiceConnection.stream<TabChunk>('StreamTabAsync', fileName, filePath)
        .subscribe({
            next: (chunk) => {
                if (chunk.isMetadata) {
                    const tab = {
                        id: chunk.id,
                        name: chunk.name,
                        path: chunk.path,
                        content: '',
                        isDirty: false,
                    }
                    tabs.value.push(tab);
                    openTab(tab);
                } else if (chunk.isError) {
                    console.error('Error loading tab:', chunk.content)
                } else {
                    const tab = tabs.value.find(t => t.id === chunk.id)
                    if (tab) {
                        tab.content += chunk.content
                    }
                    openTab(tab!);
                }
            },
            complete: () => {
            },
            error: (err) => {
                console.error('Stream error:', err)
            }
        })
}

async function loadFileTree() {
    try {
        fileTree.value = [{
            name: window.nodePath.basename(rootDirectory.value),
            path: rootDirectory.value,
            extension: '',
            isDirectory: true,
            expanded: true,
            children: []
        }]
        await readDirAsync(rootDirectory.value, fileTree.value[0].children!);

    } catch (err) {
        console.error('Error loading file tree:', err)
    }
}

function startDeepIndexing(rootPath: string) {
    try {
        deepIndexSubscription = fileServiceConnection.stream<FileIndexEntry>('DeepIndexAsync', rootPath)
            .subscribe({
                error: (err) => console.error('Error during deep indexing', err)
            })
    } catch (err) {
        console.error('Failed to start deep indexing', err)
    }
}

async function toggleFolder(node: FileNode) {
    node.expanded = !node.expanded

    if (node.expanded && (!node.children || node.children.length === 0)) {
        try {
            await readDirAsync(node.path, node.children!);
        } catch (err) {
            console.error('Error loading folder contents:', err)
        }
    }
}

async function openFile(node: FileNode) {
    if (node.isDirectory) return

    try {
        const existingTab = tabs.value.find(tab => tab.path === node.path);
        if (existingTab) {
            openTab(existingTab)
        } else {
            await StreamTabAsync(node.name, node.path);
        }
        console.log('Opened file:', node.path);
    } catch (err) {
        console.error('Error opening file:', err);
    }
}

// ==================== LAYOUT PERSISTENCE ====================
let saveLayoutTimer: number | null = null

async function ensureLayoutConnection() {
    if (layoutConnection.state === signalR.HubConnectionState.Disconnected) {
        await layoutConnection.start();
    }
}

async function loadLayoutFromKernel() {
    try {
        await ensureLayoutConnection()
        const layout = await layoutConnection.invoke<PanelLayout>('GetLayout')
        if (layout) {
            layoutState.ExplorerWidth = layout.ExplorerWidth || layoutState.ExplorerWidth
            layoutState.TerminalHeight = layout.TerminalHeight || layoutState.TerminalHeight
            layoutState.EditorPreviewRatio = layout.EditorPreviewRatio || layoutState.EditorPreviewRatio
            layoutState.PreferredViewMode = layout.PreferredViewMode || layoutState.PreferredViewMode
        }
    } catch (err) {
        console.error('Failed to load layout', err)
    } finally {
        applyViewModeForActiveTab()
    }
}

function scheduleLayoutSave() {
    if (saveLayoutTimer) {
        clearTimeout(saveLayoutTimer)
    }
    saveLayoutTimer = window.setTimeout(() => {
        void saveLayout()
    }, 300)
}

async function saveLayout() {
    try {
        await ensureLayoutConnection()
        await layoutConnection.invoke('SaveLayout', layoutState)
    } catch (err) {
        console.error('Failed to save layout', err)
    }
}

// ==================== SIGNALR ====================
async function initializeSignalR() {
    try {
        await terminalConnection.start();
        await kernelConnection.start();
        await fileServiceConnection.start();
        await ensureLayoutConnection()
        kernelConnection.off('CodeOutput', handleRunOutput)
        kernelConnection.off('CodeExecutionCompleted', handleRunCompletion)
        kernelConnection.on('CodeOutput', handleRunOutput)
        kernelConnection.on('CodeExecutionCompleted', handleRunCompletion)
        console.log('SignalR connections established')
    } catch (err) {
        console.error('SignalR connection failed:', err)
    }
}

// ==================== WATCHERS ====================
watch(activeTab, (tab) => {
    code.value = tab?.content || ''
    applyViewModeForActiveTab()
}, {immediate: true})

watch(showTerminal, (newVal) => {
    if (newVal && fitAddon) {
        setTimeout(() => fitAddon.fit(), 100)
    }
})

watch(showRunTerminal, (newVal) => {
    if (newVal && runFitAddon) {
        setTimeout(() => runFitAddon.fit(), 100)
    }
})

// ==================== LIFECYCLE ====================
onMounted(async () => {
    initializeTerminal()
    await initializeSignalR()
    await loadLayoutFromKernel()
    await terminalConnection.invoke('TerminalInit');
    await loadFileTree()
    startDeepIndexing(rootDirectory.value)
    window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    void saveLayout()
    if (xterm) {
        xterm.dispose()
    }
    runXterm?.dispose()
    deepIndexSubscription?.dispose()
    terminalConnection.stop().catch(err => console.error('Error closing terminal connection:', err))
    layoutConnection.stop().catch(err => console.error('Error closing layout connection:', err))
    kernelConnection.off('CodeOutput', handleRunOutput)
    kernelConnection.off('CodeExecutionCompleted', handleRunCompletion)
})
</script>

<template>
    <div class="window">
        <div class="window-workspace">
            <!-- Left Sidebar -->
            <div class="tool-bar">
                <div class="general-action">
                    <div
                        v-for="(item, index) in SIDEBAR_BUTTONS.top"
                        :key="index"
                        class="badge"
                        :class="{ active: activeIndexTop === index }"
                        @click="handleTopButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>

                <div class="code-action">
                    <div
                        v-for="(item, index) in SIDEBAR_BUTTONS.bottom"
                        :key="index"
                        class="badge"
                        :class="{ active: activeIndexBottom === index }"
                        @click="handleBottomButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>
            </div>

            <!-- Main Workspace -->
            <div class="workspace-wrapper" ref="workspaceWrapper">
                <div class="workspace">
                    <!-- Explorer Sidebar -->
                    <div v-show="showExplorer" class="view-content" :style="explorerStyle" ref="explorerPane">
                        <div class="content-title-bar">
                            <div class="title-label">
                                <span>EXPLORER</span>
                            </div>
                            <div class="title-actions">
                                <div class="title-action">
                                    <span class="material-symbols-outlined">add</span>
                                </div>
                                <div class="title-action" @click="toggleExplorer">
                                    <span class="material-symbols-outlined">collapse_content</span>
                                </div>
                            </div>
                        </div>

                        <div v-if="fileTree"
                             class="file-explorer">
                            <FileTreeNode
                                v-for="node in fileTree"
                                :key="node.path"
                                :node="node"
                                @toggleFolder="toggleFolder"
                                @openFile="openFile"
                            />
                        </div>
                    </div>
                    <div v-show="showExplorer" class="vertical-resizer" @mousedown="startExplorerResize"></div>

                    <!-- Editor Container -->
                    <div class="editor-container">
                        <div class="tab-bar">
                            <div class="tab-list">
                                <div
                                    v-for="(tab, index) in tabs"
                                    :key="tab.id"
                                    class="tab"
                                    :class="{ active: activeTabIndex === index }"
                                    @click="openTab(tab)"
                                >
                                    <span>{{ tab.name }}</span>
                                    <div class="tab-action" @click.stop="closeTab(tab)">
                                        <span class="material-symbols-outlined">close</span>
                                    </div>
                                </div>
                            </div>
                            <div v-if="isMarkdownTab" class="tab-view-toggle">
                                <button
                                    v-for="btn in VIEW_MODE_BUTTONS"
                                    :key="btn.value"
                                    class="tab-view-btn"
                                    :class="{ active: currentViewMode === btn.value }"
                                    @click="setViewMode(btn.value)"
                                    :title="btn.label"
                                >
                                    <span class="material-symbols-outlined">{{ btn.icon }}</span>
                                </button>
                            </div>
                        </div>

                        <div class="editor" ref="editorPane">
                            <div class="editor-main" :style="editorPaneStyle" v-show="showCodePane">
                                <CodeEditor
                                    v-model:value="code"
                                    :language="currentLanguage"
                                    :options="EDITOR_OPTIONS"
                                    theme="vs-dark"
                                    class="code-editor"
                                    :style="{ width: '100%', height: '100%' }"
                                />
                            </div>

                            <div v-show="showCodePane && showPreviewPane" class="split-resizer" @mousedown="startPreviewResize"></div>

                            <div class="preview-main" :style="previewPaneStyle" v-show="showPreviewPane">
                                <div class="preview-header">Preview</div>
                                <div class="markdown-body">
                                    <component :is="renderedVNode"/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Terminal Panel -->
                <div v-show="showTerminalArea" class="horizontal-resizer" @mousedown="startTerminalResize"></div>
                <div v-show="showTerminalArea" class="terminal-container" :style="terminalStyle">
                    <div class="terminal-title-bar">
                        <div class="terminal-title">
                            <span>{{ showRunTerminal ? 'Run Output' : 'Terminal' }}</span>
                        </div>
                    </div>
                    <div v-if="showRunTerminal" class="terminal-host" ref="runTerminal"></div>
                    <div v-else class="terminal-host" ref="terminal"></div>
                </div>
            </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <div class="status-bar-left">
                <div class="status-item">
                    <span class="status-indicator"></span>
                    <span>Ready</span>
                </div>
                <div class="status-item">
                    <span class="material-symbols-outlined">description</span>
                    <span>{{ activeTab?.name || DEFAULT_UNTITLED_NAME }}</span>
                </div>
            </div>
            <div class="status-bar-right">
                <div class="status-item">
                    <span>Markdown</span>
                </div>
                <div class="status-item">
                    <span>UTF-8</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.file-explorer {
    font-family: inherit;
    color: var(--text-primary);
    padding: 0;
    overflow-y: auto;
    height: 100%;
    user-select: none;
}
</style>
