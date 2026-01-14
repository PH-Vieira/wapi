<!-- qr_modal.vue -->
<script setup>
import { computed } from 'vue';
import { useManagerStore } from '../stores/manager';

const props = defineProps({
    session_id: String
})

const managerStore = useManagerStore()

const sessao = computed(() => {
    return managerStore.sessions.find(s => s.id === props.session_id)
})

const qr_code = computed(() => sessao?.value?.qrCode)
const status = computed(() => sessao?.value?.status)
</script>

<template>
    <div class="bg-emerald-100 p-6 rounded-2xl flex flex-col items-center">
        <h2 class="text-emerald-600 font-bold mb-4">Escanear QR Code</h2>

        <div v-if="qr_code" class="bg-emerald-200 p-4 rounded-lg">
            <!-- Usa a prop que veio do pai -->
            <img :src="qr_code" alt="QR Code" class="w-96 h-96" />
        </div>

        <p class="text-emerald-500 mt-4 text-sm text-center">
            Aponte a câmera do seu WhatsApp <br> para conectar a sessão. <br> O QR atualiza sozinho.
        </p>
    </div>
</template>
