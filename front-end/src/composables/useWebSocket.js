import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useWebSocket(url) {
    const ws = ref(null)
    const isOpen = ref(false)
    const lastMsg = ref(null)

    const connect = () => {
        ws.value = new WebSocket(url)
        ws.value.onopen = () => { isOpen.value = true }
        ws.value.onmessage = (ev) => { lastMsg.value = JSON.parse(ev.data) }
        ws.value.onclose = () => { isOpen.value = false }
        ws.value.onerror = (err) => { console.error('[WS] error', err) }
    }

    const send = (obj) => {
        if (ws.value && isOpen.value) ws.value.send(JSON.stringify(obj))
    }

    onMounted(connect)
    onBeforeUnmount(() => ws.value?.close())

    return { isOpen, lastMsg, send }
}