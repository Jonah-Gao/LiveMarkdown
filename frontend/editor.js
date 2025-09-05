// DOM Elements
const editorTextArea = document.getElementById('editor-textarea');
const wordCountElement = document.getElementById('word-count');
const charCountElement = document.getElementById('char-count');
const newFileBtn = document.getElementById('new-file');
const openFileBtn = document.getElementById('open-file');
const saveFileBtn = document.getElementById('save-file');
const boldBtn = document.getElementById('bold-btn');
const italicBtn = document.getElementById('italic-btn');
const underlineBtn = document.getElementById('underline-btn');
const cutBtn = document.getElementById('cut-btn');
const copyBtn = document.getElementById('copy-btn');
const pasteBtn = document.getElementById('paste-btn');

// Update word and character count
function updateCounts() {
    const text = editorTextArea.value;
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

    wordCountElement.textContent = `Words: ${wordCount}`;
    charCountElement.textContent = `Characters: ${charCount}`;
}

// Text editing functions
function formatText(command) {
    document.execCommand(command, false, null);
    editorTextArea.focus();
}

// Event Listeners
editorTextArea.addEventListener('input', updateCounts);

newFileBtn.addEventListener('click', () => {
    if (confirm('Create new document? Unsaved changes will be lost.')) {
        editorTextArea.value = '';
        updateCounts();
    }
});

boldBtn.addEventListener('click', () => formatText('bold'));
italicBtn.addEventListener('click', () => formatText('italic'));
underlineBtn.addEventListener('click', () => formatText('underline'));

cutBtn.addEventListener('click', () => {
    formatText('cut');
    updateCounts();
});

copyBtn.addEventListener('click', () => formatText('copy'));

pasteBtn.addEventListener('click', () => {
    formatText('paste');
    updateCounts();
});

// Initialize
updateCounts();

