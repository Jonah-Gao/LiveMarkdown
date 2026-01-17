import {computed, reactive, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {MarkdownParser} from '@markdown/markdown'
import {readDirectory, streamTab, saveTabAsync, saveWorkspaceSettingsAsync, loadLayoutAsync} from '@/services/fileService'
import {FileNode, PanelLayout, Tab, UIFileNode, ViewMode} from '@/types/workspace'

const md = new MarkdownParser()

const DEFAULT_ROOT_DIRECTORY = ''
const MIN_EXPLORER_WIDTH = 160
const MAX_EXPLORER_WIDTH = 520
const MIN_TERMINAL_HEIGHT = 150
const MAX_TERMINAL_HEIGHT = 900
const MIN_PREVIEW_RATIO = 0.15
const MAX_PREVIEW_RATIO = 0.85

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
    '.ts': 'Typescript',
    '.tsx': 'Typescript',
    '.js': 'Javascript',
    '.jsx': 'Javascript',
    '.json': 'Json',
    '.py': 'Python',
    '.cs': 'Csharp',
    '.cpp': 'C++',
    '.c': 'C',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.go': 'Go',
    '.rs': 'Rust',
    '.html': 'Html',
    '.css': 'css',
    '.scss': 'scss',
    '.md': 'Markdown',
    '.mdx': 'Markdown',
    '.sql': 'sql',
    '.yml': 'Yaml',
    '.yaml': 'Yaml',
    '.sh': 'Shell',
    '.ps1': 'Powershell',
    '.vue': 'Vue',
    'txt': 'Plaintext'
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

    const code = ref()
    const tabs = ref<Tab[]>([])
    const activeTabIndex = ref(-1)
    const currentViewMode = ref<ViewMode>('split')


    const fileTree = ref<UIFileNode[]>([])
    const nodes = reactive(new Map<string, FileNode>())
    const rootDirectory = ref(DEFAULT_ROOT_DIRECTORY)
    const projectName = ref('')
    const pythonInterpreterPath = ref('')
    const resizeState = reactive({
        type: null as 'explorer' | 'preview' | 'terminal' | null,
        startX: 0,
        startY: 0,
        startSize: 0,
        containerWidth: 0
    })

    const layoutState = reactive<PanelLayout>({
        explorerWidth: 240,
        terminalHeight: 250,
        editorPreviewRatio: 0.5,
        preferredViewMode: 'split',
        openedFiles: tabs.value.map(t => t.path)
    })

    const hasWorkspace = computed(() => !!rootDirectory.value)
    const hasTabs = computed(() => tabs.value.length > 0)

    const visibleFileTree = computed<UIFileNode[]>(() => {
        if (!rootDirectory.value) {
            return []
        }

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
    const showExplorer = computed(() => hasWorkspace.value && activeIndexTop.value === 0 && explorerVisible.value)
    const showTerminal = computed(() => hasWorkspace.value && activeIndexBottom.value === 1)
    const showTerminalArea = computed(() => showTerminal.value)
    const showPreviewPane = computed(() => hasTabs.value && isMarkdownTab.value && currentViewMode.value !== 'code')
    const showCodePane = computed(() => hasTabs.value && (!isMarkdownTab.value || currentViewMode.value !== 'preview'))
    const explorerStyle = computed(() => ({width: `${layoutState.explorerWidth}px`}))
    const terminalStyle = computed(() => ({height: `${layoutState.terminalHeight}px`}))
    const currentLanguage = computed(() => {
        const name = (activeTab.value?.path || activeTab.value?.name || '').toLowerCase()
        const extIndex = name.lastIndexOf('.')
        const ext = extIndex >= 0 ? name.slice(extIndex) : ''
        if (ext && LANGUAGE_BY_EXTENSION[ext]) {
            return LANGUAGE_BY_EXTENSION[ext]
        }
        return ''
    })
    const editorPaneStyle = computed(() => {
        if (!showCodePane.value) {
            return {display: 'none'}
        }
        if (!showPreviewPane.value) {
            return {flex: 1, minWidth: 0}
        }
        return {flex: layoutState.editorPreviewRatio, minWidth: 0}
    })
    const previewPaneStyle = computed(() => {
        if (!showPreviewPane.value) {
            return {display: 'none'}
        }
        if (!showCodePane.value) {
            return {flex: 1, minWidth: 0}
        }
        return {flex: 1 - layoutState.editorPreviewRatio, minWidth: 0}
    })

    watch(activeTab, (tab) => {
        if (!tab) {
            code.value = ''
            applyViewModeForActiveTab()
            return
        }
        code.value = tab?.content || ''
        applyViewModeForActiveTab()
    }, {immediate: true})

    watch(code, (newCode) => {
        const tab: Tab = activeTab.value
        if (!tab) return

        if (newCode !== tab.content) {
            tab.isDirty = true
            tab.content = newCode
        }
    })

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
        const targetIndex = tabs.value.findIndex(t => t.id === tab.id)

        if (targetIndex === -1) return

        activeTabIndex.value = targetIndex
        code.value = tab.content
        applyViewModeForActiveTab()
    }

    async function closeTab(tab: Tab) {
        if (tab.isDirty) {
            await saveTabAsync(tab.path, tab.content)
            tab.isDirty = false
        }

        const index = tabs.value.findIndex(t => t.id === tab.id)
        if (index !== -1) {
            tabs.value.splice(index, 1)
            layoutState.openedFiles = tabs.value.map(t => t.path)
            if (tabs.value.length === 0) {
                activeTabIndex.value = -1
                code.value = ''
                applyViewModeForActiveTab()
                return
            }

            if (activeTabIndex.value >= index) {
                activeTabIndex.value = Math.max(0, tabs.value.length - 1)
            }
            code.value = tabs.value[activeTabIndex.value]?.content || ''
            applyViewModeForActiveTab()
        }
    }

    async function saveDirtyTabs() {
        for (const tab of tabs.value.filter((t: Tab): boolean => t.isDirty)) {
            await saveTabAsync(tab.path, tab.content)
            tab.isDirty = false
        }
    }

    function applyViewModeForActiveTab() {
        if (!hasTabs.value) {
            currentViewMode.value = 'code'
            return
        }
        currentViewMode.value = isMarkdownTab.value ? layoutState.preferredViewMode : 'code'
    }

    function setViewMode(mode: ViewMode) {
        if (!isMarkdownTab.value) {
            return
        }
        currentViewMode.value = mode
        layoutState.preferredViewMode = mode
    }

    function startExplorerResize(event: MouseEvent) {
        if (!showExplorer.value) return
        resizeState.type = 'explorer'
        resizeState.startX = event.clientX
        resizeState.startSize = layoutState.explorerWidth
        attachResizeListeners()
    }

    function startPreviewResize(event: MouseEvent, containerWidth: number) {
        if (!showPreviewPane.value || !showCodePane.value) return
        resizeState.type = 'preview'
        resizeState.startX = event.clientX
        resizeState.containerWidth = containerWidth
        resizeState.startSize = containerWidth * layoutState.editorPreviewRatio
        attachResizeListeners()
    }

    function startTerminalResize(event: MouseEvent) {
        if (!showTerminalArea.value) return
        resizeState.type = 'terminal'
        resizeState.startY = event.clientY
        resizeState.startSize = layoutState.terminalHeight
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
            layoutState.explorerWidth = clamp(resizeState.startSize + delta, MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH)
        } else if (resizeState.type === 'preview') {
            const delta = event.clientX - resizeState.startX
            const allowedMin = resizeState.containerWidth * MIN_PREVIEW_RATIO
            const allowedMax = resizeState.containerWidth * MAX_PREVIEW_RATIO
            const newWidth = clamp(resizeState.startSize + delta, allowedMin, allowedMax)
            const safeContainerWidth = Math.max(resizeState.containerWidth, 1)
            layoutState.editorPreviewRatio = clamp(newWidth / safeContainerWidth, MIN_PREVIEW_RATIO, MAX_PREVIEW_RATIO)
        } else if (resizeState.type === 'terminal') {
            const delta = resizeState.startY - event.clientY
            layoutState.terminalHeight = clamp(resizeState.startSize + delta, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT)
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

    async function StreamTabAsync(filePath: string): Promise<void> {
        (await streamTab(filePath))
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
                        layoutState.openedFiles = tabs.value.map(t => t.path)
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
        if (!rootDirectory.value) {
            return
        }
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
        if (!rootDirectory.value || node.isDirectory) return

        try {
            const existingTab = tabs.value.find(tab => tab.path === node.path);
            if (existingTab) {
                openTab(existingTab)
            } else {
                await StreamTabAsync(node.path);
            }
        } catch (err) {
            console.error('Error opening file:', err);
        }
    }

    async function initializeWorkspace() {
        if (!rootDirectory.value) {
            return
        }
        await loadFileTree()
    }

    function resetTabs() {
        tabs.value = []
        activeTabIndex.value = -1
        code.value = ''
        applyViewModeForActiveTab()
    }

    async function setWorkspaceDirectory(directoryPath: string) {
        nodes.clear()
        fileTree.value = []
        rootDirectory.value = directoryPath.trim()
        if (!rootDirectory.value) {
            return
        }
        await loadFileTree()
    }

    async function openWorkspace(directoryPath: string) {
        resetTabs()
        await setWorkspaceDirectory(directoryPath)
    }

    async function createNewWorkspace(options: {
        projectName: string,
        directoryPath: string,
        pythonInterpreter: string
    }) {
        projectName.value = options.projectName
        pythonInterpreterPath.value = options.pythonInterpreter
        await openWorkspace(options.directoryPath)
    }

    async function saveWorkspaceSettings() {
        await saveWorkspaceSettingsAsync(rootDirectory.value, layoutState)
    }

    async function loadWorkspaceSettings() {
        const settings = await loadLayoutAsync(rootDirectory.value)
        if (settings) {
            layoutState.explorerWidth = settings.explorerWidth
            layoutState.terminalHeight = settings.terminalHeight
            layoutState.editorPreviewRatio = settings.editorPreviewRatio
            layoutState.preferredViewMode = settings.preferredViewMode
            layoutState.openedFiles = settings.openedFiles
            await openWorkspace(rootDirectory.value)
            for (const filePath of layoutState.openedFiles) {
                await StreamTabAsync(filePath)
            }
        }
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
        projectName,
        pythonInterpreterPath,
        resizeState,
        hasWorkspace,
        hasTabs,
        sidebarButtons: SIDEBAR_BUTTONS,
        viewModeButtons: VIEW_MODE_BUTTONS,

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
        saveDirtyTabs,
        applyViewModeForActiveTab,
        resetTabs,
        openWorkspace,
        createNewWorkspace,
        setWorkspaceDirectory,
        saveWorkspaceSettings,
        loadWorkspaceSettings
    }
})