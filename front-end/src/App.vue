<script setup>
import { useWebSocket } from './composables/useWebSocket'
import { useManagerStore } from './stores/manager'
import { onMounted, ref, watch } from 'vue'
import axios from 'axios'

const { isOpen, lastMsg, send } = useWebSocket('ws://localhost:3000')
// function criarSessao() {
//   send({ type: 'createSession', sessionId: 'abc' })
// }

const managerStore = useManagerStore()

const health = ref('')
const qr = ref(null)
const intervals = new Map()

const new_session_name = ref('')
const sessions = ref([])
const sessionsInfo = ref({})

watch(sessions, (newSessions, oldSessions) => {
  newSessions != '' ? console.log(`new session ${newSessions}`) : ''
  const newIds = newSessions.map(s => s)
  const oldIds = oldSessions?.map(s => s) || []

  newIds.forEach(id => {
    if (!oldIds.includes(id)) {
      const interval = setInterval(() => {
        console.log(`[INFO] checking ${id}`)
        get_session_info(id)
      }, 5000)
      intervals.set(id, interval)
    }
  })
  oldIds.forEach(id => {
    if (!newIds.includes(id)) {
      clearInterval(intervals.get(id))
      intervals.delete(id)
    }
  })
})

function checkManager() {
  console.log('[APP] Checking manager')
  managerStore.getManager()
}

async function fetchQR(sessionId) {
  try {
    console.log(`[INFO] Fetching QR code for session ${sessionId}`)
    const { data } = await axios.get(`http://localhost:3000/sessions/${sessionId}/qr`)
    if (data) qr.value = data.qr
    else console.log('[INFO] No QR code')
  } catch (err) {
    console.log(`[ERROR] Erro: ${err}`)
  }
}

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

async function check_sessions() {
  console.log('[INFO] checking sessions..')
  let res
  try {
    res = await axios.get('http://localhost:3000/sessions')
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  } finally {
    res?.data ? sessions.value = res.data.ids : ''
  }
}

async function create_session(sessionId) {
  if (new_session_name.value === '') { console.log(new_session_name.value); return }
  console.log(`[INFO] creating session ${sessionId}`)
  try {
    const res = await axios.post(`http://localhost:3000/sessions`, {
      sessionId: new_session_name.value
    })
    console.log(res?.data)
  } catch (err) {
    console.log(`[ERROR] ${err?.message}`)
  } finally {
    check_sessions()
  }
}

async function get_session_info(sessionId) {
  console.log('[INFO] getting session info')
  try {
    const { data } = await axios.get(`http://localhost:3000/sessions/${sessionId}`)
    console.log(`[DEBUG] ${JSON.stringify(data)}`)
    sessionsInfo.value[sessionId] = data
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  }
}

async function connect(sessionId) {
  console.log('[INFO] connecting..')
  try {
    const res = await axios.post(`http://localhost:3000/sessions/${sessionId}`)
    console.log(`[INFO] ${res?.data}`)
  } catch (err) {
    console.log(`[ERROR] ${err?.message}`)
  } finally {
    get_session_info(sessionId)
    setTimeout(() => {
      fetchQR(sessionId)
    }, 3000);
  }
}

async function disconnect(sessionId) {
  console.log('[INFO] disconnecting..')
  try {
    const res = await axios.delete(`http://localhost:3000/sessions/${sessionId}`)
    console.log(`[INFO] ${res?.data}`)
  } catch (err) {
    console.log(`[ERROR] ${err?.message}`)
  } finally {
    get_session_info(sessionId)
  }
}

onMounted(() => {
  health_check()
  // checkManager()
  // setInterval(() => {
  //   checkManager()
  // }, 3000);
  // check_sessions()
  // fetchQR('default')
})

</script>

<template>
  <div
    class="bg-emerald-900 text-white font-mono flex flex-col w-screen h-screen justify-center items-center gap-2 border overflow-hidden">
    <div class="flex justify-center items-center gap-2 w-11/12 h-1/12 border">
      <table class="border-separate text-center">
        <thead class="bg-slate-600">
          <tr>
            <th class="border rounded p-1">{{ managerStore.manager.status }}</th>
            <th class="border rounded p-1">Health</th>
            <th class="border rounded p-1">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-slate-700">
          <tr>
            <td class="border rounded p-1">Manager</td>
            <td class="border rounded p-1">{{ managerStore.manager.status }}</td>
            <td class="border rounded p-1">
              <button @click="managerStore.createManager()" v-if="managerStore.manager.status != 'running'"
                class="border rounded px-1 mx-1 bg-emerald-500 cursor-pointer" type="button">Start</button>
              <button @click="managerStore.stopManager()" v-if="managerStore.manager.status == 'running'"
                class="border rounded px-1 mx-1 bg-red-500 cursor-pointer" type="button">Stop</button>
              <button @click="checkManager()" class="border rounded px-1 mx-1 bg-sky-500 cursor-pointer"
                type="button">Check</button>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- <button type="button" @click="health_check"
        class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer"
        :class="health != '' ? (health == 'ok' ? 'bg-emerald-600' : 'bg-rose-600') : 'bg-slate-600'">Health
        check</button>
      <button type="button" @click="check_sessions"
        class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600">Check
        Sessions</button>
      <button type="button" @click="create_session(new_session_name)"
        class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600">Create
        session</button>
      <input v-model="new_session_name" type="text" class="border rounded-md px-2 py-1 bg-slate-600"
        placeholder="Session Name"> -->
    </div>
    <div class="flex flex-col gap-2 items-end w-11/12 h-7/12 border">
      <div v-for="session in sessions" class="flex gap-2">
        <button @click="get_session_info(session)"
          class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer max-h-12"
          :class="sessionsInfo[session]?.connected ? 'bg-emerald-600' : 'bg-red-600'">{{
            session }}</button>
        <button @click="connect(session)" v-if="!sessionsInfo[session]?.connected"
          class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600 max-h-12">Conectar</button>
        <img v-if="qr && sessionsInfo[session]?.info?.hasQR" :src="qr" class="w-96 h-96 rounded">
        <button @click="disconnect(session)" v-if="!!sessionsInfo[session]?.connected"
          class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600 max-h-12">Disconectar</button>
      </div>
      <img v-if="lastMsg?.qr" class="w-96 rounded-xl" :src="lastMsg.qr">
    </div>
    <div class="flex flex-col w-11/12 h-1/12 border">
      <p>WS: {{ isOpen ? 'conectado' : 'desconectado' }}</p>
      <pre v-if="lastMsg">{{ lastMsg }}</pre>
      <button @click="criarSessao">Criar sessão</button>
    </div>
  </div>
</template>
