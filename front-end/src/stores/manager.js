import { defineStore } from 'pinia'
import api from '../services/api'

export const useManagerStore = defineStore('manager', {
    state: () => ({
        sessions: [],
        pooling_intervals: {},
        connecting_sessions: {},
        session_pooling_interval: 2000,
        chatMessages: {},
        chatNames: {},
        jidMestre: {},
        messagesByChat: {}
    }),
    actions: {
        async getSessions() {
            try {
                const res = await api.get('/sessions')
                this.sessions = res.data
                // console.log(`[INFO] manager store: ${this.sessions.length} sessões carregadas`)
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

            // console.log(`[POOLING] Iniciado: ${sessionId}`)
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
                // console.log(`[POOLING] Parado: ${sessionId}`)
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

        async sendMessage(sessionId, chatJid, text, media = null, mimetype = null, isPtt = false) {
            try {
                const payload = {
                    text: text || '',
                    media: media,
                    mimetype: mimetype,
                    isPtt: isPtt
                };

                const res = await api.post(`/sessions/${sessionId}/chats/${chatJid}/messages`, payload);

                if (res.data) {
                    this.storeMessage(sessionId, chatJid, res.data);
                    return true;
                }
            } catch (err) {
                console.error("Erro na API de envio:", err.response?.data || err.message);
                return false;
            }
        },

        storeMessage(sessionId, chatJidRaw, message) {
            // 1. Inicialização de segurança
            if (!this.messagesByChat[sessionId]) this.messagesByChat[sessionId] = {}
            if (!this.chatNames[sessionId]) this.chatNames[sessionId] = {}
            if (!this.jidMestre) this.jidMestre = {} // Certifique-se de ter este campo no seu state()

            // 2. Extração de Identidade (A mágica do Baileys 2026)
            // O backend costuma enviar o número real em participantAlt ou senderPn quando o JID é LID
            const identificadorAlternativo = message.participantAlt || message.senderPn;

            // Se recebemos um LID e temos o número real dele, criamos o vínculo
            if (chatJidRaw.includes('@lid') && identificadorAlternativo) {
                if (this.jidMestre[chatJidRaw] !== identificadorAlternativo) {
                    console.log(`%c[VÍNCULO DETECTADO] Unificando LID ${chatJidRaw} -> PN ${identificadorAlternativo}`, "color: #ff9800; font-weight: bold;");
                    this.jidMestre[chatJidRaw] = identificadorAlternativo;
                }
            }

            // 3. Determina o JID Alvo (Se for LID conhecido, usa o número real para agrupar)
            const targetJid = this.jidMestre[chatJidRaw] || chatJidRaw;

            if (chatJidRaw !== targetJid) {
                console.log(`%c[REDIRECIONAMENTO] Mensagem de ${chatJidRaw} movida para gaveta de ${targetJid}`, "color: #9c27b0;");
            }

            // 4. Inicializa o array do chat unificado
            if (!this.messagesByChat[sessionId][targetJid]) {
                this.messagesByChat[sessionId][targetJid] = [];
            }

            // 5. Lógica de Nome (Prioridade: Nome Real > Número > ID)
            const nomeAtual = this.chatNames[sessionId][targetJid];
            const novoNome = message.chatName || message.pushName;
            const eLixo = (n) => !n || n.includes('@') || /^\d+$/.test(n.replace(/[-]/g, '')) || (n.length > 15 && /^\d+/.test(n));

            if (!eLixo(novoNome)) {
                if (!message.fromMe || eLixo(nomeAtual)) {
                    if (nomeAtual !== novoNome) {
                        console.log(`%c[NOME] Atualizando "${targetJid}" para "${novoNome}"`, "color: #4CAF50;");
                        this.chatNames[sessionId][targetJid] = novoNome;
                    }
                }
            }

            // Fallback de nome se estiver vazio
            if (!this.chatNames[sessionId][targetJid]) {
                this.chatNames[sessionId][targetJid] = targetJid.split('@')[0];
            }

            // 6. Gravação Final
            const exists = this.messagesByChat[sessionId][targetJid].some(m => m.id === message.id);
            if (!exists) {
                console.log(`[STORAGE] Gravando mensagem no chat: ${targetJid}`);
                this.messagesByChat[sessionId][targetJid].push({
                    ...message,
                    displayName: this.chatNames[sessionId][targetJid]
                });

                // Forçar reatividade do Vue
                this.messagesByChat = { ...this.messagesByChat };
                this.chatNames = { ...this.chatNames };
            }
        }
    }
})
