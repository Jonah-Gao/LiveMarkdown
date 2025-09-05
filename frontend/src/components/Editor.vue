<script setup lang="ts">
import {ref, computed, watch} from 'vue'

const text = ref('')

// 字符与单词统计
const charCount = computed(() => text.value.length)
const wordCount = computed(() => {
  const t = text.value.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
})

// 行号：按换行符拆分
const lineCount = computed(() => {
  // 至少显示一行
  const lines = text.value.split('\n').length
  return Math.max(1, lines)
})

function onInput() {
  // 如需节流/防抖可在这里处理
}

// 可选：保持 textarea 与行号等高
watch(text, () => {
  // 若需要根据内容自适应高度，可以在这里做 autosize 逻辑
})
</script>

<template>
  <div class="window">
    <div class="title-bar">
      <!--        <div class="file-operations">-->
      <!--            <button id="new-file">New</button>-->
      <!--            <button id="open-file">Open</button>-->
      <!--            <button id="save-file">Save</button>-->
      <!--        </div>-->
      <!--        <div class="edit-operations">-->
      <!--            <button id="cut-btn">Cut</button>-->
      <!--            <button id="copy-btn">Copy</button>-->
      <!--            <button id="paste-btn">Paste</button>-->
      <!--        </div>-->
      <!--        <div class="format-operations">-->
      <!--            <button id="bold-btn">Bold</button>-->
      <!--            <button id="italic-btn">Italic</button>-->
      <!--            <button id="underline-btn">Underline</button>-->
      <!--        </div>-->
    </div>
    <!--<div class="app-title">Simple Text Editor</div>-->
    <div class="workspace">
      <div class="tool-bar">
        <div class="general-action">
          <div class="badge files"></div>
          <div class="badge search"></div>
          <div class="badge account"></div>
        </div>
        <div class="code-action">
          <div class="badge run"></div>
          <div class="badge terminal"></div>
        </div>
      </div>
      <div class="view-content"></div>
      <div class="editor-container">
        <div class="tab-bar"></div>
        <div class="editor-main">
          <div class="line-number">
            <div v-for="n in lineCount" :key="n" class="line">{{ n }}</div>
          </div>
          <textarea
              id="editor-textarea"
              v-model="text"
              placeholder="Start typing here..."
              @input="onInput"
          ></textarea>
        </div>
      </div>
    </div>
    <div class="status-bar">
      <span id="word-count">Words: {{ wordCount }}</span>&nbsp;
      <span id="char-count">Characters: {{ charCount }}</span>
    </div>
  </div>
</template>

<style scoped>

</style>