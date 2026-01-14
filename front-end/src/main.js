import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import Toast from 'vue-toastification'
import "vue-toastification/dist/index.css";

const pinia = createPinia()

createApp(App).use(Toast, { position: "bottom-right", timeout: 2500 }).use(pinia).mount('#app')
