<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useManagerStore } from '../stores/manager'
import { User, Users, Send } from 'lucide-vue-next'
import img_modal from './img_modal.vue'

const props = defineProps({
    session_id: String
})

const managerStore = useManagerStore()
const jid_selecionado = ref(null)
const nome_chat_ativo = ref(null)
const img_selecionada = ref(null)
const chatContainer = ref(null)
const isGravando = ref(false);
const mediaRecorder = ref(null);
const audioChunks = ref([]);

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
            nome: String(ultimaMsg?.chatName).endsWith('@lid') ? ultimaMsg?.pushName : (ultimaMsg?.chatName || '[Chat]'),
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

// 1. Enviar Arquivo (Imagem/Áudio pronto)
const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        await managerStore.sendMessage(props.session_id, jid_selecionado.value, '', reader.result, file.type);
    };
    reader.readAsDataURL(file);
};

// 2. Gravar Áudio
const toggleGravacao = async () => {
    if (!isGravando.value) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder.value = new MediaRecorder(stream);
        audioChunks.value = [];

        mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
        mediaRecorder.value.onstop = async () => {
            const blob = new Blob(audioChunks.value, { type: 'audio/ogg; codecs=opus' });
            const reader = new FileReader();
            reader.onloadend = () => {
                managerStore.sendMessage(props.session_id, jid_selecionado.value, '', reader.result, 'audio/ogg', true);
            };
            reader.readAsDataURL(blob);
        };

        mediaRecorder.value.start();
        isGravando.value = true;
    } else {
        mediaRecorder.value.stop();
        isGravando.value = false;
    }
};
</script>

<template>
    <div class="flex h-[80vh] w-full bg-sky-950 rounded-xl overflow-hidden border border-sky-800 shadow-2xl">

        <!-- Sidebar Refinada -->
        <aside class="w-1/4 border-r border-sky-800 bg-sky-900 overflow-y-auto overflow-x-hidden">
            <div
                class="p-4 border-b border-sky-800 font-bold text-sky-400 bg-sky-900/50 sticky top-0 z-10 backdrop-blur-md">
                Conversas
            </div>

            <div v-for="chat in lista_chats_detalhada" :key="chat.jid"
                @click="jid_selecionado = chat.jid; nome_chat_ativo = chat.nome"
                :class="['p-3 flex items-center gap-3 cursor-pointer border-b border-sky-800/50 transition-all',
                    jid_selecionado === chat.jid ? 'bg-yellow-700/40 border-l-4 border-l-yellow-500' : 'hover:bg-sky-800/50']">

                <div class="p-2 bg-sky-800 rounded-full text-sky-400 shrink-0">
                    <component :is="chat.jid.includes('@g.us') ? Users : User" :size="24" />
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <p class="text-sm font-bold text-white truncate pr-2">{{ chat.nome }}</p>
                        <span class="text-[10px] text-sky-500 shrink-0">{{ chat.horario }}</span>
                    </div>
                    <p class="text-xs text-sky-400/70 truncate italic">
                        {{ chat.ultimaMensagem }}
                    </p>
                </div>
            </div>
        </aside>

        <!-- Main Chat com Wallpaper -->
        <main class="flex-1 flex flex-col relative bg-[#0b141a] min-w-0">
            <template v-if="jid_selecionado">
                <!-- Header -->
                <div class="p-3 bg-sky-900 border-b border-sky-800 flex items-center gap-3 z-10 shadow-lg">
                    <div class="text-sky-400">
                        <component :is="jid_selecionado.includes('@g.us') ? Users : User" />
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-white text-sm">{{ nome_chat_ativo }}</span>
                        <span class="text-[10px] text-sky-400 uppercase tracking-widest">Online (em
                            implementacao)</span>
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
                            msg.fromMe ? 'bg-yellow-600 self-end rounded-tr-none text-white' : 'bg-[#202c33] self-start rounded-tl-none text-gray-100 border border-white/5']">

                        <p v-if="jid_selecionado.includes('@g.us') && !msg.fromMe"
                            class="text-[11px] font-black text-yellow-400 mb-1 flex items-center gap-1">
                            ~ {{ msg.pushName || 'Contato' }}
                        </p>

                        <!-- Renderização de FIGURINHA/IMAGEM -->
                        <div v-if="msg.url && msg.mimetype?.includes('image')" class="my-2">
                            <img @click="img_selecionada = msg.url" :src="msg.url"
                                class="cursor-pointer hover:outline-1 outline-offset-4 w-40 h-40 object-contain rounded-lg shadow-inner bg-black/10" />
                        </div>

                        <!-- Renderização de ÁUDIO -->
                        <div v-if="msg.url && msg.mimetype?.includes('audio')" class="my-2 min-w-50">
                            <audio controls class="w-full h-8 accent-yellow-500 rounded-lg shadow-sm">
                                <source :src="msg.url" :type="msg.mimetype">
                            </audio>
                        </div>

                        <!-- Renderização de TEXTO (caso não seja apenas mídia) -->
                        <p v-if="msg.text !== '[sem texto]'" class="whitespace-pre-wrap break-words leading-relaxed">{{
                            msg.text }}</p>

                        <div class="flex justify-end items-center gap-1 mt-1 opacity-60">
                            <span class="text-[10px]">{{ new Date(msg.timestamp * 1000).toLocaleTimeString([], {
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
                <footer class="p-4 bg-sky-900 border-t border-sky-800 flex items-center gap-3 z-30">
                    <!-- botao de enviar arquivo -->
                    <!-- <label class="cursor-pointer text-sky-400 hover:text-white p-2">
                        <input type="file" class="hidden" @change="handleFileUpload" accept="image/*,audio/*" />
                        <svg xmlns="www.w3.org" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path
                                d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                    </label> -->

                    <!-- input de texto -->
                    <textarea v-model="novoTexto" @keydown="handleKeyPress" placeholder="Digite uma mensagem..."
                        class="flex-1 bg-[#2a3942] text-white text-sm rounded-lg p-3 outline-none resize-none overflow-hidden border border-transparent focus:border-sky-500 transition-all"
                        rows="1"></textarea>

                    <!-- botao de enviar audio -->
                    <!-- <button @click="novoTexto.trim() ? enviarMensagem() : toggleGravacao()"
                        :class="['p-3 rounded-full text-white transition-all', isGravando ? 'bg-red-600 animate-pulse' : 'bg-yellow-600']">
                        <svg v-if="!novoTexto.trim()" xmlns="www.w3.org" width="20" height="20" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="22" />
                        </svg>
                        <svg v-else xmlns="www.w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button> -->

                    <!-- botao de enviar mensagem -->
                    <button @click="enviarMensagem" :disabled="!novoTexto.trim()"
                        class="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 p-3 rounded-full text-white transition-all shadow-lg shrink-0">
                        <!-- <svg xmlns="www.w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg> -->
                        <Send :size="26" />
                    </button>
                </footer>
            </template>

            <!-- Empty State -->
            <div v-else class="flex-1 flex flex-col items-center justify-center bg-[#0b141a] text-sky-800/40">
                <div class="w-24 h-24 mb-4 border-4 border-sky-900/30 rounded-full flex items-center justify-center">
                    <User :size="48" />
                </div>
                <p class="italic font-medium">Selecione uma conversa para começar</p>
            </div>
        </main>
        <Teleport to="body">
            <div v-if="img_selecionada" @click="img_selecionada = null"
                class="fixed inset-0 bg-black/80 flex items-center justify-center z-999 p-4">
                <img_modal @click.stop :img="img_selecionada" class="max-w-full max-h-full" />
            </div>
        </Teleport>
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
