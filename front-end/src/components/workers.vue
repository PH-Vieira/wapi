<script setup>
import { useManagerStore } from '../stores/manager'
import { Loader2 } from 'lucide-vue-next'
import Chat_modal from './chat_modal.vue'
import Qr_modal from './qr_modal.vue'
import { ref, watch } from 'vue'

const managerStore = useManagerStore()
const id_selecionado = ref(null) // QR
const chat_sessao_id = ref(null) // chat
const new_session_name = ref('')

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
    <div class="bg-emerald-700 rounded-md flex flex-col items-center justify-center w-full h-full p-4 overflow-auto">
        <ul class="flex flex-col w-full max-w-4xl rounded-lg">
            <li class="bg-pink-700 rounded-lg my-2 px-4 py-3 flex items-center gap-4 text-white cursor-pointer hover:outline-1 outline-offset-3"
                v-for="session in managerStore.sessions" :key="session.id"
                @click="session.status === 'open' ? chat_sessao_id = session.id : null">

                <!-- Gato do Status HTTP -->
                <!-- <div class="w-32 h-32 shrink-0 bg-slate-800 rounded border border-slate-600">
                    <img :src="`https://http.cat/${session.httpStatus || 404}`" :alt="`Status ${session.httpStatus}`"
                        class="w-full h-full object-cover" />
                </div> -->

                <div class="grow">
                    <div class="font-bold text-emerald-400">{{ session.id }}</div>
                    <div class="text-xs uppercase opacity-70">Status: {{ session.status }}</div>
                    <!-- <div class="text-xs font-mono">HTTP: {{ session.httpStatus || '---' }}</div> -->
                </div>

                <!-- Botões de Controle -->
                <div class="flex gap-2">
                    <button @click.stop="togglePooling(session.id)" :class="[
                        'cursor-pointer px-3 py-1 border rounded transition-colors',
                        managerStore.pooling_intervals[session.id] ? 'cursor-pointer bg-amber-600 border-amber-400' : 'hover:bg-emerald-600 border-emerald-500'
                    ]">
                        {{ managerStore.pooling_intervals[session.id] ? 'Parar' : 'Monitorar' }}
                    </button>

                    <button v-if="!session.qrCode && session.status !== 'open'"
                        @click.stop="managerStore.conectar(session.id)"
                        :disabled="managerStore.connecting_sessions[session.id]"
                        class="cursor-pointer px-3 py-1 border border-blue-500 hover:bg-blue-600 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <!-- Ícone de Loading com animação animate-spin -->
                        <Loader2 v-if="managerStore.connecting_sessions[session.id]"
                            class="cursor-pointer w-4 h-4 animate-spin" />
                        <span>{{ managerStore.connecting_sessions[session.id] ? 'Conectando...' : 'Conectar' }}</span>
                    </button>

                    <!-- QR Code Modal ou Miniatura -->
                    <div v-if="session.qrCode && session.status !== 'open'" @click.stop="id_selecionado = session.id"
                        class="cursor-pointer text-black bg-white p-2 rounded shadow-lg">
                        <p>Clique para ver o QR!</p>
                    </div>

                    <button @click.stop="managerStore.desconectar(session.id)"
                        class="cursor-pointer px-3 py-1 border border-amber-500 hover:bg-amber-600 rounded"
                        type="button">
                        Desconectar
                    </button>

                    <button @click.stop="managerStore.excluir(session.id)"
                        class="cursor-pointer px-3 py-1 border border-red-500 hover:bg-red-600 rounded" type="button">
                        Excluir
                    </button>
                </div>
            </li>
        </ul>
        <div>
            <form @submit.prevent="create_new_session">
                <input v-model="new_session_name" class="bg-pink-700 px-2 rounded-md mx-1" type="text"
                    placeholder="Nome da sessão" required>
                <button class="bg-emerald-800 cursor-pointer px-2 rounded-md" type="submit">
                    Adicionar sessão
                </button>
            </form>
        </div>
        <Teleport to="body">
            <div v-if="chat_sessao_id" class="fixed inset-0 bg-black/80 flex items-center justify-center z-999 p-4"
                @click="chat_sessao_id = null">
                <div class="w-full max-w-7xl h-[80vh] shadow-2xl overflow-hidden rounded-2xl" @click.stop>
                    <Chat_modal :session_id="chat_sessao_id" @close="chat_sessao_id = null" />
                </div>
            </div>
        </Teleport>
        <Teleport to="body">
            <div v-if="id_selecionado" class="fixed inset-0 bg-black/80 flex items-center justify-center z-999 p-4"
                @click="id_selecionado = null">
                <Qr_modal @click.stop :session_id="id_selecionado" />
            </div>
        </Teleport>
    </div>
</template>
