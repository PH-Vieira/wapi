import { defineStore } from 'pinia'
import api from '../services/api'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        sessions: [],
        pooling_intervals: {},
        connecting_sessions: {},
        session_pooling_interval: 2000,
        chatMessages: {},
        messagesByChat: {}
    }),
    actions: {
        async getSessions() {
            try {
                const res = await api.get('/sessions')
                this.sessions = res.data
                console.log(`[INFO] manager store: ${this.sessions.length} sessões carregadas`)
            } catch (err) {
                console.error(`[ERROR] manager store: ${err}`)
            }
        },

        async getSession(sessionId) {
            try {
                const res = await api.get(`/sessions/${sessionId}`);
                const idx = this.sessions.findIndex(s => s.id === sessionId);

                if (idx !== -1) {
                    this.sessions[idx] = { ...this.sessions[idx], ...res.data };

                    if (res.data.allMessages) {
                        Object.entries(res.data.allMessages).forEach(([chatJid, messages]) => {
                            messages.forEach(msg => {
                                this.storeMessage(sessionId, chatJid, msg);
                            });
                        });
                    }

                    const status = res.data.status;
                    const temQR = !!res.data.qrCode;

                    if (temQR || status === 'open') {
                        delete this.connecting_sessions[sessionId];
                    }

                    if (status === 'close' && !temQR) {
                        setTimeout(() => {
                            const sessaoAtual = this.sessions.find(s => s.id === sessionId);
                            if (sessaoAtual && sessaoAtual.status === 'close' && !sessaoAtual.qrCode) {
                                delete this.connecting_sessions[sessionId];
                            }
                        }, 2500);
                    }
                }
            } catch (err) {
                console.error("Erro no pooling de mensagens:", err);
                delete this.connecting_sessions[sessionId];
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
                await api.post(`/sessions/${sessionId}/connect`)
                this.startPooling(sessionId)
            } catch (err) {
                console.log(`[ERROR] manager store: ${err}`)
                delete this.connecting_sessions[sessionId]
            }
        },

        async create_session(sessionId) {
            try {
                await api.post(`/sessions/${sessionId}`)
                await this.getSessions()
            } catch (err) {
                console.log(`[ERROR] manager store: ${err}`)
            }
        },

        async desconectar(sessionId) {
            try {
                await api.post(`/sessions/${sessionId}/disconnect`)
                if (this.connecting_sessions[sessionId]) {
                    delete this.connecting_sessions[sessionId]
                }
                await this.getSessions()
            } catch (err) {
                console.log(`[ERROR] Erro ao desconectar: ${err}`)
            }
        },

        async excluir(sessionId) {
            if (!confirm(`Tem certeza que deseja excluir a sessao ${sessionId}?`)) return

            try {
                await api.delete(`/sessions/${sessionId}`)
                delete this.connecting_sessions[sessionId]
                this.sessions = this.sessions.filter(s => s.id !== sessionId)
            } catch (err) {
                console.log(`[ERROR] Erro ao excluir: ${err}`)
            }
        },

        async fetchMessages(sessionId, chatJid) {
            try {
                const res = await api.get(`/sessions/${sessionId}/chats/${chatJid}/messages`)
                if (!this.chatMessages[sessionId]) this.chatMessages[sessionId] = {}
                this.chatMessages[sessionId][chatJid] = res.data
            } catch (err) { console.log(`[ERROR] Erro ao buscar mensagens: ${err}`) }
        },

        async sendMessage(sessionId, chatJid, text) {
            try {
                const res = await api.post(`/sessions/${sessionId}/chats/${chatJid}/messages`, { text });

                if (res.data) {
                    this.storeMessage(sessionId, chatJid, res.data);
                }
                return true;
            } catch (err) {
                console.error(`[ERROR] Erro ao enviar mensagem: ${err}`);
                return false;
            }
        },

        storeMessage(sessionId, chatJid, message) {
            if (!this.messagesByChat[sessionId]) this.messagesByChat[sessionId] = {}
            if (!this.messagesByChat[sessionId][chatJid]) this.messagesByChat[sessionId][chatJid] = []

            const exists = this.messagesByChat[sessionId][chatJid].some(m => m.id === message.id)

            if (!exists) {
                this.messagesByChat[sessionId][chatJid].push({
                    id: message.id,
                    text: message.text,
                    fromMe: message.fromMe,
                    pushName: message.pushName,
                    chatName: message.chatName,
                    timestamp: message.timestamp,
                    url: message.url || null,
                    mimetype: message.mimetype || null,
                    base64: message.base64 || null
                })
                this.messagesByChat = { ...this.messagesByChat }
            }
        },
    }
})
