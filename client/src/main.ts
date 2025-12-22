import { createApp } from 'vue'
import './styles/style.css'
import 'material-symbols';
import App from './App.vue'

createApp(App).mount('#app').$nextTick(() => {
    window.ipcRenderer.on('main-process-message', (_event, message) => {
        console.log(message)
    })
})
