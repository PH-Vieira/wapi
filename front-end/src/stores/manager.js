import axios from 'axios'
import { defineStore } from 'pinia'
import api from '../services/api'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        sessions: null,
        response: new Map()
    }),
    getters: {},
    actions: {
        async getSessions() {
            try {
                const res = await api.get('http://localhost:3000/sessions')
                if ( !res?.data ) console.log(`[DEBUG] manager store: no data from /sessions`)
                this.sessions = res.data
                console.log(res)

            } catch (err) { console.log(`[ERROR] manager store: ${err}`) }
        },
        async conectar(sessionId) {
            try {
                const { data } = await api.post(`http://localhost:3000/sessions`, null, {
                    params: {
                        "sessionId": sessionId
                    }
                })
                if ( !data ) return
                console.log(`[DEBUG] manager store: ${data}`)
            } catch (err) { console.log(`[ERROR] manager store: ${err}`) }
        }
    }
})