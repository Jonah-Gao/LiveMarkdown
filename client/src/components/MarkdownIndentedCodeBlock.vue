<script setup lang="ts">
const props = defineProps<{ code: string }>();

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
        <pre><code>{{ code }}</code></pre>
        <div class="md-output-console" id="md-terminal" ref="mdTerminal">
            <div id="terminal" ref="terminal"></div>
        </div>
    </div>
</template>

<style scoped>

</style>