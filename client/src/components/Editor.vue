<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch, nextTick} from 'vue'
import {storeToRefs} from 'pinia'
import * as monaco from 'monaco-editor'
import {useWorkspaceStore} from '@/stores/workspace'


const workspace = useWorkspaceStore()
const {code, currentLanguage, editorPaneStyle, showCodePane} = storeToRefs(workspace)

const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
    fontSize: 14,
    minimap: {enabled: true},
    automaticLayout: true,
    wordWrap: 'on',
    theme: 'vs-dark'
}

function initializeEditor(): void {
    if (!editorContainer.value) return

    editor = monaco.editor.create(editorContainer.value, {
        value: code.value,
        language: currentLanguage.value.toLowerCase(),
        ...EDITOR_OPTIONS
    })


    editor.onDidChangeModelContent(() => {
        if (editor) {
            code.value = editor.getValue()
        }
    })
}

// Watch for code changes from outside
watch(code, (newCode) => {
    if (editor && editor.getValue() !== newCode) {
        editor.setValue(newCode)
    }
})

// Watch for language changes
watch(currentLanguage, (newLang) => {
    if (editor) {
        const model = editor.getModel()
        if (model) {
            monaco.editor.setModelLanguage(model, newLang.toLowerCase())
        }
    }
})

// Watch for showCodePane to layout editor
watch(showCodePane, async (visible) => {
    if (visible && editor) {
        await nextTick()
        editor.layout()
    }
})

onMounted(() => {
    initializeEditor()
})

onUnmounted(() => {
    editor?.dispose()
    editor = null
})
</script>

<template>
    <div class="editor-main" :style="editorPaneStyle" v-show="showCodePane">
        <div ref="editorContainer" class="code-editor"></div>
    </div>
</template>

<style scoped>
.editor-main {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

.code-editor {
    width: 100%;
    height: 100%;
    min-width: 0;
}

.editor-main :deep(.monaco-editor),
.editor-main :deep(.monaco-editor .overflow-guard) {
    max-width: 100%;
}
</style>