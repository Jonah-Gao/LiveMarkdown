<script setup lang="ts">
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import {nextTick, ref, watch} from "vue";

const props = defineProps<{ code: string }>();
const codeEl = ref<HTMLElement | null>(null)

watch(
    () => props.code,
    async () => {
        await nextTick()
        const el = codeEl.value
        if (!el) return

        // remove previous highlight
        delete (el as any).dataset.highlighted

        // hljs highlight
        hljs.highlightElement(el)
    },
    {immediate: true}
)

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
            <div class="md-icon-btn md-copy-btn" @click="copyCodeBlock">
                <span class="material-symbols-outlined">content_copy</span>
            </div>
        </div>
        <pre><code ref="codeEl" class="nohighlight">{{ code }}</code></pre>
        <div class="md-output-console" id="md-terminal" ref="mdTerminal">
            <div id="terminal" ref="terminal"></div>
        </div>
    </div>
</template>

<style scoped>
pre code.hljs {
    padding: 0;
}
</style>