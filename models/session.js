import makeWASocket, { Browsers, DisconnectReason, makeCacheableSignalKeyStore, useMultiFileAuthState, downloadMediaMessage } from '@whiskeysockets/baileys'
import { EventEmitter } from 'events'
import QRCodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import NodeCache from 'node-cache'
import fs from 'fs'
import path from 'path'
import pino from 'pino'

export class Session {
    /**
     * Classe responsavel por uma sessao
     * @param {string} sessionId required session id
     * @param {string} managerEmitter centralized emitter
     */
    constructor(sessionId, managerEmitter) {
        this.id = sessionId
        this.managerEmitter = managerEmitter
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
        this.sessionId = sessionId
        this.manualDisconnect.delete(sessionId)

        if (insecure) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
            this.insecureTried.add(sessionId)
            this.logger.warn({ sessionId }, '[TLS] Iniciando em modo INSEGURO')
        }

        const authDir = path.join(this.baseAuthDir, `session-${sessionId}`)
        const { state, saveCreds } = await useMultiFileAuthState(authDir)

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
        })

        this.sock = sock

        sock.ev.on('creds.update', saveCreds)

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            const code = this._extractDisconnectCode(lastDisconnect?.error)
            const errMessage = lastDisconnect?.error?.message || ''

            this.sessionInfo.set(sessionId, {
                connection: connection || 'connecting',
                updatedAt: Date.now()
            })

            this.managerEmitter.emit('connection', { sessionId: sessionId, data: 'connecting' })

            if (qr) {
                if (printQRInTerminal) QRCodeTerminal.generate(qr, { small: true })
                try {
                    const imageBase64 = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'H',
                        scale: 8,
                        margin: 2
                    })
                    this.managerEmitter.emit('qr', { sessionId: sessionId, data: imageBase64 })
                } catch (err) { console.error(`[err] erro ao gerar qr ${err}`) }
            }

            if (connection === 'open') {
                this.logger.info({ sessionId }, 'Sessão conectada com sucesso')
                this.insecureTried.delete(sessionId)
                this.managerEmitter.emit('connection', { sessionId: sessionId, data: 'open' })
            }

            if (connection === 'close') {
                const errMessage = lastDisconnect?.error?.message || ''
                const code = this._extractDisconnectCode(lastDisconnect?.error)
                this.managerEmitter.emit('connection', { sessionId: sessionId, data: 'closed' })

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
                this.managerEmitter.emit('message', { sessionId: sessionId, data: m })
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

                // this.managerEmitter.emit('message', {
                //     sessionId: this.id,
                //     ...novaMensagem
                // })
            }
        })

        sock.ev.on('lid-mapping.update', (mappings) => { 
            console.log(`[mappings] ${mappings}`)
            this.managerEmitter.emit('mappings')
        })

        sock.ev.on('presence.update', (presence) => { 
            console.log(`[presence] ${JSON.stringify(presence)}`)
            this.managerEmitter.emit('presence')
        })

        sock.ev.on('chats.update', (chatsUpdate) => { 
            console.log(`[chats update] ${JSON.stringify(chatsUpdate)}`)
            this.managerEmitter.emit('chats')
        })

        sock.ev.on('contacts.upsert', (contactsUpsert) => { 
            console.log(`[contacts upsert] ${JSON.stringify(contactsUpsert)}`)
            this.managerEmitter.emit('contacts')
        })

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