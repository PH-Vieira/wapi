import makeWASocket, { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode-terminal'
import pino from 'pino'
import path from 'path'
import fs from 'fs'

export class WAManager {
    constructor() {
        this.sessions = new Map()
        this.logger = pino({ level: process.env.LOG_LEVEL || 'info' })
        this.baseAuthDir = path.resolve(process.env.WA_AUTH_DIR || './auth')
        if (!fs.existsSync(this.baseAuthDir)) fs.mkdirSync(this.baseAuthDir, { recursive: true })
        this.insecureTried = new Set()
        this.createSession('default')
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
        if (!this.sessions.has(sessionId)) this.createSession(sessionId)
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
        });

        this.sessions.set(sessionId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

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
                const err = lastDisconnect?.error;
                const code = this._extractDisconnectCode(err);
                const shouldReconnect = code !== DisconnectReason.loggedOut;

                const isCertIssuerError =
                    err?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
                    /unable to get local issuer certificate/i.test(err?.message || '') ||
                    /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/i.test(String(code || ''));

                this.logger.warn({ sessionId, code, shouldReconnect, isCertIssuerError }, 'Conexão fechada (modo seguro)');

                if (shouldReconnect) {
                    if (isCertIssuerError && !this.insecureTried.has(sessionId)) {
                        this.insecureTried.add(sessionId);
                        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                        this.logger.warn({ sessionId }, '[TLS] Tentando reconexão sem verificação de certificado…');

                        setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1000);
                    } else {
                        setTimeout(() => this.conectar(sessionId, { printQRInTerminal }), 2000);
                    }
                } else {
                    this.sessions.delete(sessionId);
                    this.logger.info({ sessionId }, 'Sessão removida após logout');
                }
            }
        });

        sock.ev.on('messages.upsert', async (event) => {
            for (const m of event.messages) {
                const isProtocol = !!m.message?.protocolMessage;
                const isFromMe = !!m.key.fromMe;
                const isNotify = event.type === 'notify';
                if (!isNotify || isProtocol || isFromMe) continue;

                const jid = m.key.remoteJid;
                this.logger.debug({ sessionId, jid }, 'Mensagem recebida');
            }
        });

        return sock;
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
            markOnlineOnConnect: false,
        });

        this.sessions.set(sessionId, sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

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
                const shouldReconnect = code !== DisconnectReason.loggedOut;

                this.logger.warn({ sessionId, code, shouldReconnect, err }, '[TLS-insecure] Conexão fechada');

                if (shouldReconnect) {
                    setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1500);
                } else {
                    this.sessions.delete(sessionId);
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                    this.insecureTried.delete(sessionId);
                    this.logger.info({ sessionId }, 'Sessão removida após logout (modo inseguro)');
                }
            }
        });

        return sock;
    }
}
