import axios from 'axios'
import { defineStore } from 'pinia'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        manager: {
            status: 'unknown'
        }
    }),
    getters: {},
    actions: {
        async getManager() {
            console.log('[STORE] Checking manager')
            try {
                const { data } = await axios.get('http://localhost:3000/manager')
                if ( !data ) return
                console.log(`[STORE] Answer: ${data.running} | ${data.reason}`)
                this.manager.status = data.running ? 'running' : 'not running'
                return data
            } catch (err) {
                console.log(`[ERROR] ${err}`)
            }
        },
        async createManager() {
            const { answer } = await this.getManager()
            if ( this.manager.status == 'running' ) return
            try {
                console.log('no manager, creating..')
                const { data } = await axios.get('http://localhost:3000/manager/start')
                if ( !data ) return
                console.log(`[STORE] createManager() -> ${data.answer}`)
                return data
            } catch (err) {
                console.log(`[ERROR] ${err}`)
            } finally {
                this.getManager()
            }
        },
        async stopManager() {
            try {
                const { data } = await axios.get('http://localhost:3000/manager/stop')
                if ( !data ) return
                console.log(`[STORE] stopManager() -> ${data}`)
            } catch (err) {
                
            }
        }
    }
})