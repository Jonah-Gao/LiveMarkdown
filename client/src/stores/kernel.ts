import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type KernelStatus = 'starting' | 'running' | 'stopped' | 'error'

export const useKernelStore = defineStore('kernel', () => {
    const status = ref<KernelStatus>('stopped')
    const port = ref<number | null>(null)
    const errorMessage = ref<string | null>(null)

    const isRunning = computed(() => status.value === 'running')
    const baseUrl = computed(() => port.value ? `http://localhost:${port.value}` : null)

    function setPort(p: number) {
        port.value = p
    }

    function setStatus(s: KernelStatus, error?: string) {
        status.value = s
        errorMessage.value = error ?? null
    }

    function reset() {
        status.value = 'stopped'
        port.value = null
        errorMessage.value = null
    }

    return {
        status,
        port,
        errorMessage,
        isRunning,
        baseUrl,
        setPort,
        setStatus,
        reset
    }
})
