<script setup lang="ts">
import splashImage from '@/assets/splash.png'
</script>

<template>
    <div class="splash">
        <img :src="splashImage" alt="Loading..." />
    </div>
</template>

<style scoped>
.splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d0d;
    z-index: 9999;
}

.splash img {
    max-width: 600px;
    max-height: 338px;
    object-fit: contain;
    -webkit-user-drag: none;
}
</style>
