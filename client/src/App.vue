<!--<script setup>-->
<!--import Editor from "./components/Editor.vue";-->
<!--</script>-->

<!--<template>-->
<!--    <Editor />-->
<!--</template>-->

<!--<style scoped>-->
<!--</style>-->
<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import FileExplorer from './components/FileExplorer.vue'
import TabsBar from './components/TabsBar.vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import Terminal from './components/Terminal.vue'
import {useWorkspaceStore} from '@/stores/workspace'
import NavigationBar from "@/components/NavigationBar.vue";

const workspace = useWorkspaceStore()
const {
    explorerStyle,
    showExplorer,
    showTerminalArea,
    showCodePane,
    showPreviewPane,
    activeTab,
    hasTabs,
    hasWorkspace,
} = storeToRefs(workspace)

const sidebarButtons = workspace.sidebarButtons
const viewModeButtons = workspace.viewModeButtons

const editorPane = ref<HTMLElement | null>(null)

function startPreviewResize(event: MouseEvent) {
    const width = editorPane.value?.getBoundingClientRect().width || 0
    workspace.startPreviewResize(event, width)
}

onMounted(async () => {
    workspace.rootDirectory = await window.cwd.getCwd();
    await workspace.initializeWorkspace()
    await workspace.loadWorkspaceSettings()
    window.windowControls.onBeforeClose(() => {
        workspace.saveDirtyTabs()
        workspace.saveWorkspaceSettings()
        window.cwd.setCwd(workspace.rootDirectory);
        window.windowControls.canClose();
    })
})

</script>

<template>
    <div class="window">
        <NavigationBar/>
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
                    <template v-if="hasWorkspace">
                        <FileExplorer
                            v-show="showExplorer"
                            :style="explorerStyle"
                        />
                        <div v-show="showExplorer" class="vertical-resizer"
                             @mousedown="workspace.startExplorerResize"></div>

                        <div class="editor-container">
                            <TabsBar v-if="hasTabs" :view-mode-buttons="viewModeButtons"/>
                            <div
                                v-if="hasTabs"
                                class="editor"
                                ref="editorPane"
                            >
                                <Editor/>

                                <div
                                    v-show="showCodePane && showPreviewPane"
                                    class="split-resizer"
                                    @mousedown="startPreviewResize"
                                ></div>

                                <Preview/>
                            </div>
                            <div v-else class="workspace-empty">
                                <p>Select a file from the explorer to start editing.</p>
                            </div>
                        </div>
                    </template>
                    <div v-else class="workspace-empty">
                        <p>Select a workspace from File &gt; Open or File &gt; New.</p>
                    </div>
                </div>

                <div
                    v-if="hasWorkspace && showTerminalArea"
                    class="horizontal-resizer"
                    @mousedown="workspace.startTerminalResize"
                ></div>
                <template v-if="hasWorkspace">
                    <Terminal v-show="showTerminalArea"/>
                </template>
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
                    <span>{{ hasTabs ? activeTab?.name : 'No file open' }}</span>
                </div>
            </div>
            <div class="status-bar-right">
                <div class="status-item">
                    <span>{{ workspace.currentLanguage }}</span>
                </div>
                <div class="status-item">
                    <span>UTF-8</span>
                </div>
            </div>
        </div>
    </div>
</template>