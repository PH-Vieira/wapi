<script setup>

const props = defineProps({
    img: String
})
</script>

<template>
    <div class="bg-sky-800 p-6 rounded-2xl flex flex-col items-center max-w-full max-h-full">
        <img :src="props.img" class="rounded-sm max-w-full max-h-[90vh] object-contain">
    </div>
</template>
