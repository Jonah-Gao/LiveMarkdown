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
