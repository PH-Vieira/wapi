<script setup>
import { useWebSocket } from './composables/useWebSocket'
import { nextTick, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import Workers from './components/workers.vue'
import Config from './components/config.vue'
import { useManagerStore } from './stores/manager'
import { useCatsStore } from './stores/cats'

const { isOpen, lastMsg, send } = useWebSocket('ws://localhost:3000')
// function criarSessao() {
//   send({ type: 'createSession', sessionId: 'abc' })
// }

const msgHist = ref([])
const chatBox = ref(HTMLElement)
const health = ref('')
const main_component = ref('Workers')
const managerStore = useManagerStore()
const catsStore = useCatsStore()

watch(lastMsg, async (newMsg, _lastMsg) => {
  msgHist.value.push(newMsg)
  await nextTick()
  if (chatBox.value) {
    chatBox.value.scrollTop = chatBox.value.scrollHeight
  }
})

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
  managerStore.getSessions()
})

</script>

<template>
  <div
    class="bg-emerald-900 text-white font-mono flex flex-col w-screen h-screen justify-center items-center gap-2 border overflow-hidden">
    <div class="flex justify-center items-center gap-2 w-11/12 h-1/12 border">
      <p>WS: {{ isOpen ? 'conectado' : 'desconectado' }}</p>

    </div>
    <div class="flex flex-col gap-2 items-center w-11/12 h-7/12 border p-2">
      <component :is="main_component === 'Workers' ? Workers : Config" />
      <!-- <div ref="chatBox" class="flex flex-col w-full max-h-[90%] overflow-auto">
        <div v-for="msg in msgHist" class="flex content-start items-start text-left w-full">
          <p>{{ `${msg.senderPushName}: ${msg.messageKeys?.audioMessage ? 'audio' : msg.messageKeys?.reactionMessage ?
            'reaction' : msg.messageKeys?.stickerMessage ?
              'sticker' : msg.messageKeys?.imageMessage ? 'imagem' : msg.messageText}` }}</p>
        </div>
      </div> -->
      <!-- <img v-if="lastMsg?.qr" class="w-96" :src="lastMsg.qr"> -->
    </div>
    <div class="flex flex-row gap-2 justify-center items-center w-11/12 h-1/12 border">
      <button @click="main_component = 'Workers'"
        class="border px-2 py-1 rounded-md bg-emerald-700 transition-colors hover:bg-emerald-500 cursor-pointer"
        type="button">Workers</button>
      <button @click="main_component = 'Config'"
        class="border px-2 py-1 rounded-md bg-emerald-700 transition-colors hover:bg-emerald-500 cursor-pointer"
        type="button">Config</button>
    </div>
  </div>
</template>
