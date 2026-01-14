export interface FileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children?: FileNode[]
    expanded?: boolean
}

export interface FileIndexEntry {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    parentPath?: string
    depth: number
}

export interface Tab {
    id: string
    name: string
    path: string
    content: string
    isDirty: boolean
}

export interface TabChunk {
    id: string
    name: string
    path: string
    content: string
    isMetadata: boolean
    isError: boolean
}

export type ViewMode = 'code' | 'split' | 'preview'

export interface PanelLayout {
    ExplorerWidth: number
    TerminalHeight: number
    EditorPreviewRatio: number
    PreferredViewMode: ViewMode
}
