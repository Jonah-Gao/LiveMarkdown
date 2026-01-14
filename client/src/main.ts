import { createApp } from 'vue'
import {createPinia} from 'pinia'
import './styles/style.css'
import 'material-symbols';
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())

app.mount('#app').$nextTick(() => {
    window.ipcRenderer.on('main-process-message', (_event, message) => {
        console.log(message)
    })
})
