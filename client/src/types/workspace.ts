export interface FileNode {
    name: string
    path: string
    parentPath: string | null
    extension: string
    isDirectory: boolean
    children: string[]
    expanded?: boolean
}

export interface UIFileNode {
    name: string
    path: string
    extension: string
    isDirectory: boolean
    children: UIFileNode[]
    expanded?: boolean
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
    explorerWidth: number
    terminalHeight: number
    editorPreviewRatio: number
    preferredViewMode: ViewMode,
    openedFiles: string[]
}