import {computed, reactive, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {MarkdownParser} from '@markdown/markdown'
import {readDirectory, streamTab, saveTabAsync, saveWorkspaceSettingsAsync, loadLayoutAsync} from '@/services/fileService'
import {FileNode, PanelLayout, SidebarPanel, Tab, UIFileNode, ViewMode} from '@/types/workspace'

const md = new MarkdownParser()

// Layout constraints
const DEFAULT_ROOT_DIRECTORY = ''
const MIN_EXPLORER_WIDTH = 160
const MAX_EXPLORER_WIDTH = 520
const MIN_TERMINAL_HEIGHT = 150
const MAX_TERMINAL_HEIGHT = 900
const MIN_PREVIEW_RATIO = 0.15
const MAX_PREVIEW_RATIO = 0.85

// Language detection by file extension
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

// Sidebar button configuration
const SIDEBAR_BUTTONS = {
    top: [
        {icon: 'folder', panel: 'explorer' as SidebarPanel},
        {icon: 'search', panel: 'search' as SidebarPanel},
    ],
    bottom: [
        {icon: 'play_arrow', panel: 'run' as SidebarPanel},
        {icon: 'terminal', panel: 'terminal' as SidebarPanel}
    ]
}

// View mode button configuration
const VIEW_MODE_BUTTONS: { value: ViewMode, icon: string, label: string }[] = [
    {value: 'code', icon: 'code', label: 'Code only'},
    {value: 'split', icon: 'split_scene', label: 'Code & Preview'},
    {value: 'preview', icon: 'visibility', label: 'Preview only'}
]

// Default layout state values
const DEFAULT_LAYOUT_STATE: PanelLayout = {
    explorerWidth: 240,
    terminalHeight: 250,
    editorPreviewRatio: 0.5,
    preferredViewMode: 'split',
    explorerVisible: true,
    terminalVisible: false,
    activeTopPanel: 'explorer',
    activeBottomPanel: null,
    openedFiles: []
}

export const useWorkspaceStore = defineStore('workspace', () => {
    // Editor state
    const code = ref('')
    const tabs = ref<Tab[]>([])
    const activeTabIndex = ref(-1)
    const currentViewMode = ref<ViewMode>('split')

    // File tree state
    const fileTree = ref<UIFileNode[]>([])
    const nodes = reactive(new Map<string, FileNode>())

    // Workspace state
    const rootDirectory = ref(DEFAULT_ROOT_DIRECTORY)
    const projectName = ref('')
    const pythonInterpreterPath = ref('')

    // Resize interaction state (not persisted)
    const resizeState = reactive({
        type: null as 'explorer' | 'preview' | 'terminal' | null,
        startX: 0,
        startY: 0,
        startSize: 0,
        containerWidth: 0
    })

    // Unified layout state - all UI panel states in one place
    const layoutState = reactive<PanelLayout>({...DEFAULT_LAYOUT_STATE})

    // Computed: workspace state
    const hasWorkspace = computed(() => !!rootDirectory.value)
    const hasTabs = computed(() => tabs.value.length > 0)

    // Computed: build visible file tree from flat node map
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

    // Computed: Markdown rendering
    const renderedVNode = computed(() => md.render(code.value))

    // Computed: active tab and file type detection
    const activeTab = computed(() => tabs.value[activeTabIndex.value] ?? null)
    const isMarkdownTab = computed(() => {
        const name = activeTab.value?.name?.toLowerCase() || ''
        const path = activeTab.value?.path?.toLowerCase() || ''
        return name.endsWith('.md') || path.endsWith('.md')
    })

    // Computed: panel visibility derived from layoutState
    const showExplorer = computed(() =>
        hasWorkspace.value &&
        layoutState.activeTopPanel === 'explorer' &&
        layoutState.explorerVisible
    )
    const showTerminal = computed(() =>
        hasWorkspace.value &&
        layoutState.activeBottomPanel === 'terminal' &&
        layoutState.terminalVisible
    )
    const showTerminalArea = computed(() => showTerminal.value)

    // Computed: editor/preview pane visibility
    const showPreviewPane = computed(() =>
        hasTabs.value && isMarkdownTab.value && currentViewMode.value !== 'code'
    )
    const showCodePane = computed(() =>
        hasTabs.value && (!isMarkdownTab.value || currentViewMode.value !== 'preview')
    )

    // Computed: panel styles
    const explorerStyle = computed(() => ({width: `${layoutState.explorerWidth}px`}))
    const terminalStyle = computed(() => ({height: `${layoutState.terminalHeight}px`}))

    // Computed: language detection for status bar
    const currentLanguage = computed(() => {
        const name = (activeTab.value?.path || activeTab.value?.name || '').toLowerCase()
        const extIndex = name.lastIndexOf('.')
        const ext = extIndex >= 0 ? name.slice(extIndex) : ''
        return (ext && LANGUAGE_BY_EXTENSION[ext]) || ''
    })

    // Computed: editor/preview pane flex styles
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

    // Watch: sync code editor content with active tab
    watch(activeTab, (tab) => {
        if (!tab) {
            code.value = ''
            applyViewModeForActiveTab()
            return
        }
        code.value = tab?.content || ''
        applyViewModeForActiveTab()
    }, {immediate: true})

    // Watch: mark tab as dirty when code changes
    watch(code, (newCode) => {
        const tab: Tab = activeTab.value
        if (!tab) return

        if (newCode !== tab.content) {
            tab.isDirty = true
            tab.content = newCode
        }
    })

    /**
     * Clamp a value between min and max bounds.
     */
    function clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max)
    }

    /**
     * Handle top sidebar button click.
     * Toggles panel visibility when clicking the active panel.
     */
    function handleTopButtonClick(index: number): void {
        const panel = SIDEBAR_BUTTONS.top[index]?.panel
        if (!panel) return

        if (layoutState.activeTopPanel === panel) {
            // Toggle visibility for explorer panel
            if (panel === 'explorer') {
                layoutState.explorerVisible = !layoutState.explorerVisible
            } else {
                layoutState.activeTopPanel = null
            }
        } else {
            layoutState.activeTopPanel = panel
            if (panel === 'explorer') {
                layoutState.explorerVisible = true
            }
        }
    }

    /**
     * Handle bottom sidebar button click.
     * Toggles panel visibility when clicking the active panel.
     */
    function handleBottomButtonClick(index: number): void {
        const panel = SIDEBAR_BUTTONS.bottom[index]?.panel
        if (!panel) return

        if (layoutState.activeBottomPanel === panel) {
            layoutState.activeBottomPanel = null
            if (panel === 'terminal') {
                layoutState.terminalVisible = false
            }
        } else {
            layoutState.activeBottomPanel = panel
            if (panel === 'terminal') {
                layoutState.terminalVisible = true
            }
        }
    }

    /**
     * Toggle explorer panel visibility.
     */
    function toggleExplorer(): void {
        layoutState.explorerVisible = !layoutState.explorerVisible
        if (!layoutState.explorerVisible) {
            layoutState.activeTopPanel = null
        }
    }

    /**
     * Open a tab and set it as active.
     */
    function openTab(tab: Tab): void {
        const targetIndex = tabs.value.findIndex(t => t.id === tab.id)
        if (targetIndex === -1) return

        activeTabIndex.value = targetIndex
        code.value = tab.content
        applyViewModeForActiveTab()
    }

    /**
     * Close a tab, saving if dirty.
     */
    async function closeTab(tab: Tab): Promise<void> {
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

    /**
     * Save all tabs that have unsaved changes.
     */
    async function saveDirtyTabs(): Promise<void> {
        for (const tab of tabs.value.filter((t: Tab): boolean => t.isDirty)) {
            await saveTabAsync(tab.path, tab.content)
            tab.isDirty = false
        }
    }

    /**
     * Apply the appropriate view mode based on active tab type.
     */
    function applyViewModeForActiveTab(): void {
        if (!hasTabs.value) {
            currentViewMode.value = 'code'
            return
        }
        currentViewMode.value = isMarkdownTab.value ? layoutState.preferredViewMode : 'code'
    }

    /**
     * Set the view mode for Markdown files.
     */
    function setViewMode(mode: ViewMode): void {
        if (!isMarkdownTab.value) return
        currentViewMode.value = mode
        layoutState.preferredViewMode = mode
    }

    /**
     * Start resizing the explorer panel.
     */
    function startExplorerResize(event: MouseEvent): void {
        if (!showExplorer.value) return
        resizeState.type = 'explorer'
        resizeState.startX = event.clientX
        resizeState.startSize = layoutState.explorerWidth
        attachResizeListeners()
    }

    /**
     * Start resizing the preview panel.
     */
    function startPreviewResize(event: MouseEvent, containerWidth: number): void {
        if (!showPreviewPane.value || !showCodePane.value) return
        resizeState.type = 'preview'
        resizeState.startX = event.clientX
        resizeState.containerWidth = containerWidth
        resizeState.startSize = containerWidth * layoutState.editorPreviewRatio
        attachResizeListeners()
    }

    /**
     * Start resizing the terminal panel.
     */
    function startTerminalResize(event: MouseEvent): void {
        if (!showTerminalArea.value) return
        resizeState.type = 'terminal'
        resizeState.startY = event.clientY
        resizeState.startSize = layoutState.terminalHeight
        attachResizeListeners()
    }

    /**
     * Attach global resize listeners.
     */
    function attachResizeListeners(): void {
        window.addEventListener('mousemove', handleResizeDrag)
        window.addEventListener('mouseup', stopResize)
        document.body.style.userSelect = 'none'
    }

    /**
     * Handle resize drag event.
     */
    function handleResizeDrag(event: MouseEvent): void {
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

    /**
     * Stop resize operation and clean up listeners.
     */
    function stopResize(): void {
        if (!resizeState.type) return
        window.removeEventListener('mousemove', handleResizeDrag)
        window.removeEventListener('mouseup', stopResize)
        document.body.style.userSelect = ''
        resizeState.type = null
    }

    /**
     * Read directory contents recursively via streaming.
     */
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

    /**
     * Stream file content into a tab via streaming.
     */
    async function streamTabAsync(filePath: string): Promise<void> {
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
                    // Stream completed
                },
                error: (err) => {
                    console.error('Stream error:', err)
                }
            })
    }

    /**
     * Load the file tree for the workspace root directory.
     */
    async function loadFileTree(): Promise<void> {
        nodes.clear()
        if (!rootDirectory.value) return

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

    /**
     * Toggle folder expansion state.
     */
    function toggleFolder(node: UIFileNode): void {
        const fileNode = nodes.get(node.path)
        if (fileNode) {
            fileNode.expanded = !node.expanded
            node.expanded = !node.expanded
        }
    }

    /**
     * Open a file in a new or existing tab.
     */
    async function openFile(node: UIFileNode): Promise<void> {
        if (!rootDirectory.value || node.isDirectory) return

        try {
            const existingTab = tabs.value.find(tab => tab.path === node.path)
            if (existingTab) {
                openTab(existingTab)
            } else {
                await streamTabAsync(node.path)
            }
        } catch (err) {
            console.error('Error opening file:', err)
        }
    }

    /**
     * Initialise the workspace by loading the file tree.
     */
    async function initializeWorkspace(): Promise<void> {
        if (!rootDirectory.value) return
        await loadFileTree()
    }

    /**
     * Reset all tabs to empty state.
     */
    function resetTabs(): void {
        tabs.value = []
        activeTabIndex.value = -1
        code.value = ''
        applyViewModeForActiveTab()
    }

    /**
     * Set the workspace root directory and load file tree.
     */
    async function setWorkspaceDirectory(directoryPath: string): Promise<void> {
        nodes.clear()
        fileTree.value = []
        rootDirectory.value = directoryPath.trim()
        if (!rootDirectory.value) return
        await loadFileTree()
    }

    /**
     * Open a workspace at the given directory.
     */
    async function openWorkspace(directoryPath: string): Promise<void> {
        resetTabs()
        await setWorkspaceDirectory(directoryPath)
    }

    /**
     * Create a new workspace with the given options.
     */
    async function createNewWorkspace(options: {
        projectName: string,
        directoryPath: string,
        pythonInterpreter: string
    }): Promise<void> {
        projectName.value = options.projectName
        pythonInterpreterPath.value = options.pythonInterpreter
        await openWorkspace(options.directoryPath)
    }

    /**
     * Save workspace settings to disk.
     */
    async function saveWorkspaceSettings(): Promise<void> {
        await saveWorkspaceSettingsAsync(rootDirectory.value, layoutState)
    }

    /**
     * Load workspace settings from disk and restore state.
     */
    async function loadWorkspaceSettings(): Promise<void> {
        const settings = await loadLayoutAsync(rootDirectory.value)
        if (settings) {
            // Restore layout dimensions
            layoutState.explorerWidth = settings.explorerWidth
            layoutState.terminalHeight = settings.terminalHeight
            layoutState.editorPreviewRatio = settings.editorPreviewRatio
            layoutState.preferredViewMode = settings.preferredViewMode

            // Restore panel visibility state
            layoutState.explorerVisible = settings.explorerVisible ?? true
            layoutState.terminalVisible = settings.terminalVisible ?? false
            layoutState.activeTopPanel = settings.activeTopPanel ?? 'explorer'
            layoutState.activeBottomPanel = settings.activeBottomPanel ?? null

            // Restore opened files
            layoutState.openedFiles = settings.openedFiles
            await openWorkspace(rootDirectory.value)
            for (const filePath of layoutState.openedFiles) {
                await streamTabAsync(filePath)
            }
        }
    }

    return {
        // State
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

        // Computed state
        hasWorkspace,
        hasTabs,

        // Constants
        sidebarButtons: SIDEBAR_BUTTONS,
        viewModeButtons: VIEW_MODE_BUTTONS,

        // Computed getters
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

        // Actions
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