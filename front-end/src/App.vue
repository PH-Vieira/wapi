<script setup>
import { useWebSocket } from './composables/useWebSocket'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import Workers from './components/workers.vue'
import Config from './components/config.vue'
import { useManagerStore } from './stores/manager'
import Temas from './components/temas.vue'
import { useColorsStore } from './stores/colors'

// const { isOpen, lastMsg, send } = useWebSocket('ws://localhost:3000')

const msgHist = ref([])
const chatBox = ref(HTMLElement)
const health = ref('')
const main_component = ref('Workers')
const managerStore = useManagerStore()
const colorsStore = useColorsStore()

// watch(lastMsg, async (newMsg, _lastMsg) => {
//   msgHist.value.push(newMsg)
//   await nextTick()
//   if (chatBox.value) {
//     chatBox.value.scrollTop = chatBox.value.scrollHeight
//   }
// })

async function health_check() {
  console.log('[INFO] checking api..')

  try {
    const res = await axios.get('http://localhost:3000')
    console.log(`[API] ${res?.data}`)
    res?.data ? health.value = 'ok' : health.value = 'not_ok'
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  }
}

onMounted(() => {
  health_check()
  managerStore.initSocket()
  managerStore.getSessions()
})
</script>

<template>
  <div class="text-white font-mono flex flex-col w-screen h-screen justify-center items-center gap-2 overflow-hidden"
    :style="{ backgroundColor: colorsStore.getActiveColor.from_400 }">
    <Temas class="z-444" />
    <div class="flex justify-center items-center gap-2 w-11/12 h-1/12">
      <p>WS: {{ managerStore.socket ? 'conectado' : 'desconectado' }}</p>

    </div>
    <div class="flex flex-col gap-2 items-center w-11/12 h-7/12 p-2">
      <component :is="main_component === 'Workers' ? Workers : Config" />
    </div>
  </div>
</template>
