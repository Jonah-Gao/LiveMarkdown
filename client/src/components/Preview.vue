<script setup lang="ts">
import {storeToRefs} from 'pinia'
import {useWorkspaceStore} from '@/stores/workspace'
import '@/styles/github-markdown.css'
import 'highlight.js/styles/github-dark.css'

const workspace = useWorkspaceStore()
const {renderedVNode, previewPaneStyle, showPreviewPane} = storeToRefs(workspace)
</script>

<template>
    <div class="preview-main" :style="previewPaneStyle" v-show="showPreviewPane">
        <div class="markdown-body">
            <component :is="renderedVNode"/>
        </div>
    </div>
</template>

<style scoped>
.preview-main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    background-color: var(--bg-secondary);
    overflow: hidden;
}

.markdown-body {
    width: 100%;
    flex: 1;
    display: block;
    padding: 24px 48px;
    overflow-y: auto;
    background-color: var(--bg-secondary);
}
</style>