import makeWASocket, { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode-terminal'
import NodeCache from 'node-cache'
import path from 'path'
import pino from 'pino'
import fs from 'fs'

export class Session {
    /**
     * Classe responsavel por uma sessao
     * @param {string} sessionId required session id
     */
    constructor(sessionId) {
        this.id = sessionId
        this.sock = null
        this.sessionInfo = new Map()
        this.logger = pino({ level: 'info' })
        this.baseAuthDir = path.resolve(process.env.WA_AUTH_DIR || './auth')
        if (!fs.existsSync(this.baseAuthDir)) fs.mkdirSync(this.baseAuthDir, { recursive: true })
        this.manualDisconnect = new Set()
        this.insecureTried = new Set()
        this.groupCache = new NodeCache()
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

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            this.logger.warn({ sessionId }, 'conectando')

            const info = {
                connection,
                hasQR: !!qr,
                lastCode: this._extractDisconnectCode(lastDisconnect?.error),
                updatedAt: Date.now()
            }
            this.sessionInfo.set(sessionId, info)

            if (qr) {
                if (printQRInTerminal) QRCode.generate(qr, { small: true });
                if (typeof this.onQR === 'function') this.onQR(sessionId, qr)
                this.logger.warn({ sessionId }, 'QR disponível (modo seguro)')
            }

            if (connection === 'open') {
                this.logger.warn({ sessionId }, 'Sessão conectada (modo seguro)')
                this.insecureTried.delete(sessionId)
            }

            if (connection === 'close') {
                const err = lastDisconnect?.error
                const code = this._extractDisconnectCode(err)
                const shouldReconnect = code !== DisconnectReason.loggedOut && !this.manualDisconnect.has(sessionId)

                const isCertIssuerError =
                    err?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
                    /unable to get local issuer certificate/i.test(err?.message || '') ||
                    /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/i.test(String(code || ''))

                this.logger.warn({ sessionId, code, shouldReconnect, isCertIssuerError }, 'Conexao fechada (modo seguro)')

                if (shouldReconnect) {
                    if (isCertIssuerError && !this.insecureTried.has(sessionId)) {
                        this.insecureTried.add(sessionId)
                        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
                        this.logger.warn({ sessionId }, '[TLS] Tentando reconexão sem verificação de certificado…')

                        setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1000)
                    } else {
                        this.clearAuth(sessionId)

                        setTimeout(() => this.conectar(sessionId, { printQRInTerminal }), 2000)
                    }
                } else {
                    sessionId === 'default' ? '' : this.sessions.delete(sessionId)
                    this.logger.info({ sessionId }, 'Sessao removida apos logout')
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

                const chatJid = m.key.remoteJid;
                const isGroup = chatJid?.endsWith('@g.us');
                const senderJid = isGroup ? (m.key.participant ?? m.participant ?? m.key.remoteJid) : m.key.remoteJid;

                const getTextOrReaction = (msg) => {
                    if (msg?.conversation) return msg.conversation;
                    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
                    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
                    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
                    if (msg?.documentMessage?.caption) return msg.documentMessage.caption;
                    if (msg?.reactionMessage) {
                        const r = msg.reactionMessage;
                        const targetId = r?.key?.id ?? '[n/a]';
                        return `[reaction] emoji=${r?.text ?? ''} targetKeyId=${targetId}`;
                    }
                    return '[sem texto]';
                };
                const text = getTextOrReaction(m.message);

                const pushName = m.pushName || null;

                // cache de metadata de grupo
                let chatName = null;
                if (isGroup) {
                    let groupMeta = this.groupCache.get(chatJid);
                    if (!groupMeta) {
                        groupMeta = await sock.groupMetadata(chatJid).catch(() => null);
                        if (groupMeta) this.groupCache.set(chatJid, groupMeta);
                    }
                    chatName = groupMeta?.subject || chatJid;
                } else {
                    chatName = chatJid;
                }

                const showNumberIfUser = (jid) => (
                    jid?.endsWith('@s.whatsapp.net') ? jid.replace(/@.+$/, '') : '[opaque-id]'
                );

                const fromLabel = pushName ?? (isGroup ? senderJid : showNumberIfUser(senderJid));

                console.log(
                    `[MESSAGE RECEIVED] chat=${isGroup ? 'group' : 'direct'} ` +
                    `chatJid=${chatJid} chatName=${chatName} ` +
                    `fromJid=${senderJid} from=${fromLabel} ` +
                    `type=${event.type} keys=${Object.keys(m.message || {})} ` +
                    `text=${text}`
                );
            }
        });

        this.status = 'running'

        this.sock = sock
        return sock
    }

    /**
     * Conecta (modo inseguro, sem verificação de certificado)
     * @param {string} sessionId
     * @param {{ printQRInTerminal?: boolean }} opts
     */
    async conectarInseguro(sessionId, { printQRInTerminal = true } = {}) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`)
        const { state, saveCreds } = await useMultiFileAuthState(authDir)

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

        sock.ev.on('creds.update', saveCreds)

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update
            this.logger.warn({ sessionId }, 'conectando')

            const info = {
                connection,
                hasQR: !!qr,
                lastCode: this._extractDisconnectCode(lastDisconnect?.error),
                updatedAt: Date.now()
            }
            this.sessionInfo.set(sessionId, info)

            if (qr) {
                if (printQRInTerminal) QRCode.generate(qr, { small: true });
                if (typeof this.onQR === 'function') this.onQR(sessionId, qr)
                this.logger.info({ sessionId }, 'QR disponível (modo inseguro)')
            }

            if (connection === 'open') {
                this.logger.warn({ sessionId }, '[TLS-insecure] Conexão aberta SEM verificação de certificado')
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                this.insecureTried.add(sessionId)
            }

            if (connection === 'close') {
                const err = lastDisconnect?.error;
                const code = this._extractDisconnectCode(err);
                const shouldReconnect = code !== DisconnectReason.loggedOut && !this.manualDisconnect.has(sessionId)

                this.logger.warn({ sessionId, code, shouldReconnect, err }, '[TLS-insecure] Conexão fechada');

                if (shouldReconnect) {
                    setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1500);
                } else {
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                    this.insecureTried.delete(sessionId)
                    this.logger.warn({ sessionId }, 'Sessão removida após logout (modo inseguro)')
                    this.manualDisconnect.delete(sessionId)
                }
            }
        })

        sock.ev.on('messages.upsert', async (event) => {
            for (const m of event.messages) {
                const isProtocol = !!m.message?.protocolMessage;
                const isFromMe = !!m.key.fromMe;
                const isNotify = event.type === 'notify';
                // if (!isNotify || isProtocol || isFromMe) continue;

                const chatJid = m.key.remoteJid;
                const isGroup = chatJid?.endsWith('@g.us');
                const senderJid = isGroup ? (m.key.participant ?? m.participant ?? m.key.remoteJid) : m.key.remoteJid;

                const getTextOrReaction = (msg) => {
                    if (msg?.conversation) return msg.conversation;
                    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
                    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
                    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
                    if (msg?.documentMessage?.caption) return msg.documentMessage.caption;
                    if (msg?.reactionMessage) {
                        const r = msg.reactionMessage;
                        const targetId = r?.key?.id ?? '[n/a]';
                        return `[reaction] emoji=${r?.text ?? ''} targetKeyId=${targetId}`;
                    }
                    return '[sem texto]';
                };
                const text = getTextOrReaction(m.message);

                const pushName = m.pushName || null;

                // cache de metadata de grupo
                let chatName = null;
                if (isGroup) {
                    let groupMeta = this.groupCache.get(chatJid);
                    if (!groupMeta) {
                        groupMeta = await sock.groupMetadata(chatJid).catch(() => null);
                        if (groupMeta) this.groupCache.set(chatJid, groupMeta);
                    }
                    chatName = groupMeta?.subject || chatJid;
                } else {
                    chatName = chatJid;
                }

                const showNumberIfUser = (jid) => (
                    jid?.endsWith('@s.whatsapp.net') ? jid.replace(/@.+$/, '') : '[opaque-id]'
                );

                const fromLabel = pushName ?? (isGroup ? senderJid : showNumberIfUser(senderJid));

                console.log(
                    `[MESSAGE RECEIVED] chat=${isGroup ? 'group' : 'direct'} ` +
                    `chatJid=${chatJid} chatName=${chatName} ` +
                    `fromJid=${senderJid} from=${fromLabel} ` +
                    `type=${event.type} keys=${Object.keys(m.message || {})} ` +
                    `text=${text}`
                );
            }
        });

        this.sock = sock
        return sock
    }

    async disconnect(sessionId, { logout = false }) {
        this.manualDisconnect.add(sessionId)

        try {
            if (!this.sock) {
                this.logger.warn({ sessionId }, 'Nenhum socket para desconectar')
                return
            }
            if (logout) {
                await this.sock.logout()
                this.logger.warn({ sessionId }, 'Logout executado')
            } else {
                await this.sock.end()
                this.logger.warn({ sessionId }, 'Conexao encerrada')
            }
        } catch (err) {
            this.logger.error({ sessionId, err }, 'Erro ao desconectar')
        } finally {
            this.insecureTried.delete(sessionId)
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

            const info = this.sessionInfo.get(sessionInfo) || {}
            this.sessionInfo.set(sessionId, {
                ...info,
                connection: 'close',
                updatedAt: Date.now()
            })
        }
    }
}