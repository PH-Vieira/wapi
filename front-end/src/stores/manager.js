import axios from 'axios'
import { defineStore } from 'pinia'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        manager: null
    }),
    getters: {},
    actions: {}
})