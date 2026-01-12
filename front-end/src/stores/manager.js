import { defineStore } from 'pinia'
import api from '../services/api'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        sessions: [],
        pooling_intervals: {},
        connecting_sessions: {},
        session_pooling_interval: 2000,
    }),
    actions: {
        // Busca todas as sessões
        async getSessions() {
            try {
                const res = await api.get('/sessions')
                this.sessions = res.data
                console.log(`[INFO] manager store: ${this.sessions.length} sessões carregadas`)
            } catch (err) {
                console.error(`[ERROR] manager store: ${err}`)
            }
        },

        // Busca uma sessão específica
        async getSession(sessionId) {
            try {
                const res = await api.get(`/sessions/${sessionId}`, { params: { sessionId } });

                const idx = this.sessions.findIndex(s => s.id === sessionId);
                if (idx !== -1) {
                    // Unimos os dados da API + o status HTTP da resposta
                    this.sessions[idx] = {
                        ...this.sessions[idx],
                        ...res.data,
                        httpStatus: res.status // ESSENCIAL PARA O GATO
                    };

                    // Se o QR Code chegou ou conectou, para o loading
                    if (res.data.qrCode || res.data.status === 'open') {
                        delete this.connecting_sessions[sessionId];
                    }
                }
            } catch (err) {
                console.error("Erro no pooling:", err);
                // Em caso de erro, salva o status do erro (ex: 418 ou 404) para o gato
                const idx = this.sessions.findIndex(s => s.id === sessionId);
                if (idx !== -1 && err.response) {
                    this.sessions[idx].httpStatus = err.response.status;
                }
            }
        },

        // LIGA o pooling individualmente
        startPooling(sessionId) {
            if (this.pooling_intervals[sessionId]) return // Já está ativo

            console.log(`[POOLING] Iniciado: ${sessionId}`)
            this.getSession(sessionId) // Executa a primeira vez imediato

            this.pooling_intervals[sessionId] = setInterval(() => {
                this.getSession(sessionId)
            }, this.session_pooling_interval)
        },

        // DESLIGA o pooling individualmente
        stopPooling(sessionId) {
            if (this.pooling_intervals[sessionId]) {
                clearInterval(this.pooling_intervals[sessionId])
                delete this.pooling_intervals[sessionId]
                console.log(`[POOLING] Parado: ${sessionId}`)
            }
        },

        // LIGA o pooling para todas as sessões da lista
        startAllPoolings() {
            this.sessions.forEach(s => this.startPooling(s.id))
        },

        // DESLIGA todos os poolings ativos
        stopAllPoolings() {
            Object.keys(this.pooling_intervals).forEach(id => this.stopPooling(id))
        },

        async conectar(sessionId) {
            try {
                this.connecting_sessions[sessionId] = true
                await api.post(`/sessions`, null, { params: { sessionId } })
                this.startPooling(sessionId)
            } catch (err) {
                console.error(`[ERROR] manager store: ${err}`)
                delete this.connecting_sessions[sessionId]
            }
        }
    }
})
