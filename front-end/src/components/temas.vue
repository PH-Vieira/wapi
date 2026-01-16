<script setup>
import { Check } from 'lucide-vue-next'
import { useColorsStore } from '../stores/colors';

const colorsStore = useColorsStore()
</script>

<template>
    <div class="absolute top-0 left-5 flex gap-0 items-start">
        <div v-for="color in colorsStore.colors" :key="color.name" class="relative group">
            <!-- O "Corpo" da aba que desce com a cor do tema -->
            <div class="relative pt-20 px-4 pb-3 rounded-b-full flex flex-col items-center transition-colors"
                :style="{ backgroundColor: color.from }">

                <button @click="colorsStore.setActiveColor(color.name)"
                    class=" cursor-pointer relative w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 transition-all flex items-center justify-center border border-white/30"
                    :title="color.name">
                    <div class="w-8 h-8 rounded-full shadow-inner"
                        :style="{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }">
                        <Check v-if="color.name === colorsStore.activeColor" :size="18" stroke-width="3"
                            class="text-white m-auto mt-1.75" />
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
