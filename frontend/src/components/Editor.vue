<script setup lang="ts">
// ==================== IMPORTS ====================
import {ref, computed, watch, onMounted, nextTick, onBeforeUnmount} from 'vue'
import MarkdownIt from 'markdown-it'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import hljs from '@highlightjs/cdn-assets/es/highlight.js'
import "@highlightjs/cdn-assets/styles/github-dark.css"
import * as signalR from "@microsoft/signalr"

// ==================== REACTIVE STATE ====================
// Editor state management - stores lines of text as separate blocks
const blocks = ref<string[]>(['']) // Array of text lines in the editor
const textareas = ref([]) // References to textarea elements for focus management
const activeIndexTop = ref(null) // Sidebar active state
const activeIndexBottom = ref(null) // Sidebar active state
const explorerVisible = ref(true) // Explorer sidebar visibility

const buttonsTop = [
    {icon: 'folder'},
    {icon: 'search'},
    {icon: 'account_circle'},
]

const buttonsBottom = [
    {icon: 'play_arrow'},
    {icon: 'terminal'},
]

// Terminal state management
const terminal = ref(null) // Reference to terminal DOM element
let xterm: Terminal // XTerm.js terminal instance
let fitAddon: FitAddon // Addon for automatic terminal sizing

// ==================== SIGNALR CONNECTIONS ====================
// Initialize SignalR connection for markdown synchronization
const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5238/mdHub") // Backend markdown hub URL
    .build()

// Initialize SignalR connection for terminal communication
const terminalConnection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5238/terminalHub") // Backend terminal hub URL
    .build()

// ==================== TERMINAL FUNCTIONALITY ====================
// Terminal input management
let terminalInput = "" // Current command being typed
let terminalCursor = 0 // Cursor position within the current command

/**
 * Handle terminal output received from the backend
 * @param output - The output string from terminal command execution
 */
terminalConnection.on("ReceiveOutput", (output: string) => {
    console.log('Terminal output received:', output)
    if (xterm) {
        xterm.write(output + "\r\n") // Write output to terminal with newline
    }
})

/**
 * Initialize the XTerm.js terminal with custom configuration
 * Sets up theme, font, and input handling
 */
function initializeTerminal() {
    // Create new terminal instance with custom styling
    xterm = new Terminal({
        fontFamily: 'JetBrains Mono, monospace',
        cursorBlink: true,
        rows: 20,
        fontSize: 13,
        lineHeight: 1,
        letterSpacing: 0,
        theme: {
            background: '#010409' // Dark theme background
        }
    })

    // Add fit addon for responsive sizing
    fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    // Mount terminal to DOM element
    xterm.open(terminal.value)
    fitAddon.fit()

    // Display welcome message
    xterm.writeln('Welcome to xterm.js + Vue.js!')

    // Setup input event handlers
    setupTerminalInput()
}

/**
 * Setup terminal input handling for keyboard events
 * Handles special keys, printable characters, and cursor movement
 */
function setupTerminalInput() {
    xterm.onData(data => {
        const code = data.charCodeAt(0)

        if (code === 27) { // ESC sequences (arrow keys, home, end, etc.)
            handleEscapeSequence(data)
        } else if (code === 13) { // Enter key - execute command
            handleEnterKey()
        } else if (code === 127 || code === 8) { // Backspace/Delete
            handleBackspace()
        } else { // Regular printable characters
            handlePrintableCharacter(data)
        }
    })
}

/**
 * Handle escape sequences for cursor movement and special keys
 * @param data - The escape sequence string
 */
function handleEscapeSequence(data: string) {
    const sequence = data.substr(1) // Remove ESC character

    switch (sequence) {
        case '[C': // Right arrow - move cursor right
            if (terminalCursor < terminalInput.length) {
                terminalCursor++
                xterm.write('\x1b[C') // Move cursor right visually
            }
            break
        case '[D': // Left arrow - move cursor left
            if (terminalCursor > 0) {
                terminalCursor--
                xterm.write('\x1b[D') // Move cursor left visually
            }
            break
        case '[H': // Home key - move to beginning of line
            xterm.write('\x1b[D'.repeat(terminalCursor)) // Move cursor to start
            terminalCursor = 0
            break
        case '[F': // End key - move to end of line
            xterm.write('\x1b[C'.repeat(terminalInput.length - terminalCursor))
            terminalCursor = terminalInput.length
            break
    }
}

/**
 * Handle Enter key press - execute the current command
 * Sends command to backend via SignalR and resets input state
 */
function handleEnterKey() {
    console.log('Executing command:', terminalInput)

    // Send command to backend for execution
    terminalConnection.invoke("SendCommand", terminalInput)
        .catch(err => console.error('Error sending command:', err.toString()))

    // Move to new line and reset input state
    xterm.write("\r\n")
    terminalInput = ""
    terminalCursor = 0
}

/**
 * Handle backspace/delete key press
 * Removes character before cursor and updates display
 */
function handleBackspace() {
    if (terminalCursor > 0) {
        // Remove character at cursor position
        terminalInput = terminalInput.slice(0, terminalCursor - 1) + terminalInput.slice(terminalCursor)
        terminalCursor--

        // Update visual display
        xterm.write('\b \b') // Backspace, space, backspace

        // If deleting from middle of line, redraw the remainder
        if (terminalCursor < terminalInput.length) {
            const remainingText = terminalInput.slice(terminalCursor)
            xterm.write(remainingText + ' ') // Redraw remaining text
            xterm.write('\x1b[D'.repeat(remainingText.length + 1)) // Move cursor back
        }
    }
}

/**
 * Handle printable character input
 * @param data - The character to insert
 */
function handlePrintableCharacter(data: string) {
    // Insert character at current cursor position
    terminalInput = terminalInput.slice(0, terminalCursor) + data + terminalInput.slice(terminalCursor)

    // Echo the character to terminal
    xterm.write(data)

    // If inserting in middle of line, redraw remainder
    if (terminalCursor < terminalInput.length - 1) {
        const remainingText = terminalInput.slice(terminalCursor + 1)
        xterm.write(remainingText) // Write remaining text
        xterm.write('\x1b[D'.repeat(remainingText.length)) // Move cursor back
    }

    terminalCursor++ // Advance cursor position
}

/**
 * Handle window resize events to fit terminal properly
 */
function handleResize() {
    if (fitAddon) {
        fitAddon.fit() // Resize terminal to fit container
    }
}

// ==================== MARKDOWN FUNCTIONALITY ====================
/**
 * Initialize Markdown renderer with syntax highlighting support
 * Uses highlight.js for code block syntax highlighting
 */
const md = new MarkdownIt({
    highlight: function (code: string, lang: string) {
        // If language is specified and supported, use syntax highlighting
        if (lang && hljs.getLanguage(lang)) {
            return '<pre class="hljs"><code>' +
                hljs.highlight(code, {language: lang, ignoreIllegals: true}).value +
                '</code></pre>'
        }
        // Fallback to plain code block
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(code) + '</code></pre>'
    },
})

/**
 * Computed property that renders markdown content to HTML
 * Automatically updates when editor content changes
 */
const renderedHtml = computed(() => md.render(blocks.value.join("\n")))

// ==================== EDITOR FUNCTIONALITY ====================
/**
 * Handle input events in editor
 * Placeholder for future throttling/debouncing implementation
 */
function onInput() {
    // Future: Add throttling/debouncing for performance optimization
}

/**
 * Add a new line in the editor at specified position
 * @param index - The line index after which to add new line
 */
function newLine(index: number) {
    // Insert empty string at next position
    blocks.value.splice(index + 1, 0, "")

    // Focus the new textarea after DOM update
    nextTick(() => {
        const textarea = document.getElementById(`editor-textarea-${index + 1}`) as HTMLTextAreaElement
        if (textarea) {
            textarea.focus()
        }
    })
}

/**
 * Remove a line from the editor when conditions are met
 * @param index - The line index to potentially remove
 * @param event - The keyboard event that triggered this
 */
function removeLine(index: number, event: KeyboardEvent) {
    // Only remove if line is empty and not the last remaining line
    if (blocks.value[index] === "" && blocks.value.length > 1) {
        event.preventDefault()
        blocks.value.splice(index, 1)

        // Focus previous line after removal
        nextTick(() => {
            const textarea = textareas.value[index - 1] || textareas.value[0]
            if (textarea) {
                textarea.focus()
            }
        })
    }
}

// ==================== SIGNALR FUNCTIONALITY ====================
/**
 * Initialize both SignalR connections for markdown and terminal
 * Establishes connections to backend hubs
 */
async function initializeSignalR() {
    try {
        // Start markdown synchronization connection
        await connection.start()
        console.log('Markdown SignalR connection established')

        // Start terminal communication connection
        await terminalConnection.start()
        console.log('Terminal SignalR connection established')
    } catch (err) {
        console.error('SignalR connection failed:', err.toString())
    }
}

// ==================== WATCHERS ====================
/**
 * Watch for changes in editor content and sync to backend
 * Triggers whenever any line in the editor is modified
 */
watch(blocks, (newVal) => {
    console.log('Editor content changed, syncing to backend')

    // Send updated content to backend via SignalR
    connection.invoke("ReceiveMarkdown", newVal)
        .catch(err => console.error('Error syncing markdown:', err.toString()))
}, {deep: true}) // Deep watch to detect changes in array elements

// ==================== LIFECYCLE HOOKS ====================
/**
 * Component mounted lifecycle hook
 * Initializes all connections and sets up event listeners
 */
onMounted(async () => {
    console.log('Editor component mounted, initializing...')

    // Initialize backend connections
    await initializeSignalR()

    // Initialize terminal interface
    initializeTerminal()

    // Setup window resize handling for terminal
    window.addEventListener('resize', handleResize)
})

/**
 * Component unmount lifecycle hook
 * Cleanup resources and close connections
 */
onBeforeUnmount(() => {
    console.log('Editor component unmounting, cleaning up...')

    // Remove event listeners
    window.removeEventListener('resize', handleResize)

    // Cleanup terminal resources
    if (xterm) {
        xterm.dispose()
    }

    // Close SignalR connections gracefully
    connection.stop().catch(err => console.error('Error closing markdown connection:', err))
    terminalConnection.stop().catch(err => console.error('Error closing terminal connection:', err))
})
</script>

<template>
    <!-- Main application window container -->
    <div class="window">
        <div class="window-workspace">

            <!-- Left sidebar with tool icons -->
            <div class="tool-bar">
                <!-- General action icons (top section) -->
                <div class="general-action">
                    <div v-for="(item, index) in buttonsTop"
                         :key="index"
                         class="badge"
                         :class="{ active: activeIndexTop === index }"
                         @click="activeIndexTop = (activeIndexTop === index ? null : index)">
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>

                <!-- Code action icons (bottom section) -->
                <div class="code-action">
                    <div v-for="(item, index) in buttonsBottom"
                         :key="index"
                         class="badge"
                         :class="{ active: activeIndexBottom === index }"
                         @click="activeIndexBottom = (activeIndexBottom === index ? null : index)">
                        <span class="material-symbols-outlined">{{ item.icon }}</span>
                    </div>
                </div>
            </div>

            <!-- Main workspace content area -->
            <div class="workspace-wrapper">
                <div class="workspace">

                    <!-- File explorer sidebar -->
                    <div class="view-content" v-show="explorerVisible">
                        <div class="content-title-bar">
                            <div class="title-label">
                                <span>EXPLORER</span>
                            </div>
                            <div class="title-actions">
                                <div class="title-action">
                                    <span class="material-symbols-outlined">add</span>
                                </div>
                                <div class="title-action"
                                     @click="explorerVisible = false">
                                    <span class="material-symbols-outlined">collapse_content</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Main editor container -->
                    <div class="editor-container">

                        <!-- Tab bar for open files -->
                        <div class="tab-bar">
                            <div class="tab">
                                <span>Untitled</span>
                                <div class="tab-action">
                                    <span class="material-symbols-outlined">close</span>
                                </div>
                            </div>
                        </div>

                        <!-- Split editor view (code + preview) -->
                        <div class="editor">

                            <!-- Left side: Code editor -->
                            <div class="editor-main">
                                <!-- Line numbers column -->
                                <div class="line-numbers">
                                    <div
                                        class="line-number"
                                        v-for="(_, i) in blocks"
                                        :key="i"
                                    >
                                        <span>{{ i + 1 }}</span>
                                    </div>
                                </div>

                                <!-- Editor lines with textareas -->
                                <div class="editor-lines">
                                    <div
                                        class="line"
                                        v-for="(_, i) in blocks"
                                        :key="i"
                                    >
                                        <textarea
                                            ref="textareas"
                                            :id="'editor-textarea-' + i"
                                            v-model="blocks[i]"
                                            @input="onInput"
                                            @keydown.enter.prevent="newLine(i)"
                                            @keydown.delete="removeLine(i, $event)"
                                            placeholder="Type your markdown here..."
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Right side: Markdown preview -->
                            <div class="preview-main">
                                <div
                                    class="markdown-body"
                                    v-html="renderedHtml"
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom terminal panel -->
                <div class="terminal-container" v-show="activeIndexBottom === 1">
                    <div class="terminal-title-bar">
                        <div class="terminal-title">
                            <span>TERMINAL</span>
                        </div>
                    </div>
                    <div
                        id="terminal"
                        ref="terminal"
                    ></div>
                </div>
            </div>
        </div>

        <!-- Bottom status bar -->
        <div class="status-bar">
            <!-- Status information will be displayed here -->
        </div>
    </div>
</template>

<style scoped>
/* Component-specific styles */
/* Additional styling can be added here if needed beyond the global styles */
</style>