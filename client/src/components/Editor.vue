<script setup lang="ts">
import {storeToRefs} from 'pinia'
import {CodeEditor} from 'monaco-editor-vue3'
import {useWorkspaceStore} from '@/stores/workspace'

const workspace = useWorkspaceStore()
const {code, currentLanguage, editorPaneStyle, showCodePane} = storeToRefs(workspace)

const EDITOR_OPTIONS = {
    fontSize: 14,
    minimap: {enabled: true},
    automaticLayout: true,
    wordWrap: 'on'
}
</script>

<template>
    <div class="editor-main" :style="editorPaneStyle" v-show="showCodePane">
        <CodeEditor
            v-model:value="code"
            :language="currentLanguage"
            :options="EDITOR_OPTIONS"
            theme="vs-dark"
            class="code-editor"
            :style="{ width: '100%', height: '100%' }"
        />
    </div>
</template>
