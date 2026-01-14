<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import FileExplorer from './components/FileExplorer.vue'
import TabsBar from './components/TabsBar.vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import Terminal from './components/Terminal.vue'
import {useWorkspaceStore} from '@/stores/workspace'

const workspace = useWorkspaceStore()
const {
    explorerStyle,
    showExplorer,
    showTerminalArea,
    showCodePane,
    showPreviewPane,
    activeTab,
} = storeToRefs(workspace)

const sidebarButtons = workspace.sidebarButtons
const viewModeButtons = workspace.viewModeButtons
const defaultUntitledName = workspace.defaultUntitledName

const editorPane = ref<HTMLElement | null>(null)

function startPreviewResize(event: MouseEvent) {
    const width = editorPane.value?.getBoundingClientRect().width || 0
    workspace.startPreviewResize(event, width)
}

onMounted(async () => {
    await workspace.initializeWorkspace()
})

onBeforeUnmount(() => {
    workspace.teardown()
})
</script>

<template>
    <div class="window">
        <div class="window-workspace">
            <div class="tool-bar">
                <div class="general-action">
                    <div
                        v-for="(item, index) in sidebarButtons.top"
                        :key="index"
                        class="badge"
                        :class="{ active: workspace.activeIndexTop === index }"
                        @click="workspace.handleTopButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>

                <div class="code-action">
                    <div
                        v-for="(item, index) in sidebarButtons.bottom"
                        :key="index"
                        class="badge"
                        :class="{ active: workspace.activeIndexBottom === index }"
                        @click="workspace.handleBottomButtonClick(index)"
                    >
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>
            </div>

            <div class="workspace-wrapper">
                <div class="workspace">
                    <FileExplorer
                        v-show="showExplorer"
                        :style="explorerStyle"
                    />
                    <div v-show="showExplorer" class="vertical-resizer" @mousedown="workspace.startExplorerResize"></div>

                    <div class="editor-container">
                        <TabsBar :view-mode-buttons="viewModeButtons" />
                        <div class="editor" ref="editorPane">
                            <Editor />

                            <div
                                v-show="showCodePane && showPreviewPane"
                                class="split-resizer"
                                @mousedown="startPreviewResize"
                            ></div>

                            <Preview />
                        </div>
                    </div>
                </div>

                <div v-show="showTerminalArea" class="horizontal-resizer" @mousedown="workspace.startTerminalResize"></div>
                <Terminal v-show="showTerminalArea" />
            </div>
        </div>

        <div class="status-bar">
            <div class="status-bar-left">
                <div class="status-item">
                    <span class="status-indicator"></span>
                    <span>Ready</span>
                </div>
                <div class="status-item">
                    <span class="material-symbols-outlined">description</span>
                    <span>{{ activeTab?.name || defaultUntitledName }}</span>
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
