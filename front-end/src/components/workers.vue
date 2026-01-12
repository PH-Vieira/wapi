<script setup>
import { useManagerStore } from '../stores/manager'
import { useCatsStore } from '../stores/cats'
import { Loader2 } from 'lucide-vue-next'

const managerStore = useManagerStore()
const catsStore = useCatsStore()

const togglePooling = (id) => {
    if (managerStore.pooling_intervals[id]) {
        managerStore.stopPooling(id)
    } else {
        managerStore.startPooling(id)
    }
}
</script>

<template>
    <div class="border rounded-md flex justify-center items-center w-full h-full bg-emerald-700 p-4">
        <ul class="bg-slate-900 w-full max-w-4xl rounded-lg overflow-hidden">
            <li class="border-b border-slate-700 px-4 py-3 flex items-center gap-4 text-white"
                v-for="session in managerStore.sessions" :key="session.id">

                <!-- Gato do Status HTTP -->
                <div class="w-32 h-32 shrink-0 bg-slate-800 rounded overflow-hidden border border-slate-600">
                    <img :src="`https://http.cat/${session.httpStatus || 404}`" :alt="`Status ${session.httpStatus}`"
                        class="w-full h-full object-cover" />
                </div>

                <div class="grow">
                    <div class="font-bold text-emerald-400">{{ session.id }}</div>
                    <div class="text-xs uppercase opacity-70">Sessão: {{ session.status }}</div>
                    <div class="text-xs font-mono">HTTP: {{ session.httpStatus || '---' }}</div>
                </div>

                <!-- Botões de Controle -->
                <div class="flex gap-2">
                    <button @click="togglePooling(session.id)" :class="[
                        'px-3 py-1 text-sm border rounded transition-colors',
                        managerStore.pooling_intervals[session.id] ? 'bg-amber-600 border-amber-400' : 'hover:bg-emerald-600 border-emerald-500'
                    ]">
                        {{ managerStore.pooling_intervals[session.id] ? 'Parar' : 'Monitorar' }}
                    </button>

                    <button v-if="!session.qrCode && session.status !== 'open'"
                        @click="managerStore.conectar(session.id)"
                        :disabled="managerStore.connecting_sessions[session.id]"
                        class="px-3 py-1 text-sm border border-blue-500 hover:bg-blue-600 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <!-- Ícone de Loading com animação animate-spin -->
                        <Loader2 v-if="managerStore.connecting_sessions[session.id]" class="w-4 h-4 animate-spin" />

                        <span>{{ managerStore.connecting_sessions[session.id] ? 'Conectando...' : 'Conectar' }}</span>
                    </button>
                </div>

                <!-- QR Code Modal ou Miniatura -->
                <div v-if="session.qrCode && session.status !== 'open'"
                    class="w-32 h-32 bg-white p-2 rounded shadow-lg">
                    <img :src="session.qrCode" alt="WhatsApp QR Code" class="w-full h-full" />
                </div>
            </li>
        </ul>
    </div>
</template>
