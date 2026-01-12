<script setup>
import { useManagerStore } from '../stores/manager'
import { useCatsStore } from '../stores/cats';

const managerStore = useManagerStore()
const catsStore = useCatsStore()
</script>

<template>
    <div class="border rounded-md flex justify-center items-center w-full h-full bg-emerald-700">
        <ul>
            <li class="border-collapse px-2 py-1 flex flex-row" v-for="session in managerStore.sessions">
                <div class="px-2 py-1 border rounded-l-md">{{ session.id }}</div>
                <div class="px-2 py-1 border">{{ session.status }}</div>
                <div class="px-2 py-1 border"><pre>{{ catsStore.lastCats }}</pre></div>
                <div class="px-2 py-1 border rounded-r-md" v-if="session.qrCode">{{ session.qrCode }}</div>
                <button @click="managerStore.conectar(session.id)" class="px-2 py-1 border rounded-r-md transition-colors hover:bg-emerald-500 cursor-pointer" type="button" v-else>
                    Conectar
                </button>
                <!-- <pre>{{ session }}</pre> -->
            </li>
        </ul>
    </div>
</template>
