import {computed, reactive, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {MarkdownParser} from '@markdown/markdown'
import {ensureFileServiceConnection, readDirectory, streamTab} from '@/services/fileService'
import {FileNode, PanelLayout, Tab, UIFileNode, ViewMode} from '@/types/workspace'

const md = new MarkdownParser()

const DEFAULT_UNTITLED_NAME = 'Untitled.md'
const envRootDirectory = (window as any).process?.env?.ROOT_DIRECTORY
const userHomeDirectory = (window as any).process?.env?.HOME || (window as any).process?.env?.USERPROFILE
// const DEFAULT_ROOT_DIRECTORY = envRootDirectory || userHomeDirectory || '/'
const DEFAULT_ROOT_DIRECTORY = "E:\\CS_NEA_Project\\test"
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

const SIDEBAR_BUTTONS = {
    top: [
        {icon: 'folder', panel: 'explorer'},
        {icon: 'search', panel: 'search'},
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

export const useWorkspaceStore = defineStore('workspace', () => {
    const activeIndexTop = ref<number | null>(0)
    const activeIndexBottom = ref<number | null>(null)
    const explorerVisible = ref(true)

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

    const layoutState = reactive<PanelLayout>({
        ExplorerWidth: 240,
        TerminalHeight: 250,
        EditorPreviewRatio: 0.5,
        PreferredViewMode: 'split'
    })

    const fileTree = ref<UIFileNode[]>([])
    const nodes = reactive(new Map<string, FileNode>())
    const rootDirectory = ref(DEFAULT_ROOT_DIRECTORY)
    const resizeState = reactive({
        type: null as 'explorer' | 'preview' | 'terminal' | null,
        startX: 0,
        startY: 0,
        startSize: 0,
        containerWidth: 0
    })

    const visibleFileTree = computed<UIFileNode[]>(() => {
        function build(path: string): UIFileNode | null {
            const node = nodes.get(path)
            if (!node) return null

            return {
                name: node.name,
                path: node.path,
                extension: node.extension,
                isDirectory: node.isDirectory,
                expanded: node.expanded,
                children: node.expanded
                    ? node.children
                        .map(p => build(p))
                        .filter(Boolean) as UIFileNode[]
                    : []
            }
        }

        const root = build(rootDirectory.value)
        return root ? [root] : []
    })

    const renderedVNode = computed(() => md.render(code.value))
    const activeTab = computed(() => tabs.value[activeTabIndex.value] ?? null)
    const isMarkdownTab = computed(() => {
        const name = activeTab.value?.name?.toLowerCase() || ''
        const path = activeTab.value?.path?.toLowerCase() || ''
        return name.endsWith('.md') || path.endsWith('.md')
    })
    const showExplorer = computed(() => activeIndexTop.value === 0 && explorerVisible.value)
    const showTerminal = computed(() => activeIndexBottom.value === 1)
    const showTerminalArea = computed(() => showTerminal.value)
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
        return isMarkdownTab.value ? 'Markdown' : 'plaintext'
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

    watch(activeTab, (tab) => {
        code.value = tab?.content || ''
        applyViewModeForActiveTab()
    }, {immediate: true})

    function clamp(value: number, min: number, max: number) {
        return Math.min(Math.max(value, min), max)
    }

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
    }

    function startExplorerResize(event: MouseEvent) {
        if (!showExplorer.value) return
        resizeState.type = 'explorer'
        resizeState.startX = event.clientX
        resizeState.startSize = layoutState.ExplorerWidth
        attachResizeListeners()
    }

    function startPreviewResize(event: MouseEvent, containerWidth: number) {
        if (!showPreviewPane.value || !showCodePane.value) return
        resizeState.type = 'preview'
        resizeState.startX = event.clientX
        resizeState.containerWidth = containerWidth
        resizeState.startSize = containerWidth * layoutState.EditorPreviewRatio
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
        resizeState.type = null
    }

    async function readDirAsync(directoryPath: string, targetMap: Map<string, FileNode>): Promise<void> {
        const pendingChildren = new Map<string, string[]>();
        (await readDirectory(directoryPath))
            .subscribe({
                next: (node) => {
                    targetMap.set(node.path, {...node, children: []})
                    if (node.parentPath) {
                        const parent = targetMap.get(node.parentPath)
                        if (parent) {
                            parent.children.push(node.path)
                        } else {
                            // Parent not yet loaded, queue this child
                            const list = pendingChildren.get(node.parentPath) ?? []
                            list.push(node.path)
                            pendingChildren.set(node.parentPath, list)
                        }
                    }

                    // Check if this node has pending children
                    const waiting = pendingChildren.get(node.path)
                    if (waiting) {
                        const me = targetMap.get(node.path)!
                        me.children.push(...waiting)
                        pendingChildren.delete(node.path)
                    }
                },
                complete: () => {
                    console.log("Directory stream finished")
                },
                error: (err) => {
                    console.error('Failed to load', directoryPath, err)
                }
            })
    }

    async function StreamTabAsync(fileName: string, filePath: string): Promise<void> {
        (await streamTab(fileName, filePath))
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
                        tabs.value.push(tab)
                        openTab(tab)
                    } else if (chunk.isError) {
                        console.error('Error loading tab:', chunk.content)
                    } else {
                        const tab = tabs.value.find(t => t.id === chunk.id)
                        if (tab) {
                            tab.content += chunk.content
                            openTab(tab)
                        } else {
                            console.error('Received chunk for unknown tab id:', chunk.id)
                        }
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
        nodes.clear()
        const nodePath = (window as any).nodePath
        const rootName = nodePath?.basename
            ? nodePath.basename(rootDirectory.value)
            : rootDirectory.value

        nodes.set(rootDirectory.value, {
            name: rootName,
            path: rootDirectory.value,
            extension: '',
            parentPath: null,
            isDirectory: true,
            expanded: true,
            children: []
        })
        await readDirAsync(rootDirectory.value, nodes)
    }

    async function toggleFolder(node: UIFileNode) {
        nodes.get(node.path)!.expanded = !node.expanded
        node.expanded = !node.expanded
    }

    async function openFile(node: UIFileNode) {
        if (node.isDirectory) return

        try {
            const existingTab = tabs.value.find(tab => tab.path === node.path);
            if (existingTab) {
                openTab(existingTab)
            } else {
                await StreamTabAsync(node.name, node.path);
            }
        } catch (err) {
            console.error('Error opening file:', err);
        }
    }

    async function initializeWorkspace() {
        await ensureFileServiceConnection()
        await loadFileTree()
    }

    return {
        // state
        activeIndexTop,
        activeIndexBottom,
        explorerVisible,
        code,
        tabs,
        activeTabIndex,
        currentViewMode,
        layoutState,
        fileTree,
        nodes,
        rootDirectory,
        resizeState,
        sidebarButtons: SIDEBAR_BUTTONS,
        viewModeButtons: VIEW_MODE_BUTTONS,
        defaultUntitledName: DEFAULT_UNTITLED_NAME,

        // getters
        visibleFileTree,
        renderedVNode,
        activeTab,
        isMarkdownTab,
        showExplorer,
        showTerminal,
        showTerminalArea,
        showPreviewPane,
        showCodePane,
        explorerStyle,
        terminalStyle,
        currentLanguage,
        editorPaneStyle,
        previewPaneStyle,

        // actions
        handleTopButtonClick,
        handleBottomButtonClick,
        toggleExplorer,
        openTab,
        closeTab,
        setViewMode,
        startExplorerResize,
        startPreviewResize,
        startTerminalResize,
        handleResizeDrag,
        stopResize,
        loadFileTree,
        toggleFolder,
        openFile,
        initializeWorkspace,
        applyViewModeForActiveTab,
    }
})