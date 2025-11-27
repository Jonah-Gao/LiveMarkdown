<script setup lang="ts">
// ==================== IMPORTS ====================
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
import * as signalR from '@microsoft/signalr'
import {CodeEditor} from 'monaco-editor-vue3'
import FileTreeNode from './FileTreeNode.vue'

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

// ==================== CONSTANTS ====================
const SIGNALR_CONFIG = {
    markdownHub: 'http://localhost:5238/mdHub',
    terminalHub: 'http://localhost:5238/terminalHub'
}

const TERMINAL_CONFIG = {
    fontFamily: 'JetBrains Mono, monospace',
    cursorBlink: true,
    rows: 20,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: 0,
    theme: {background: '#010409'}
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
        isDirty: false
    }
])
const activeTabIndex = ref(0)

// File Explorer State
const fileTree = ref<FileNode[]>([])
const rootDirectory = ref('E:\\CS_NEA_Project\\client')

// Terminal State
const terminal = ref<HTMLElement | null>(null)
let xterm: Terminal
let fitAddon: FitAddon

// ==================== SIGNALR CONNECTIONS ====================
const connection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.markdownHub)
    .build()

const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl(SIGNALR_CONFIG.terminalHub)
    .build()

// ==================== MARKDOWN ====================
const md: MarkdownIt = new MarkdownIt({
    highlight: (code: string, lang: string) => {
        if (lang && hljs.getLanguage(lang)) {
            const highlighted = hljs.highlight(code, {language: lang, ignoreIllegals: true}).value
            return `<pre class="hljs"><code>${highlighted}</code></pre>`
        }
        return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
    }
})

const renderedHtml = computed(() => md.render(code.value))

// ==================== COMPUTED ====================
const showExplorer = computed(() => activeIndexTop.value === 0 && explorerVisible.value)
const showTerminal = computed(() => activeIndexBottom.value === 1)

// ==================== TERMINAL HANDLERS ====================
window.terminal.onOutput((output: string) => {
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
    window.terminal.input("");
    // setupTerminalInput()
    window.terminal.init()
    xterm.onData(data => {
        window.terminal.input(data);
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

// ==================== FILE EXPLORER ====================
async function loadFileTree() {
    try {
        fileTree.value = [{
            name: window.nodePath.basename(rootDirectory.value),
            path: rootDirectory.value,
            extension: '',
            isDirectory: true,
            expanded: true,
            children: await window.fileAPI.readDir(rootDirectory.value)
        }]
    } catch (err) {
        console.error('Error loading file tree:', err)
    }
}

async function toggleFolder(node: FileNode) {
    node.expanded = !node.expanded

    if (node.expanded && (!node.children || node.children.length === 0)) {
        // 只在第一次展开且没有子节点时才加载
        try {
            node.children = await window.fileAPI.readDir(node.path)
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
            const newTab: Tab = await window.fileAPI.createTab(node.name, node.path);
            tabs.value.push(newTab);
            openTab(newTab);
        }
        console.log('Opened file:', node.path);
    } catch (err) {
        console.error('Error opening file:', err);
    }
}

// ==================== SIGNALR ====================
async function initializeSignalR() {
    try {
        await connection.start()
        await terminalConnection.start()
        console.log('SignalR connections established')
    } catch (err) {
        console.error('SignalR connection failed:', err)
    }
}

// ==================== WATCHERS ====================
watch(code, (newVal) => {
    // Update active tab content
    if (tabs.value[activeTabIndex.value]) {
        tabs.value[activeTabIndex.value].content = newVal
        tabs.value[activeTabIndex.value].isDirty = true
    }

    connection.invoke('ReceiveMarkdown', newVal)
        .catch(err => console.error('Error syncing markdown:', err))
}, {deep: true})

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
    await initializeSignalR()
    initializeTerminal()
    await loadFileTree()
    window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)

    if (xterm) {
        xterm.dispose()
    }

    connection.stop().catch(err => console.error('Error closing markdown connection:', err))
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
                                <div class="markdown-body" v-html="renderedHtml"></div>
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
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    color: var(--text-primary);
    padding: 0;
    overflow-y: auto;
    height: calc(100vh - 35px);
    user-select: none;
}
</style>
