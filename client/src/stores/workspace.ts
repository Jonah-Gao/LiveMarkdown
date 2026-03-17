import {computed, reactive, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {MarkdownParser} from '@markdown/markdownVue3.ts'
import {
    readDirectory,
    streamTab,
    saveTabAsync,
    saveWorkspaceSettingsAsync,
    loadLayoutAsync,
    startWatching,
    stopWatching,
    onFileChanged,
    createFile,
    deleteFile,
    copyFile,
    renameFile,
    createDirectory,
    deleteDirectory,
    copyDirectory,
    RenameDirectory
} from '@/services/fileService'
import {FileNode, WorkspaceSettings, SidebarPanel, Tab, UIFileNode, ViewMode} from '@/types/workspace'

const md = new MarkdownParser()

// Layout constraints
const DEFAULT_ROOT_DIRECTORY = ''
const MIN_EXPLORER_WIDTH = 160
const MAX_EXPLORER_WIDTH = 520
const MIN_TERMINAL_HEIGHT = 150
const MAX_TERMINAL_HEIGHT = 900
const MIN_PREVIEW_RATIO = 0.15
const MAX_PREVIEW_RATIO = 0.85

// Auto-save interval in milliseconds (60 seconds)
const AUTO_SAVE_INTERVAL = 60 * 1000

// Language detection by file extension - maps to Monaco editor language identifiers
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
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
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'scss',
    '.less': 'less',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.sql': 'sql',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.ps1': 'powershell',
    '.vue': 'vue',
    '.txt': 'plaintext',
    '.xml': 'xml',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.lua': 'lua',
    '.perl': 'perl',
    '.pl': 'perl',
    '.dockerfile': 'dockerfile',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.ini': 'ini',
    '.toml': 'toml',
    '.bat': 'bat',
    '.cmd': 'bat',
    '.clj': 'clojure',
    '.coffee': 'coffeescript',
    '.dart': 'dart',
    '.fs': 'fsharp',
    '.fsi': 'fsharp',
    '.fsx': 'fsharp',
    '.handlebars': 'handlebars',
    '.hbs': 'handlebars',
    '.pug': 'pug',
    '.jade': 'pug',
    '.razor': 'razor',
    '.cshtml': 'razor',
    '.vb': 'vb',
    '.m': 'objective-c',
    '.mm': 'objective-c'
}

// Sidebar button configuration
const SIDEBAR_BUTTONS = {
    top: [
        {icon: 'folder', panel: 'explorer' as SidebarPanel},
        {icon: 'search', panel: 'search' as SidebarPanel},
    ],
    bottom: [
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
const DEFAULT_LAYOUT_STATE: WorkspaceSettings = {
    explorerWidth: 240,
    terminalHeight: 250,
    editorPreviewRatio: 0.5,
    preferredViewMode: 'split',
    explorerVisible: true,
    searchVisible: false,
    terminalVisible: false,
    activeTopPanel: 'explorer',
    activeBottomPanel: null,
    openedFiles: [],
    expandedDirectories: new Set<string>(),
    activeFile: ''
}

const fileChangeQueue: Array<{
    dirPath: string;
    resolve: () => void;
    reject: (err: unknown) => void;
}> = [];
let processing = false;

export const useWorkspaceStore = defineStore('workspace', () => {
    // Editor state
    const code = ref('')
    const tabs = ref<Tab[]>([])
    const activeTabIndex = ref(-1)
    const currentViewMode = ref<ViewMode>('split')

    // File tree state
    const fileTree = ref<UIFileNode[]>([])
    const nodes = reactive(new Map<string, FileNode>())
    const nodeVersion = ref(0)

    // Workspace state
    const rootDirectory = ref(DEFAULT_ROOT_DIRECTORY)
    const displayRootDirectory = ref(DEFAULT_ROOT_DIRECTORY) // Original case for display
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
    const layoutState = reactive<WorkspaceSettings>({...DEFAULT_LAYOUT_STATE})

    // File watcher cleanup function
    let fileWatcherCleanup: (() => void) | null = null

    // Auto-save timer
    let autoSaveTimer: ReturnType<typeof setInterval> | null = null

    // Computed: workspace state
    const hasWorkspace = computed(() => !!rootDirectory.value)
    const hasTabs = computed(() => tabs.value.length > 0)

    /**
     * Get Monaco editor language identifier from file path or name.
     * Returns the language ID based on file extension, or 'plaintext' if unknown.
     */
    function getLanguageFromPath(filePath: string): string {
        const name = filePath.toLowerCase()
        const extIndex = name.lastIndexOf('.')
        const ext = extIndex >= 0 ? name.slice(extIndex) : ''
        return (ext && LANGUAGE_BY_EXTENSION[ext]) || 'plaintext'
    }

    /**
     * Sort children: folders first, then files, alphabetically within each group.
     */
    function sortChildren(children: UIFileNode[]): UIFileNode[] {
        return children.slice().sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1
            }
            return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
        })
    }

    // Computed: build visible file tree from flat node map
    const visibleFileTree = computed<UIFileNode[]>(() => {
        nodeVersion.value
        if (!rootDirectory.value) {
            return []
        }

        function build(path: string): UIFileNode | null {
            const node = nodes.get(path)
            if (!node) return null

            const children = node.expanded
                ? sortChildren(
                    node.children
                        .map(p => build(p))
                        .filter(Boolean) as UIFileNode[]
                )
                : []

            return {
                name: node.name,
                path: node.path,
                displayPath: node.displayPath,
                extension: node.extension,
                isDirectory: node.isDirectory,
                expanded: node.expanded,
                children
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
    const showSearch = computed(() =>
        hasWorkspace.value &&
        layoutState.activeTopPanel === 'search' && layoutState.searchVisible
    )
    const showTerminal = computed(() =>
        hasWorkspace.value &&
        layoutState.activeBottomPanel === 'terminal' &&
        layoutState.terminalVisible
    )

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

    // Computed: language detection for status bar and Monaco editor
    // Uses the stored language from the tab, or derives it from file extension
    const currentLanguage = computed(() => {
        if (activeTab.value?.language) {
            return activeTab.value.language
        }
        return getLanguageFromPath(activeTab.value?.path || activeTab.value?.name || '')
    })

    // Computed: current file encoding for status bar
    const currentEncoding = computed(() => {
        return activeTab.value?.encoding || 'utf-8'
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
            layoutState.activeTopPanel = null
            if (panel === 'explorer') {
                layoutState.explorerVisible = false
            } else {
                layoutState.searchVisible = false
            }
        } else {
            layoutState.activeTopPanel = panel
            if (panel === 'explorer') {
                layoutState.explorerVisible = true
            } else {
                layoutState.searchVisible = true
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
        layoutState.activeFile = tab.path
        code.value = tab.content
        applyViewModeForActiveTab()
    }

    /**
     * Close a tab, saving if dirty.
     */
    async function closeTab(tab: Tab): Promise<void> {
        if (tab.isDirty) {
            try {
                await saveTabAsync(tab.path, tab.content, tab.encoding || 'utf-8')
                tab.isDirty = false
            } catch (err) {
                console.error('Failed to save tab before closing:', tab.path, err)
                // Still close the tab even if save failed
            }
        }

        const index = tabs.value.findIndex(t => t.id === tab.id)
        if (index !== -1) {
            tabs.value.splice(index, 1)
            layoutState.openedFiles = tabs.value.map(t => t.displayPath)

            if (tabs.value.length === 0) {
                activeTabIndex.value = -1
                layoutState.activeFile = ''
                code.value = ''
                applyViewModeForActiveTab()
                return
            }

            if (activeTabIndex.value >= index) {
                activeTabIndex.value = Math.max(0, tabs.value.length - 1)
                layoutState.activeFile = tabs.value[activeTabIndex.value].path
            }
            code.value = tabs.value[activeTabIndex.value]?.content || ''
            applyViewModeForActiveTab()
        }
    }

    /**
     * Save all tabs that have unsaved changes.
     * Uses the tab's detected encoding to preserve the original encoding.
     */
    async function saveDirtyTabs(): Promise<void> {
        for (const tab of tabs.value.filter((t: Tab): boolean => t.isDirty)) {
            try {
                await saveTabAsync(tab.path, tab.content, tab.encoding || 'utf-8')
                tab.isDirty = false
            } catch (err) {
                console.error('Failed to save tab:', tab.path, err)
            }
        }
    }

    /**
     * Start the auto-save timer (60 second interval).
     */
    function startAutoSave(): void {
        stopAutoSave()
        autoSaveTimer = setInterval(async () => {
            try {
                await saveDirtyTabs()
            } catch (err) {
                console.error('Auto-save failed:', err)
            }
        }, AUTO_SAVE_INTERVAL)
    }

    /**
     * Stop the auto-save timer.
     */
    function stopAutoSave(): void {
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer)
            autoSaveTimer = null
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
        if (!showTerminal.value) return
        resizeState.type = 'terminal'
        resizeState.startY = event.clientY
        resizeState.startSize = layoutState.terminalHeight
        attachResizeListeners()
    }

    // Resize animation frame ID for smooth dragging
    let resizeAnimationFrame: number | null = null

    /**
     * Attach global resize listeners.
     */
    function attachResizeListeners(): void {
        window.addEventListener('mousemove', handleResizeDrag)
        window.addEventListener('mouseup', stopResize)
        document.body.style.userSelect = 'none'
        document.body.style.cursor = resizeState.type === 'terminal' ? 'row-resize' : 'col-resize'
        // Disable pointer events on iframes to prevent them from capturing mouse events
        document.querySelectorAll('iframe').forEach(iframe => {
            iframe.style.pointerEvents = 'none'
        })
    }

    /**
     * Handle resize drag event with requestAnimationFrame for smoother performance.
     */
    function handleResizeDrag(event: MouseEvent): void {
        if (!resizeState.type) return

        // Cancel any pending animation frame
        if (resizeAnimationFrame !== null) {
            cancelAnimationFrame(resizeAnimationFrame)
        }

        // Use requestAnimationFrame for smoother resizing
        resizeAnimationFrame = requestAnimationFrame(() => {
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
            resizeAnimationFrame = null
        })
    }

    /**
     * Stop resize operation and clean up listeners.
     */
    function stopResize(): void {
        if (!resizeState.type) return
        if (resizeAnimationFrame !== null) {
            cancelAnimationFrame(resizeAnimationFrame)
            resizeAnimationFrame = null
        }
        window.removeEventListener('mousemove', handleResizeDrag)
        window.removeEventListener('mouseup', stopResize)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        // Re-enable pointer events on iframes
        document.querySelectorAll('iframe').forEach(iframe => {
            iframe.style.pointerEvents = ''
        })
        resizeState.type = null
    }

    /**
     * Read directory contents recursively via streaming.
     * Preserves the expanded state of existing nodes during updates.
     */
    async function readDirAsync(directoryPath: string, targetMap: Map<string, FileNode>): Promise<void> {
        const normalizedDir = window.nodePath.normalize(directoryPath)
        const displayDir = window.nodePath.normalizeDisplay(directoryPath)
        const tempMap = new Map<string, FileNode>()

        // Preserve expanded state from existing nodes
        const expandedPaths = new Set<string>()

        if (targetMap.has(normalizedDir)) {
            tempMap.set(normalizedDir, {...targetMap.get(normalizedDir)!, displayPath: displayDir, children: []})
        }
        const pendingChildren = new Map<string, string[]>()

        const observable = await readDirectory(normalizedDir)

        await new Promise<void>((resolve, reject) => {
            observable.subscribe({
                next: (node) => {
                    const normalizedPath = window.nodePath.normalize(node.path)
                    const displayPath = window.nodePath.normalizeDisplay(node.path)
                    const normalizedParentPath = node.parentPath ? window.nodePath.normalize(node.parentPath) : null

                    // Preserve expanded state if the node previously existed
                    const wasExpanded = layoutState.expandedDirectories.has(normalizedPath)
                    if (wasExpanded) {
                        expandedPaths.add(normalizedPath)
                    }

                    // Destructure to exclude properties we're overriding
                    const {path: _, parentPath: __, children: ___, expanded: ____, ...restNode} = node
                    const normalizedNode: FileNode = {
                        ...restNode,
                        path: normalizedPath,
                        displayPath: displayPath,
                        parentPath: normalizedParentPath,
                        children: [],
                        expanded: wasExpanded
                    }

                    tempMap.set(normalizedPath, normalizedNode)
                    if (normalizedParentPath) {
                        const parent = tempMap.get(normalizedParentPath)
                        if (parent) {
                            parent.children.push(normalizedPath)
                        } else {
                            // Parent not yet loaded, queue this child
                            const list = pendingChildren.get(normalizedParentPath) ?? []
                            list.push(normalizedPath)
                            pendingChildren.set(normalizedParentPath, list)
                        }
                    }

                    // Check if this node has pending children
                    const waiting = pendingChildren.get(normalizedPath)
                    if (waiting) {
                        const me = tempMap.get(normalizedPath)!
                        me.children.push(...waiting)
                        pendingChildren.delete(normalizedPath)
                    }
                },
                complete: () => {
                    layoutState.expandedDirectories = expandedPaths
                    resolve()
                },
                error: (err) => reject(err)
            })
        })
        removeSubNodes(normalizedDir, targetMap)
        for (const [path, node] of tempMap.entries()) {
            targetMap.set(path, node)
        }
        nodeVersion.value++
    }

    function removeSubNodes(dirPath: string, targetMap: Map<string, FileNode>): void {
        const normalized = window.nodePath.normalize(dirPath) + '\\'
        for (const key of Array.from(targetMap.keys())) {
            if (key.startsWith(normalized)) {
                targetMap.delete(key);
            }
        }
    }

    /**
     * Stream file content into a tab via streaming.
     * The tab metadata includes detected encoding from the backend.
     * Language is determined from the file extension.
     */
    async function streamTabAsync(filePath: string): Promise<void> {
        const normalizedPath = window.nodePath.normalizeDisplay(filePath)
        const observable = await streamTab(normalizedPath)
        return new Promise((resolve, reject) => {
            observable.subscribe({
                next: (chunk) => {
                    if (chunk.isMetadata) {
                        const tab = {
                            id: chunk.id,
                            name: chunk.name,
                            path: window.nodePath.normalize(chunk.path),
                            displayPath: window.nodePath.normalizeDisplay(chunk.path),
                            content: '',
                            isDirty: false,
                            encoding: chunk.encoding || 'utf-8',
                            language: getLanguageFromPath(chunk.path || chunk.name)
                        }
                        tabs.value.push(tab)
                        layoutState.openedFiles = tabs.value.map(t => t.displayPath)
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
                complete: () => resolve(),

                error: (err) => {
                    console.error('Stream error:', err)
                    reject(err)
                }
            })
        })
    }

    /**
     * Load the file tree for the workspace root directory.
     */
    async function loadFileTree(): Promise<void> {
        nodes.clear()
        if (!rootDirectory.value) return

        const nodePath = window.nodePath
        const rootName = nodePath?.basename
            ? nodePath.basename(displayRootDirectory.value)
            : displayRootDirectory.value

        nodes.set(rootDirectory.value, {
            name: rootName,
            path: rootDirectory.value,
            displayPath: displayRootDirectory.value,
            extension: '',
            parentPath: null,
            isDirectory: true,
            expanded: true,
            children: []
        })
        await readDirAsync(rootDirectory.value, nodes)
    }

    async function processQueue() {
        if (processing) return;
        processing = true;

        while (fileChangeQueue.length) {
            const {dirPath, resolve, reject} = fileChangeQueue.shift()!;
            try {
                await readDirAsync(dirPath, nodes);
                resolve();
            } catch (err) {
                reject(err);
            }
        }

        processing = false;
    }

    /**
     * Handle file change events from the backend file watcher.
     * Performs atomic incremental updates to the file tree.
     */
    async function handleFileChange(dirPath: string): Promise<void> {
        const normalizedPath = window.nodePath.normalize(dirPath)
        return new Promise<void>((resolve, reject) => {
            fileChangeQueue.push({dirPath: normalizedPath, resolve, reject});
            // handling
            void processQueue();
        });
    }

    /**
     * Start watching the workspace directory for file changes.
     */
    async function startFileWatcher(): Promise<void> {
        if (!rootDirectory.value) return

        // Clean up existing watcher
        await stopFileWatcher()

        try {
            // Start watching on the backend
            await startWatching(rootDirectory.value)

            // Listen for file change events
            fileWatcherCleanup = onFileChanged(handleFileChange)
            console.log('File watcher started for:', rootDirectory.value)
        } catch (err) {
            console.error('Failed to start file watcher:', err)
        }
    }

    /**
     * Stop watching the workspace directory for file changes.
     */
    async function stopFileWatcher(): Promise<void> {
        // Unregister event handler
        if (fileWatcherCleanup) {
            fileWatcherCleanup()
            fileWatcherCleanup = null
        }

        // Stop watching on the backend
        if (rootDirectory.value) {
            try {
                await stopWatching(rootDirectory.value)
                console.log('File watcher stopped for:', rootDirectory.value)
            } catch (err) {
                console.error('Failed to stop file watcher:', err)
            }
        }
    }

    /**
     * Toggle folder expansion state.
     */
    function toggleFolder(node: UIFileNode): void {
        const fileNode = nodes.get(node.path)
        if (fileNode) {
            fileNode.expanded = !node.expanded
            node.expanded = !node.expanded
            if (layoutState.expandedDirectories.has(node.path)) {
                layoutState.expandedDirectories.delete(node.path)
            } else {
                layoutState.expandedDirectories.add(node.path)
            }
        }
    }

    /**
     * Search files by name using the nodes Map.
     * Returns files that match the query (case-insensitive).
     */
    function searchFiles(query: string): UIFileNode[] {
        if (!query.trim()) return []

        const lowerQuery = query.toLowerCase()
        const results: UIFileNode[] = []

        for (const [, node] of nodes) {
            if (!node.isDirectory && node.name.toLowerCase().includes(lowerQuery)) {
                results.push({
                    name: node.name,
                    path: node.path,
                    displayPath: node.displayPath,
                    extension: node.extension,
                    isDirectory: node.isDirectory,
                    expanded: false,
                    children: []
                })
            }
        }

        // Sort results: exact matches first, then alphabetically
        return results.sort((a, b) => {
            const aExact = a.name.toLowerCase() === lowerQuery
            const bExact = b.name.toLowerCase() === lowerQuery
            if (aExact !== bExact) return aExact ? -1 : 1
            return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
        })
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
                await streamTabAsync(node.displayPath)
            }
        } catch (err) {
            console.error('Error opening file:', err)
        }
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
        // Stop previous file watcher and auto-save
        try {
            await stopFileWatcher()
        } catch (err) {
            console.error('Failed to stop file watcher:', err)
        }
        stopAutoSave()

        nodes.clear()
        fileTree.value = []
        const trimmedPath = directoryPath.trim()
        rootDirectory.value = window.nodePath.normalize(trimmedPath)
        displayRootDirectory.value = window.nodePath.normalizeDisplay(trimmedPath)
        if (!rootDirectory.value) return

        try {
            await loadFileTree()
        } catch (err) {
            console.error('Failed to load file tree:', err)
        }

        // Start file watcher and auto-save for the new directory
        try {
            await startFileWatcher()
        } catch (err) {
            console.error('Failed to start file watcher:', err)
        }
        startAutoSave()
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
        try {
            await saveWorkspaceSettingsAsync(rootDirectory.value, {...layoutState, expandedDirectories: [...layoutState.expandedDirectories]})
        } catch (err) {
            console.error('Failed to save workspace settings:', err)
        }
    }

    /**
     * Load workspace settings from disk and restore state.
     */
    async function loadWorkspaceSettings(): Promise<void> {
        try {
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
                layoutState.openedFiles = (settings.openedFiles ?? []).map(window.nodePath.normalizeDisplay)
                layoutState.expandedDirectories = new Set((settings.expandedDirectories ?? []).map(window.nodePath.normalizeDisplay))
                layoutState.explorerVisible = (settings.explorerVisible ?? true)
                await openWorkspace(rootDirectory.value)
                for (const filePath of layoutState.openedFiles) {
                    try {
                        await streamTabAsync(filePath)
                    } catch (err) {
                        console.error('Failed to restore tab:', filePath, err)
                    }
                }

                // Restore active file
                layoutState.activeFile = window.nodePath.normalize(settings.activeFile ?? '')
                const activeTab = tabs.value.find(t => t.path === layoutState.activeFile) || tabs.value[0]
                if (activeTab) {
                    openTab(activeTab)
                }
            }
        } catch (err) {
            console.error('Failed to load workspace settings:', err)
        }
    }

    // Clipboard state for cut/copy/paste operations
    const clipboard = reactive<{
        path: string | null,
        isDirectory: boolean,
        operation: 'copy' | 'cut' | null
    }>({
        path: null,
        isDirectory: false,
        operation: null
    })

    /**
     * Create a new file at the specified path.
     */
    async function createNewFile(parentPath: string, fileName: string): Promise<void> {
        const filePath = window.nodePath.join(parentPath, fileName)
        try {
            await createFile(filePath)
        } catch (err) {
            console.error('Failed to create file:', err)
        }
    }

    /**
     * Create a new folder at the specified path.
     */
    async function createNewFolder(parentPath: string, folderName: string): Promise<void> {
        const folderPath = window.nodePath.join(parentPath, folderName)
        try {
            await createDirectory(folderPath)
        } catch (err) {
            console.error('Failed to create folder:', err)
        }
    }

    /**
     * Delete a file at the specified path.
     */
    async function deleteFileNode(filePath: string, isDirectory: boolean): Promise<void> {
        try {
            if (isDirectory) {
                await deleteDirectory(filePath)
            } else {
                await deleteFile(filePath)
                // Close the tab if the file is open
                const tab = tabs.value.find(t => t.path === window.nodePath.normalize(filePath))
                if (tab) {
                    const index = tabs.value.indexOf(tab)
                    tabs.value.splice(index, 1)
                    layoutState.openedFiles = tabs.value.map(t => t.displayPath)
                    if (tabs.value.length === 0) {
                        activeTabIndex.value = -1
                        layoutState.activeFile = ''
                        code.value = ''
                    } else if (activeTabIndex.value >= index) {
                        activeTabIndex.value = Math.max(0, tabs.value.length - 1)
                        layoutState.activeFile = tabs.value[activeTabIndex.value].path
                        code.value = tabs.value[activeTabIndex.value]?.content || ''
                    }
                }
            }
        } catch (err) {
            console.error('Failed to delete:', err)
        }
    }

    /**
     * Rename a file or folder.
     */
    async function renameFileNode(oldPath: string, newName: string, isDirectory: boolean): Promise<void> {
        const parentPath = window.nodePath.dirname(oldPath)
        const newPath = window.nodePath.join(parentPath, newName)
        try {
            if (isDirectory) {
                await RenameDirectory(oldPath, newPath)
            } else {
                await renameFile(oldPath, newPath)
                // Update the tab if the file is open
                const normalizedOldPath = window.nodePath.normalize(oldPath)
                const tab = tabs.value.find(t => t.path === normalizedOldPath)
                if (tab) {
                    tab.path = window.nodePath.normalize(newPath)
                    tab.displayPath = window.nodePath.normalizeDisplay(newPath)
                    tab.name = newName
                    layoutState.openedFiles = tabs.value.map(t => t.displayPath)
                    if (layoutState.activeFile === normalizedOldPath) {
                        layoutState.activeFile = tab.path
                    }
                }
            }
        } catch (err) {
            console.error('Failed to rename:', err)
        }
    }

    /**
     * Copy a file or folder to clipboard.
     */
    function copyToClipboard(path: string, isDirectory: boolean): void {
        clipboard.path = path
        clipboard.isDirectory = isDirectory
        clipboard.operation = 'copy'
    }

    /**
     * Cut a file or folder to clipboard.
     */
    function cutToClipboard(path: string, isDirectory: boolean): void {
        clipboard.path = path
        clipboard.isDirectory = isDirectory
        clipboard.operation = 'cut'
    }

    /**
     * Paste from clipboard to the specified destination.
     */
    async function pasteFromClipboard(destinationPath: string): Promise<void> {
        if (!clipboard.path || !clipboard.operation) return

        const fileName = window.nodePath.basename(clipboard.path)
        const destPath = window.nodePath.join(destinationPath, fileName)

        try {
            if (clipboard.isDirectory) {
                if (clipboard.operation === 'copy') {
                    await copyDirectory(clipboard.path, destPath)
                } else {
                    // For cut operation, we need to move (rename) the directory
                    await RenameDirectory(clipboard.path, destPath)
                }
            } else {
                if (clipboard.operation === 'copy') {
                    await copyFile(clipboard.path, destPath)
                } else {
                    // For cut operation, we need to move (rename) the file
                    const normalizedOldPath = window.nodePath.normalize(clipboard.path)
                    await renameFile(clipboard.path, destPath)
                    // Update the tab if the file is open
                    const tab = tabs.value.find(t => t.path === normalizedOldPath)
                    if (tab) {
                        tab.path = window.nodePath.normalize(destPath)
                        tab.displayPath = window.nodePath.normalizeDisplay(destPath)
                        tab.name = fileName
                        layoutState.openedFiles = tabs.value.map(t => t.displayPath)
                        if (layoutState.activeFile === normalizedOldPath) {
                            layoutState.activeFile = tab.path
                        }
                    }
                }
            }

            // Clear clipboard after cut operation
            if (clipboard.operation === 'cut') {
                clipboard.path = null
                clipboard.isDirectory = false
                clipboard.operation = null
            }
        } catch (err) {
            console.error('Failed to paste:', err)
        }
    }

    /**
     * Check if clipboard has content to paste.
     */
    function hasClipboardContent(): boolean {
        return clipboard.path !== null && clipboard.operation !== null
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
        displayRootDirectory,
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
        showSearch,
        showTerminal,
        showPreviewPane,
        showCodePane,
        explorerStyle,
        terminalStyle,
        currentLanguage,
        currentEncoding,
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
        searchFiles,
        saveDirtyTabs,
        applyViewModeForActiveTab,
        resetTabs,
        openWorkspace,
        createNewWorkspace,
        setWorkspaceDirectory,
        saveWorkspaceSettings,
        loadWorkspaceSettings,

        // File watcher actions
        startFileWatcher,
        stopFileWatcher,
        handleFileChange,

        // Auto-save actions
        startAutoSave,
        stopAutoSave,

        // File operations
        clipboard,
        createNewFile,
        createNewFolder,
        deleteFileNode,
        renameFileNode,
        copyToClipboard,
        cutToClipboard,
        pasteFromClipboard,
        hasClipboardContent
    }
})
