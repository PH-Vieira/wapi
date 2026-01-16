import makeWASocket, { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState, downloadMediaMessage } from '@whiskeysockets/baileys'
import { EventEmitter } from 'events'
import qrcode from 'qrcode-terminal'
import NodeCache from 'node-cache'
import fs from 'fs'
import path from 'path'
import pino from 'pino'

export class Session {
    /**
     * Classe responsavel por uma sessao
     * @param {string} sessionId required session id
     */
    constructor(sessionId) {
        this.id = sessionId
        this.sock = null
        this.chats = new Map()
        this.messages = new Map()
        this.sessionInfo = new Map()
        this.emitter = new EventEmitter()
        this.logger = pino({ level: 'info' })
        this.baseAuthDir = path.resolve(process.env.WA_AUTH_DIR || './auth')
        if (!fs.existsSync(this.baseAuthDir)) fs.mkdirSync(this.baseAuthDir, { recursive: true })
        this.manualDisconnect = new Set()
        this.insecureTried = new Set()
        this.groupCache = new NodeCache({
            stdTTL: 60,             // TTL padrão em segundos (0 = nunca expira)
            checkperiod: 120,       // frequência da coleta de expirados (segundos)
            useClones: true,        // clona valores ao set/get (evita mutação externa)
            deleteOnExpire: true,   // remove chaves automaticamente quando expiram
            maxKeys: -1,            // sem limite; defina para proteger memória
        })
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
    async conectar(sessionId, { printQRInTerminal = true, insecure = false } = {}) {
        this.sessionId = sessionId;
        this.manualDisconnect.delete(sessionId);

        if (insecure) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            this.insecureTried.add(sessionId);
            this.logger.warn({ sessionId }, '[TLS] Iniciando em modo INSEGURO');
        }

        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`);
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        const sock = makeWASocket({
            logger: this.logger,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.logger),
            },
            markOnlineOnConnect: true,
            shouldSyncHistoryMessage: () => true,
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid)
        });

        this.sock = sock;
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            const code = this._extractDisconnectCode(lastDisconnect?.error)
            const errMessage = lastDisconnect?.error?.message || ''

            this.sessionInfo.set(sessionId, {
                connection: connection || 'connecting',
                updatedAt: Date.now()
            })

            if (qr) {
                if (printQRInTerminal) qrcode.generate(qr, { small: true })
                this.emitter.emit('qr', { id: sessionId, qr })
            }

            if (connection === 'open') {
                this.logger.info({ sessionId }, 'Sessão conectada com sucesso')
                this.insecureTried.delete(sessionId)
            }

            if (connection === 'close') {
                const errMessage = lastDisconnect?.error?.message || ''
                const code = this._extractDisconnectCode(lastDisconnect?.error)

                const isRestarting = code === 515

                if (isRestarting) {
                    this.logger.info({ sessionId }, '[RESTART] Erro 515 detectado. Reconectando silenciosamente...')
                    return setTimeout(() => this.conectar(sessionId, { insecure, printQRInTerminal }), 500)
                }

                const isCertError = /unable to get local issuer certificate/i.test(errMessage) ||
                    errMessage.includes('CERT_LOCALLY')

                if (isCertError && !insecure) {
                    this.logger.warn({ sessionId }, '[TLS] Erro de certificado detectado. Reiniciando em modo inseguro...')

                    this.sessionInfo.set(sessionId, { connection: 'connecting', updatedAt: Date.now() })

                    return setTimeout(() => this.conectar(sessionId, { insecure: true, printQRInTerminal }), 1500)
                }


                const isFatal = code === DisconnectReason.loggedOut || code === 401
                const shouldReconnect = !isFatal && !this.manualDisconnect.has(sessionId)

                if (shouldReconnect) {
                    this.sessionInfo.set(sessionId, { connection: 'connecting', updatedAt: Date.now() })

                    setTimeout(() => this.conectar(sessionId, { insecure, printQRInTerminal }), 3000)
                } else {
                    if (code === 401) {
                        await fs.promises.rm(authDir, { recursive: true, force: true }).catch(() => { })
                    }

                    this.sessionInfo.set(sessionId, { connection: 'close', updatedAt: Date.now() })
                    this.emitter.emit('connection.update', { sessionId, connection: 'close' })

                    sock.ev.removeAllListeners()
                    this.sock = null
                    if (insecure) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                }
            }

        })

        sock.ev.on('messages.upsert', async (event) => {
            // if (event.type !== 'notify') return

            for (const m of event.messages) {
                console.log(`[message] ${m.pushName}`)
                const chatJid = m.key.remoteJid;
                if (!m.message) continue;

                const isSticky = !!m.message.stickerMessage
                const isImage = !!m.message.imageMessage
                const isAudio = !!m.message?.audioMessage
                const senderPn = m.key.participant || m.key.remoteJid
                let mediaData = null

                if (isAudio || isSticky || isImage) {
                    try {
                        const buffer = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

                        if (buffer) {
                            let mimePrefix = isAudio ? 'audio/ogg; codecs=opus' : (isSticky ? 'image/webp' : 'image/jpeg');
                            mediaData = `data:${mimePrefix};base64,${buffer.toString('base64')}`;
                        }
                    } catch (err) {
                        console.error(`[BACKEND ERROR] Erro no download da mídia:`, err.message);
                    }
                }

                const isGroup = chatJid.endsWith('@g.us')
                let chatName = chatJid

                if (isGroup) {
                    let metadata = this.groupCache.get(chatJid)
                    if (!metadata) {
                        metadata = await sock?.groupMetadata(chatJid).catch(() => null)
                        if (metadata) this.groupCache.set(chatJid, metadata)
                    }
                    chatName = metadata?.subject || chatJid
                }

                const novaMensagem = {
                    id: m.key.id,
                    chatJid,
                    chatName,
                    text: this.getTextOrReaction(m.message) || (isSticky ? '[figurinha]' : '[imagem]'),
                    fromMe: m.key.fromMe,
                    pushName: m.pushName || 'Contato',
                    timestamp: m.messageTimestamp,
                    url: mediaData,
                    mimetype: isSticky ? 'image/webp' : (isImage ? 'image/jpeg' : (isAudio ? 'audio/ogg' : null)),
                    senderPn: m.verifiedBizName || m.pushName || null,
                    participantAlt: (chatJid.includes('@lid')) ? m.key.participant : null
                }

                if (!this.messages.has(chatJid)) {
                    this.messages.set(chatJid, [])
                }

                const jaExiste = this.messages.get(chatJid).some(msg => msg.id === novaMensagem.id)
                if (!jaExiste) {
                    this.messages.get(chatJid).push(novaMensagem)
                    if (this.messages.get(chatJid).length > 50) {
                        this.messages.get(chatJid).shift()
                    }
                }

                this.emitter.emit('new_message', {
                    sessionId: this.id,
                    ...novaMensagem
                })
            }
        })

        sock.ev.on('lid-mapping.update', (mappings) => {
            console.log(`[mappings] ${mappings}`)
        })

        sock.ev.on('presence.update', (presence) => { console.log(`[presence] ${JSON.stringify(presence)}`) })

        sock.ev.on('chats.update', (chatsUpdate) => { console.log(`[chats update] ${JSON.stringify(chatsUpdate)}`) })

        sock.ev.on('contacts.upsert', (contactsUpsert) => { console.log(`[contacts upsert] ${JSON.stringify(contactsUpsert)}`) })

        sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                const metadata = await sock.groupMetadata(update.id).catch(() => null)
                if (metadata) {
                    this.groupCache.set(update.id, metadata)
                    this.logger.info({ sessionId: this.id, group: metadata.subject }, 'Metadata de grupo atualizado')
                }
            }
        })

        return sock;
    }

    getTextOrReaction(msg) {
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
                if (printQRInTerminal) qrcode.generate(qr, { small: true })
                this.emitter.emit('qr', { id: this.sessionId, qr })
                this.logger.info({ sessionId }, 'QR disponível (modo inseguro)')
            }

            if (connection === 'open') {
                this.logger.warn({ sessionId }, '[TLS-insecure] Conexão aberta SEM verificação de certificado')
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                this.insecureTried.add(sessionId)
            }

            if (connection === 'close') {
                const err = lastDisconnect?.error
                const code = this._extractDisconnectCode(err)
                const isLoggedOut = code === DisconnectReason.loggedOut || code === 401
                const shouldReconnect = !isLoggedOut && !this.manualDisconnect.has(sessionId)

                this.logger.warn({ sessionId, code, shouldReconnect, err }, '[TLS-insecure] Conexão fechada')

                this.logger.warn({ sessionId, code, shouldReconnect, err }, '[TLS-insecure] Conexão fechada');

                if (shouldReconnect) {
                    this.sessionInfo.set(sessionId, { connection: 'close', updatedAt: Date.now() })
                    setTimeout(() => this.conectarInseguro(sessionId, { printQRInTerminal }), 1500)
                } else {
                    if (code === 401) {
                        this.logger.warn({ sessionId }, 'Credenciais inválidas (401). Limpando pasta auth...');
                        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`);
                        fs.promises.rm(authDir, { recursive: true, force: true })
                            .then(() => this.logger.info({ sessionId }, 'Pasta auth removida.'))
                            .catch(e => this.logger.error('Erro ao remover pasta:', e));
                    }

                    this.sessionInfo.set(sessionId, {
                        connection: 'close',
                        updatedAt: Date.now()
                    })

                    if (typeof this.emitter?.emit === 'function') {
                        this.emitter.emit('connection.update', { sessionId, connection: 'close' });
                    }

                    sock.ev.removeAllListeners('connection.update')
                    sock.ev.removeAllListeners('creds.update')
                    sock.ev.removeAllListeners('messages.upsert')

                    this.sock = null
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                    this.insecureTried.delete(sessionId)
                    this.manualDisconnect.delete(sessionId)
                }
            }

        })

        sock.ev.on('messages.upsert', async (event) => {
            for (const m of event.messages) {
                console.log(`[session] ---------------------------------`, JSON.stringify(m), '--------------------------')
                const messageType = Object.keys(m.message || {})[0]
                const isProtocol = !!m.message?.protocolMessage
                const isFromMe = !!m.key.fromMe
                const isNotify = event.type === 'notify'
                const isSticky = messageType === 'stickerMessage'
                const isImage = messageType === 'imageMessage'
                const pushName = m.pushName || null
                if (isNotify) return

                let mediaData = null
                const chatJid = m.key.remoteJid;
                const isGroup = chatJid?.endsWith('@g.us')
                const senderJid = isGroup ? (m.key.participant ?? m.participant ?? m.key.remoteJid) : m.key.remoteJid

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
                }
                const text = getTextOrReaction(m.message)


                if (!this.messages.has(chatJid)) { this.messages.set(chatJid, []) }

                const novaMensagem = {
                    id: m.key.id,
                    fromMe: isFromMe,
                    pushName: pushName,
                    text: text,
                    timestamp: m.messageTimestamp
                }

                this.messages.get(chatJid).push(novaMensagem)

                this.emitter.emit('new_message', { sessionId: this.id, chatJid, ...novaMensagem })
            }
        })

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
                this.sock.end()
                this.logger.warn({ sessionId }, 'Conexao encerrada')
            }
        } catch (err) {
            this.logger.error({ sessionId, err }, 'Erro ao desconectar')
        } finally {
            this.insecureTried.delete(sessionId)
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

            const info = this.sessionInfo.get(sessionId) || {}
            this.sessionInfo.set(sessionId, {
                ...info,
                connection: 'close',
                updatedAt: Date.now()
            })
        }
    }
}