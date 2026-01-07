import makeWASocket, { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode-terminal'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import NodeCache from 'node-cache'

export class WAManager {
    constructor() {
        this.sessions = new Map()
        this.sessionInfo = new Map()
        this.logger = pino({ level: 'info' })
        this.baseAuthDir = path.resolve(process.env.WA_AUTH_DIR || './auth')
        this.manualDisconnect = new Set()
        if (!fs.existsSync(this.baseAuthDir)) fs.mkdirSync(this.baseAuthDir, { recursive: true })
        this.insecureTried = new Set()
        this.createSession('default')
        this.groupCache = new NodeCache()
    }

    static getInstance() {
        if (!this.instance) this.instance = new WAManager()
        return this.instance
    }

    async createSession(sessionId) {
        console.log('[DEBUG] creating new session')
        if (this.sessions.has(sessionId)) {
            console.log('[INFO] tried creating a new session, but it already existed')
            return this.sessions.get(sessionId)
        } else {
            this.sessions.set(sessionId)
            console.log(`[DEBUG] new session ${sessionId} created`)
        }
    }

    clearAuth(sessionId) {
        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`)
        try {
            fs.rmSync(authDir, { recursive: true, force: true })
            this.logger.warn({ sessionId }, 'Auth apagada com sucesso')
        } catch (err) {
            this.logger.error({ sessionId, err }, 'Erro ao apagar auth')
        }
    }

    _extractDisconnectCode(err) {
        if (!err) return undefined;
        return (
            err?.data?.code ??
            err?.code ??
            err?.output?.statusCode ??
            err?.statusCode ??
            err?.status ??
            // alguns erros podem vir em message como string conhecida
            (typeof err?.message === 'string' && /logged.?out/i.test(err.message) ? DisconnectReason.loggedOut : undefined)
        );
    }

    /**
       * Conecta (modo padrão, com verificação de certificado)
       * @param {string} sessionId
       * @param {{ printQRInTerminal?: boolean }} opts
       */
    async conectar(sessionId, { printQRInTerminal = true } = {}) {
        console.log(this.manualDisconnect)

        if (!this.sessions.has(sessionId)) this.createSession(sessionId)

        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`);
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // change useMultiFileAuthState for self made function some day
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        const sock = makeWASocket({
            logger: this.logger,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.logger),
            },
            markOnlineOnConnect: true,
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
            shouldSyncHistoryMessage: () => false
        });

        this.sessions.set(sessionId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            this.logger.info({ sessionId }, 'conectando')

            const info = {
                connection,
                hasQR: !!qr,
                lastCode: this._extractDisconnectCode(lastDisconnect?.error),
                updatedAt: Date.now()
            }
            this.sessionInfo.set(sessionId, info)

            if (qr) {
                if (printQRInTerminal) QRCode.generate(qr, { small: true });
                if (typeof this.onQR === 'function') this.onQR(sessionId, qr);
                this.logger.info({ sessionId }, 'QR disponível (modo seguro)');
            }

            if (connection === 'open') {
                this.logger.info({ sessionId }, 'Sessão conectada (modo seguro)');
                this.insecureTried.delete(sessionId);
            }

            if (connection === 'close') {
                const err = lastDisconnect?.error
                const code = this._extractDisconnectCode(err)
                const shouldReconnect = code !== DisconnectReason.loggedOut && !this.manualDisconnect.has(sessionId)

                const isCertIssuerError =
                    err?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
                    /unable to get local issuer certificate/i.test(err?.message || '') ||
                    /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/i.test(String(code || ''));

                this.logger.warn({ sessionId, code, shouldReconnect, isCertIssuerError }, 'Conexao fechada (modo seguro)');

                if (shouldReconnect) {
                    if (isCertIssuerError && !this.insecureTried.has(sessionId)) {
                        this.insecureTried.add(sessionId);
                        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                        this.logger.warn({ sessionId }, '[TLS] Tentando reconexão sem verificação de certificado…');

                        setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1000);
                    } else {
                        this.clearAuth(sessionId)

                        setTimeout(() => this.conectar(sessionId, { printQRInTerminal }), 2000);
                    }
                } else {
                    sessionId === 'default' ? '' : this.sessions.delete(sessionId);
                    this.logger.info({ sessionId }, 'Sessao removida apos logout');
                    this.manualDisconnect.delete(sessionId)
                }
            }
        });

        sock.ev.on('messages.upsert', async (event) => {
            for (const m of event.messages) {
                const isProtocol = !!m.message?.protocolMessage;
                const isFromMe = !!m.key.fromMe;
                const isNotify = event.type === 'notify';
                // if (!isNotify || isProtocol || isFromMe) continue;

                const jid = m.key.remoteJid;
                console.log(`[DEBUG] ${Object.keys(m)} | ${Object.keys(m.message)} | ${m.message.conversation}`)
            }
        });

        return sock;
    }

    /**
     * Desconecta a sessão mantendo credenciais
     * @param {string} sessionId
     */
    async disconnect(sessionId) {
        this.manualDisconnect.add(sessionId)
        console.log(this.manualDisconnect)

        const sock = this.sessions.get(sessionId)
        if (!sock) {
            this.logger.warn({ sessionId }, 'disconnect: sessão não encontrada')
            return false
        }

        try {
            if (typeof sock.logout === 'function') {
                await sock.logout()
            }

            sock.ws?.terminate?.()
        } catch (err) {
            this.logger.error({ sessionId, err }, 'Erro ao desconectar')
        } finally {
            // this.sessions.delete(sessionId)
            this.sessionInfo.delete(sessionId)
            this.insecureTried.delete(sessionId)
            this.logger.info({ sessionId }, 'Sessão desconectada')
        }

        return true
    }

    /**
     * Conecta (modo inseguro, sem verificação de certificado)
     * @param {string} sessionId
     * @param {{ printQRInTerminal?: boolean }} opts
     */
    async conectarInseguro(sessionId, { printQRInTerminal = true } = {}) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`);
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        const sock = makeWASocket({
            logger: this.logger,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.logger),
            },
            markOnlineOnConnect: true,
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid)
        });

        this.sessions.set(sessionId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            const info = {
                connection,
                hasQR: !!qr,
                lastCode: this._extractDisconnectCode(lastDisconnect?.error),
                updatedAt: Date.now()
            }
            this.sessionInfo.set(sessionId, info)

            if (qr) {
                if (printQRInTerminal) QRCode.generate(qr, { small: true });
                if (typeof this.onQR === 'function') this.onQR(sessionId, qr);
                this.logger.info({ sessionId }, 'QR disponível (modo inseguro)');
            }

            if (connection === 'open') {
                this.logger.warn({ sessionId }, '[TLS-insecure] Conexão aberta SEM verificação de certificado');
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                this.insecureTried.add(sessionId);
            }

            if (connection === 'close') {
                const err = lastDisconnect?.error;
                const code = this._extractDisconnectCode(err);
                const shouldReconnect = code !== DisconnectReason.loggedOut && !this.manualDisconnect.has(sessionId)

                this.logger.warn({ sessionId, code, shouldReconnect, err }, '[TLS-insecure] Conexão fechada');

                if (shouldReconnect) {
                    setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1500);
                } else {
                    this.sessions.delete(sessionId);
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                    this.insecureTried.delete(sessionId);
                    this.logger.info({ sessionId }, 'Sessão removida após logout (modo inseguro)');
                    this.manualDisconnect.delete(sessionId)
                }
            }
        });

        return sock;
    }

    isConnected(sessionId) {
        const info = this.sessionInfo.get(sessionId)
        if (info?.connection === 'open') return true

        const sock = this.sessions.get(sessionId)
        if (!sock) return false

        const hasUser = !!sock.user && !!sock.user.id
        const wsOpen = !!sock.ws && sock.ws.readyState === 1

        return hasUser || wsOpen
    }

    getSessionInfo(sessionId) {
        return JSON.stringify({
            id: sessionId,
            connected: this.isConnected(sessionId),
            info: this.sessionInfo.get(sessionId) || null
        })
    }
}
