/**
 * Core file node structure stored in the flat map.
 * Contains the essential file metadata and tree structure pointers.
 */
export interface FileNode {
    name: string
    path: string
    parentPath: string | null
    extension: string
    isDirectory: boolean
    children: string[]      // Paths to child nodes
    expanded: boolean       // UI state for directory expansion
}

/**
 * Derived file node for rendering the tree view.
 * Built from FileNode when needed, contains resolved children.
 */
export interface UIFileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children: UIFileNode[]
    expanded: boolean
}

/**
 * Editor tab representing an open file.
 */
export interface Tab {
    id: string
    name: string
    path: string
    content: string
    isDirty: boolean
}

/**
 * Chunk of data for streaming file content.
 * Used for efficient large file loading.
 */
export interface TabChunk {
    id: string
    name: string
    path: string
    content: string
    isMetadata: boolean
    isError: boolean
}

/**
 * Editor view mode for Markdown files.
 */
export type ViewMode = 'code' | 'split' | 'preview'

/**
 * Sidebar panel types.
 */
export type SidebarPanel = 'explorer' | 'search' | 'run' | 'terminal' | null

/**
 * Layout state persisted to workspace settings.
 * Contains both UI dimensions and panel visibility state.
 */
export interface PanelLayout {
    // Panel dimensions
    explorerWidth: number
    terminalHeight: number
    editorPreviewRatio: number

    // View preferences
    preferredViewMode: ViewMode

    // Panel visibility state
    explorerVisible: boolean
    terminalVisible: boolean
    activeTopPanel: SidebarPanel
    activeBottomPanel: SidebarPanel

    // Open files
    openedFiles: string[]
    activeFile: string
}