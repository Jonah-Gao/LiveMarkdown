<script setup lang="ts">
import {inject} from "vue";

const props = defineProps<{ code: string, lang: string }>();

type RunTerminalApi = {
    runCode?: (code: string, lang?: string, options?: { clear?: boolean }) => Promise<void> | void
    open?: () => void
}

const runTerminal = inject<RunTerminalApi>('runTerminal')

function executeCodeBlock(clear = true) {
    if (runTerminal?.runCode) {
        runTerminal.runCode(props.code, props.lang, {clear}).catch(err => {
            console.error('Failed to run code block', err)
        })
    } else {
        console.warn('Run terminal is not available')
    }
}

function copyCodeBlock() {
    navigator.clipboard.writeText(props.code).then(() => {
        console.log('Code copied to clipboard')
    }).catch(err => {
        console.error('Failed to copy code: ', err)
    })
}

</script>

<template>
    <div class="md-code-wrapper">
        <div class="md-code-actions">
            <div class="md-icon-btn md-execute-btn" @click="executeCodeBlock(true)">
                <span class="material-symbols-outlined">play_arrow</span>
            </div>
            <div class="md-icon-btn md-execute-terminal-btn" @click="executeCodeBlock(false)">
                <span class="material-symbols-outlined">fast_forward</span>
            </div>
            <div class="md-icon-btn md-copy-btn" @click="copyCodeBlock">
                <span class="material-symbols-outlined">content_copy</span>
            </div>
        </div>
        <pre><code :class="lang">{{ code }}</code></pre>
    </div>
</template>

<style scoped>

</style>
