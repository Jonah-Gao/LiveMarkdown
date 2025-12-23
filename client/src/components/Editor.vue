<script setup lang="ts">
// ==================== IMPORTS ====================
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
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
import {theme} from "@/styles/GithubTerminalTheme.ts";
import SIGNALR_CONFIG_JSON from '@/config/signalr.json'


// TODO: Global file search
// TODO: File operations: create, delete, rename, move, copy
// TODO: LSP integration for code intelligence
// TODO: Run terminal for code execution
// TODO: Resizeable panels
// TODO: Tab caching and recovery
// TODO: Settings panel
// TODO: Last opened files, layouts, file tree state persistence by localCache
// ==================== TYPES ====================
interface FileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children?: FileNode[]
    expanded?: boolean
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

const EDITOR_OPTIONS = {
    fontSize: 14,
    minimap: {enabled: true},
    automaticLayout: true
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

// ==================== STATE ====================
// UI State
const activeIndexTop = ref<number | null>(0)
const activeIndexBottom = ref<number | null>(null)
const explorerVisible = ref(true)

// Editor State
const code = ref('# Hello, Monaco Editor Vue3!')
const tabs = ref<Tab[]>([
    {
        id: 'untitled-1',
        name: 'Untitled',
        path: '',
        content: '# Hello, Monaco Editor Vue3!',
        isDirty: false,
    }
])
const activeTabIndex = ref(0)

// File Explorer State
const fileTree = ref<FileNode[]>([])
// TODO: Change this hardcoded path to a dynamic one or a configuration
const rootDirectory = ref('E:\\CS_NEA_Project\\test')

// Terminal State
const terminal = ref<HTMLElement | null>(null)
let xterm: Terminal
let fitAddon: FitAddon

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
const showExplorer = computed(() => activeIndexTop.value === 0 && explorerVisible.value)
const showTerminal = computed(() => activeIndexBottom.value === 1)

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
    // xterm.writeln('Welcome to xterm.js + Vue.js!')
    // terminalConnection.invoke('TerminalInput', "");
    // setupTerminalInput()

    xterm.onData(data => {
        console.log('Input:', JSON.stringify(data));
        terminalConnection.invoke('TerminalInput', data);
    })
}

function handleResize() {
    if (fitAddon) {
        fitAddon.fit()
    }
}

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
        if (index === 1 && fitAddon) {
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
}

function closeTab(tab: Tab) {
    const index = tabs.value.findIndex(t => t.id === tab.id)
    if (index !== -1) {
        tabs.value.splice(index, 1)
        if (activeTabIndex.value === index) {
            activeTabIndex.value = Math.max(0, index - 1)
            code.value = tabs.value[activeTabIndex.value]?.content || ''
        }
    }
}

async function readDirAsync(directoryPath: string, targetArray: FileNode[]): Promise<void> {
    fileServiceConnection.stream<FileNode>('ReadDirAsync', directoryPath)
        .subscribe({
            next: (fileNode) => {
                // 每次后端 yield return，这里就会被调用一次
                console.log('Received file:', fileNode.name)
                // 更新 UI，比如添加到文件树
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
                    // 创建 Tab
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
                    // 显示错误
                    console.error('Error loading tab:', chunk.content)
                } else {
                    // 拼接内容
                    const tab = tabs.value.find(t => t.id === chunk.id)
                    if (tab) {
                        tab.content += chunk.content
                    }
                    openTab(tab!);
                }
            },
            complete: () => {
                // const tab = tabs.value.find(t => t.id === currentTabId)
            },
            error: (err) => {
                // 这里只会收到网络错误（如 SignalR 断开连接）
                // 业务逻辑错误已经被后端转换为 ErrorChunk
                console.error('Stream error:', err)
            }
        })
}

// ==================== FILE EXPLORER ====================
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

async function toggleFolder(node: FileNode) {
    node.expanded = !node.expanded

    if (node.expanded && (!node.children || node.children.length === 0)) {
        // Load only when expanded for the first time and there are no children
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

// ==================== SIGNALR ====================
async function initializeSignalR() {
    try {
        await terminalConnection.start();
        await kernelConnection.start();
        await fileServiceConnection.start();
        console.log('SignalR connections established')
    } catch (err) {
        console.error('SignalR connection failed:', err)
    }
}

// ==================== WATCHERS ====================
watch(activeTabIndex, (newIndex) => {
    if (tabs.value[newIndex]) {
        code.value = tabs.value[newIndex].content
    }
})

watch(showTerminal, (newVal) => {
    if (newVal && fitAddon) {
        setTimeout(() => fitAddon.fit(), 100)
    }
})

// ==================== LIFECYCLE ====================
onMounted(async () => {
    initializeTerminal()
    await initializeSignalR()
    await terminalConnection.invoke('TerminalInit');
    await loadFileTree()
    window.addEventListener('resize', handleResize)

})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)

    if (xterm) {
        xterm.dispose()
    }
    terminalConnection.stop().catch(err => console.error('Error closing terminal connection:', err))
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
            <div class="workspace-wrapper">
                <div class="workspace">
                    <!-- Explorer Sidebar -->
                    <div v-show="showExplorer" class="view-content">
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

                    <!-- Editor Container -->
                    <div class="editor-container">
                        <div class="tab-bar">
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

                        <div class="editor">
                            <div class="editor-main">
                                <CodeEditor
                                    v-model:value="code"
                                    language="markdown"
                                    :options="EDITOR_OPTIONS"
                                    theme="vs-dark"
                                />
                            </div>

                            <div class="preview-main">
                                <div class="preview-header">Preview</div>
                                <div class="markdown-body">
                                    <component :is="renderedVNode"/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Terminal Panel -->
                <div v-show="showTerminal" class="terminal-container">
                    <div class="terminal-title-bar">
                        <div class="terminal-title">
                            <span>Terminal</span>
                        </div>
                    </div>
                    <div id="terminal" ref="terminal"></div>
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
                    <span>{{ tabs[activeTabIndex]?.name || 'Untitled' }}</span>
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
    height: calc(100vh - 35px);
    user-select: none;
}
</style>
