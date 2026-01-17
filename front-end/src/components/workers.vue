<script setup>
import { useManagerStore } from '../stores/manager'
import { Loader2 } from 'lucide-vue-next'
import Chat_modal from './chat_modal.vue'
import Qr_modal from './qr_modal.vue'
import { ref, watch } from 'vue'
import { useColorsStore } from '../stores/colors'

const managerStore = useManagerStore()
const id_selecionado = ref(null) // QR
const chat_sessao_id = ref(null) // chat
const new_session_name = ref('')
const colorsStore = useColorsStore()

const togglePooling = (id) => {
    if (managerStore.pooling_intervals[id]) {
        managerStore.stopPooling(id)
    } else {
        managerStore.startPooling(id)
    }
}

const create_new_session = () => {
    if (new_session_name == '') { alert('Insira um nome na sessao') }
    managerStore.create_session(new_session_name.value)
    new_session_name.value = ''
}

watch(() => managerStore.sessions, (novasSessões) => {
    novasSessões.forEach(s => {
        if (s.status === 'close') {
            if (id_selecionado.value === s.id) id_selecionado.value = null
            if (chat_sessao_id.value === s.id) chat_sessao_id.value = null
        }
    });
}, { deep: true })
</script>

<template>
    <div class="rounded-md flex flex-col items-center justify-center w-full h-full p-4 overflow-auto"
        :style="{ backgroundColor: colorsStore.getActiveColor.from_700 }">
        <ul class="flex flex-col w-full max-w-4xl rounded-lg">
            <li class="rounded-lg my-2 px-4 py-3 flex items-center gap-4 text-white cursor-pointer hover:outline-1 outline-offset-3"
                :style="{ backgroundColor: session.status === 'open' ? colorsStore.getActiveColor.to_600 : colorsStore.getActiveColor.to_700 }"
                v-for="session in managerStore.sessions" :key="session.id"
                @click="session.status === 'open' ? chat_sessao_id = session.id : null">

                <p class="wrap-break-word max-w-[25%]">{{ Object.keys(session) }}</p>

                <!-- Gato do Status HTTP -->
                <!-- <div class="w-32 h-32 shrink-0 bg-slate-800 rounded border border-slate-600">
                    <img :src="`https://http.cat/${session.httpStatus || 404}`" :alt="`Status ${session.httpStatus}`"
                        class="w-full h-full object-cover" />
                </div> -->

                <div class="grow">
                    <div class="font-bold"
                    :style="{ color: colorsStore.getActiveColor.from_300 }">{{ session.id }}</div>
                    <div class="text-xs uppercase opacity-70">Status: {{ managerStore.getSessionInfo(session.id).status }}</div>
                    <!-- <div class="text-xs font-mono">HTTP: {{ session.httpStatus || '---' }}</div> -->
                </div>

                <!-- botoes de controle -->
                <div class="flex gap-2">
                    <!-- <button @click.stop="togglePooling(session.id)" :class="[
                        'cursor-pointer px-3 py-1 rounded transition-colors bg-emerald-500 hover:bg-emerald-400 outline-offset-2 outline-emerald-500 hover:outline-1'
                    ]">
                        {{ managerStore.pooling_intervals[session.id] ? 'Parar' : 'Monitorar' }}
                    </button> -->

                    <button v-if="managerStore.getSessionInfo(session.id).status != 'open'"
                        @click.stop="managerStore.conectar(session.id)"
                        :disabled="managerStore.getSessionInfo(session.id).status == 'connecting'"
                        class="cursor-pointer px-3 py-1 bg-sky-500  hover:bg-sky-400 outline-sky-500 outline-offset-2 hover:outline-1 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <!-- Ícone de Loading com animação animate-spin -->
                        <Loader2 v-if="managerStore.getSessionInfo(session.id).status == 'connecting'"
                            class="cursor-pointer w-4 h-4 animate-spin" />
                        <span>{{ managerStore.getSessionInfo(session.id).status !== 'open' && !!managerStore.getSessionInfo(session.id).qrCode ? 'Conectando...' : 'Conectar' }}</span>
                    </button>

                    <!-- QR Code Modal ou Miniatura -->
                    <div v-if="managerStore.getSessionInfo(session.id).qrCode && managerStore.getSessionInfo(session.id).status != 'open'" @click.stop="id_selecionado = session.id"
                        class="cursor-pointer text-black bg-white p-2 rounded shadow-lg">
                        <p>Clique para ver o QR!</p>
                    </div>

                    <button @click.stop="managerStore.desconectar(session.id)"
                        class="cursor-pointer px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 outline-amber-500 outline-offset-2 hover:outline-1"
                        type="button">
                        Desconectar
                    </button>

                    <button @click.stop="managerStore.excluir(session.id)"
                        class="cursor-pointer px-3 py-1 rounded bg-red-500 hover:bg-red-400 outline-red-500 outline-offset-2 hover:outline-1" type="button">
                        Excluir
                    </button>
                </div>
            </li>
        </ul>
        <div>
            <form @submit.prevent="create_new_session">
                <input v-model="new_session_name" class="px-3 py-1 rounded-md mx-1 focus:outline-1 outline-white outline-offset-2" :style="{ backgroundColor: colorsStore.getActiveColor.to_700 }" type="text"
                    placeholder="Nome da sessão" required>
                <button class="cursor-pointer px-3 py-1 rounded-md" type="submit" :style="{ backgroundColor: colorsStore.getActiveColor.from_800 }">
                    Adicionar sessão
                </button>
            </form>
        </div>
        <Teleport to="body">
            <div v-if="chat_sessao_id" class="fixed inset-0 bg-black/80 flex items-center justify-center z-111 p-4"
                @click="chat_sessao_id = null">
                <div class="w-full max-w-7xl h-[80vh] shadow-2xl overflow-hidden rounded-2xl" @click.stop>
                    <Chat_modal :session_id="chat_sessao_id" @close="chat_sessao_id = null" />
                </div>
            </div>
        </Teleport>
        <Teleport to="body">
            <div v-if="id_selecionado && managerStore.getSessionInfo(id_selecionado).status != 'open'" class="fixed inset-0 bg-black/80 flex items-center justify-center z-222 p-4"
                @click="id_selecionado = null">
                <Qr_modal @click.stop :session_id="id_selecionado" />
            </div>
        </Teleport>
    </div>
</template>
