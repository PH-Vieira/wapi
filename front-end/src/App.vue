<script setup>
import axios from 'axios'
import { onMounted, ref } from 'vue'

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

async function check_sessions() {
  console.log('[INFO] checking sessions..')
  let res
  try {
    res = await axios.get('http://localhost:3000/sessions')
    console.log(res?.data)
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  } finally {
    res?.data ? sessions.value = res.data.ids : ''
  }
}

onMounted(() => {
  check_sessions()
})

async function create_session(sessionId) {
  if (new_session_name.value === '') return
  console.log(`[INFO] creating session ${sessionId}`)
  try {
    const res = await axios.post('http://localhost:3000/sessions', {
      "sessionId": sessionId
    })
    console.log(res?.data)
  } catch (err) {
    console.log(`[ERROR] ${err}`)
  } finally {
    check_sessions()
  }
}

const new_session_name = ref('')
const sessions = ref([])

</script>

<template>
  <div class="bg-emerald-900 text-white font-mono flex flex-col w-screen h-screen justify-center items-center">
    <div class="flex justify-center items-center gap-2">
      <button type="button" @click="health_check" class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer"
        :class="health != '' ? (health == 'ok' ? 'bg-emerald-600' : 'bg-rose-600') : 'bg-slate-600'">Health
        check</button>
      <button type="button" @click="check_sessions"
        class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600">Check Sessions</button>
      <button type="button" @click="create_session(new_session_name)"
        class="hover:border-sky-500 border rounded-md px-2 py-1 transition-colors cursor-pointer bg-slate-600">Create session</button>
      <input v-model="new_session_name" type="text" class="border rounded-md px-2 py-1 bg-slate-600"
        placeholder="Session Name">
    </div>
    <pre>
      {{ sessions }}
    </pre>
  </div>
</template>
