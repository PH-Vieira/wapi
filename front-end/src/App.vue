<script setup>
import { useWebSocket } from './composables/useWebSocket'
import { nextTick, onMounted, ref, watch } from 'vue'
import axios from 'axios'

const { isOpen, lastMsg, send } = useWebSocket('ws://localhost:3000')
// function criarSessao() {
//   send({ type: 'createSession', sessionId: 'abc' })
// }

const msgHist = ref([])
const chatBox = ref(HTMLElement)

watch(lastMsg, async (newMsg, _lastMsg) => {
  msgHist.value.push(newMsg)
  await nextTick()
  if (chatBox.value) {
    chatBox.value.scrollTop = chatBox.value.scrollHeight
  }
})

const health = ref('')

async function health_check() {
  console.log('[INFO] checking api..')

  try {
    const res = await axios.get('http://localhost:3000')
    console.log(res?.data)
    res?.data ? health.value = 'ok' : health.value = 'not_ok'
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  }
}

onMounted(() => {
  health_check()
})

</script>

<template>
  <div
    class="bg-emerald-900 text-white font-mono flex flex-col w-screen h-screen justify-center items-center gap-2 border overflow-hidden">
    <div class="flex justify-center items-center gap-2 w-11/12 h-1/12 border">

    </div>
    <div class="flex flex-col gap-2 items-center w-11/12 h-7/12 border">
      <p>WS: {{ isOpen ? 'conectado' : 'desconectado' }}</p>
      <div ref="chatBox" class="flex flex-col w-full max-h-[90%] overflow-auto">
        <div v-for="msg in msgHist" class="flex content-start items-start text-left w-full">
          <p>{{ `${msg.senderPushName}: ${msg.messageKeys?.audioMessage ? 'audio' : msg.messageKeys?.reactionMessage ? 'reaction' : msg.messageKeys?.stickerMessage ?
            'sticker' : msg.messageKeys?.imageMessage ? 'imagem' : msg.messageText}` }}</p>
        </div>
      </div>
      <img v-if="lastMsg?.qr" class="w-96" :src="lastMsg.qr">
    </div>
    <div class="flex flex-col w-11/12 h-1/12 border">

    </div>
  </div>
</template>
