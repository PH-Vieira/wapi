<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useManagerStore } from '../stores/manager'
import { User, Users } from 'lucide-vue-next'

const props = defineProps({
    session_id: String
})

const managerStore = useManagerStore()
const jid_selecionado = ref(null)
const chatContainer = ref(null)

watch(jid_selecionado, async () => {
    await nextTick()
    scrollToBottom()
})

const lista_chats = computed(() => {
    const sessaoData = managerStore.messagesByChat[props.session_id]
    return sessaoData ? Object.keys(sessaoData) : []
})

const mensagens_ativas = computed(() => {
    if (!jid_selecionado.value || !props.session_id) return []
    return managerStore.messagesByChat[props.session_id]?.[jid_selecionado.value] || []
})

const wallpapers = {
    '120363402362643675@g.us': 'w0.peakpx.com',
    'default': 'user-images.githubusercontent.com'
}

const wallpaperAtivo = computed(() => wallpapers[jid_selecionado.value] || wallpapers.default)

const lista_chats_detalhada = computed(() => {
    const sessaoData = managerStore.messagesByChat[props.session_id] || {}
    return Object.keys(sessaoData).map(jid => {
        const msgs = sessaoData[jid]
        const ultimaMsg = msgs[msgs.length - 1]
        return {
            jid,
            nome: ultimaMsg?.chatName || jid.split('@')[0],
            ultimaMensagem: ultimaMsg?.text === '[sem texto]' ? '📷 Mídia' : ultimaMsg?.text,
            horario: ultimaMsg ? new Date(ultimaMsg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        }
    })
})

const processarMensagens = computed(() => {
    const raw = managerStore.messagesByChat[props.session_id]?.[jid_selecionado.value] || []

    const mapaReacoes = raw.reduce((acc, msg) => {
        if (msg.text.startsWith('[reaction]')) {
            const emoji = msg.text.match(/emoji=([^ ]+)/)?.[1]
            const targetId = msg.text.match(/targetKeyId=([^ ]+)/)?.[1]
            if (targetId && emoji) {
                if (!acc[targetId]) acc[targetId] = {}
                acc[targetId][msg.pushName] = emoji
            }
        }
        return acc
    }, {})

    return raw
        .filter(msg => !msg.text.startsWith('[reaction]'))
        .map(msg => ({
            ...msg,
            reacoes: mapaReacoes[msg.id] || null
        }))
})

watch(mensagens_ativas, async () => {
    if (!chatContainer.value) return

    const { scrollTop, scrollHeight, clientHeight } = chatContainer.value
    const estaNoFinal = scrollHeight - scrollTop - clientHeight < 100

    await nextTick()

    if (estaNoFinal) {
        scrollToBottom()
    }
}, { deep: true })

const formatarNome = (jid) => {
    return jid.includes('@g.us') ? 'Grupo' : jid.split('@')[0]
}

const scrollToBottom = () => {
    if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
}

const novoTexto = ref('')

const enviarMensagem = async () => {
    if (!novoTexto.value.trim() || !jid_selecionado.value) return

    const textoParaEnviar = novoTexto.value
    novoTexto.value = '' // Limpa o campo imediatamente

    const sucesso = await managerStore.sendMessage(
        props.session_id,
        jid_selecionado.value,
        textoParaEnviar
    )

    if (sucesso) {
        await nextTick()
        scrollToBottom()
    }
}

// Handler para o Enter
const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        enviarMensagem()
    }
}
</script>

<template>
    <div class="flex h-[80vh] w-full bg-emerald-950 rounded-xl overflow-hidden border border-emerald-800 shadow-2xl">

        <!-- Sidebar Refinada -->
        <aside class="w-1/3 border-r border-emerald-800 bg-emerald-900 overflow-y-auto overflow-x-hidden">
            <div
                class="p-4 border-b border-emerald-800 font-bold text-emerald-400 bg-emerald-900/50 sticky top-0 z-10 backdrop-blur-md">
                Conversas
            </div>

            <div v-for="chat in lista_chats_detalhada" :key="chat.jid" @click="jid_selecionado = chat.jid"
                :class="['p-3 flex items-center gap-3 cursor-pointer border-b border-emerald-800/50 transition-all',
                    jid_selecionado === chat.jid ? 'bg-pink-700/40 border-l-4 border-l-pink-500' : 'hover:bg-emerald-800/50']">

                <div class="p-2 bg-emerald-800 rounded-full text-emerald-400 shrink-0">
                    <component :is="chat.jid.includes('@g.us') ? Users : User" :size="24" />
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <p class="text-sm font-bold text-white truncate pr-2">{{ chat.nome }}</p>
                        <span class="text-[10px] text-emerald-500 shrink-0">{{ chat.horario }}</span>
                    </div>
                    <p class="text-xs text-emerald-400/70 truncate italic">
                        {{ chat.ultimaMensagem }}
                    </p>
                </div>
            </div>
        </aside>

        <!-- Main Chat com Wallpaper -->
        <main class="flex-1 flex flex-col relative bg-[#0b141a]">
            <template v-if="jid_selecionado">
                <!-- Header -->
                <div class="p-3 bg-emerald-900 border-b border-emerald-800 flex items-center gap-3 z-10 shadow-lg">
                    <div class="text-emerald-400">
                        <component :is="jid_selecionado.includes('@g.us') ? Users : User" />
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-white text-sm">{{ jid_selecionado }}</span>
                        <span class="text-[10px] text-emerald-400 uppercase tracking-widest">Online</span>
                    </div>
                </div>

                <!-- Container de Mensagens com Background -->
                <div ref="chatContainer" class="flex-1 overflow-y-auto p-6 flex flex-col gap-3 relative scroll-smooth"
                    :style="{
                        backgroundImage: `linear-gradient(rgba(11, 20, 26, 0.9), rgba(11, 20, 26, 0.9)), url(${wallpaperAtivo})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                    }">

                    <div v-for="msg in processarMensagens" :key="msg.id"
                        :class="['max-w-[75%] p-2.5 rounded-lg text-sm shadow-md relative mb-2 break-words transition-all hover:shadow-lg',
                            msg.fromMe ? 'bg-pink-600 self-end rounded-tr-none text-white' : 'bg-[#202c33] self-start rounded-tl-none text-gray-100 border border-white/5']">

                        <p v-if="jid_selecionado.includes('@g.us') && !msg.fromMe"
                            class="text-[10px] font-black text-pink-400 mb-1 flex items-center gap-1">
                            ~ {{ msg.pushName || 'Contato' }}
                        </p>

                        <div v-if="msg.url" class="mb-2 rounded overflow-hidden border border-black/20">
                            <img :src="msg.url" class="w-full max-h-64 object-contain bg-black/5" />
                        </div>

                        <p v-if="msg.text !== '[sem texto]'" class="leading-relaxed">{{ msg.text }}</p>

                        <div class="flex justify-end items-center gap-1 mt-1 opacity-60">
                            <span class="text-[9px]">{{ new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                                hour:
                                    '2-digit', minute: '2-digit'
                            }) }}</span>
                        </div>

                        <!-- Reações -->
                        <div v-if="msg.reacoes" class="absolute -bottom-3 left-1 flex flex-wrap gap-1 z-20">
                            <div v-for="(emoji, autor) in msg.reacoes" :key="autor" :title="autor"
                                class="bg-[#1f2c33] border border-white/10 rounded-full px-1.5 py-0.5 text-[11px] shadow-xl hover:scale-125 transition-transform cursor-help">
                                {{ emoji }}
                            </div>
                        </div>
                    </div>

                </div>
                <footer class="p-4 bg-emerald-900 border-t border-emerald-800 flex items-center gap-3 z-30">
                    <textarea v-model="novoTexto" @keydown="handleKeyPress" placeholder="Digite uma mensagem..."
                        class="flex-1 bg-[#2a3942] text-white text-sm rounded-lg p-3 outline-none resize-none overflow-hidden border border-transparent focus:border-emerald-500 transition-all"
                        rows="1"></textarea>

                    <button @click="enviarMensagem" :disabled="!novoTexto.trim()"
                        class="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 p-3 rounded-full text-white transition-all shadow-lg flex-shrink-0">
                        <svg xmlns="www.w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </footer>
            </template>

            <!-- Empty State -->
            <div v-else class="flex-1 flex flex-col items-center justify-center bg-[#0b141a] text-emerald-800/40">
                <div
                    class="w-24 h-24 mb-4 border-4 border-emerald-900/30 rounded-full flex items-center justify-center">
                    <User :size="48" />
                </div>
                <p class="italic font-medium">Selecione uma conversa para começar</p>
            </div>
        </main>
    </div>
</template>

<style scoped>
::-webkit-scrollbar {
    width: 6px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: #064e3b;
    border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
    background: #065f46;
}
</style>
