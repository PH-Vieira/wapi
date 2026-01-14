import { Session } from './session.js'
import { EventEmitter } from 'events'
import QRCode from 'qrcode'
import fs from 'fs/promises'
import path from 'path'

export class WAManager {
    constructor() {
        this.status = 'not_working'
        this.sessions = new Map()
        this.emitter = new EventEmitter()
        this.qrCodes = new Map()

        console.log('[INFO] WAManager: Manager criado')
    }

    async createSession(sessionId) {
        if (this.sessions.has(sessionId)) { return this.sessions.get(sessionId) }

        const session = new Session(sessionId)

        session.emitter.on('qr', async ({ id, qr }) => {
            this.emitter.emit('qr', { sessionId: id, qr })
            const image = await QRCode.toDataURL(qr, {
                errorCorrectionLevel: 'H',
                scale: 8,
                margin: 2
            })
            this.qrCodes.set(id, image)
        })

        session.emitter.on('connection.update', (data) => {
            this._recomputeStatus()

            if (data.connection === 'close') {
                console.log(`[MANAGER] Limpando dados da sessão ${data.sessionId} por fechamento.`);
                this.qrCodes.delete(data.sessionId);
            }

            this.emitter.emit('connection.update', data)
        })


        // session.onError = (id, err) => {
        //     this.emitter.emit('error', { session: id, error: err })
        // }

        session.emitter.on('new_message', (data) => {
            console.log(`[MANAGER] Nova mensagem na sessao ${data.sessionId}: ${data.text}`)
            this.emitter.emit('new_message', data)
        })

        this.sessions.set(sessionId, session)

        try {
            await this.salvar_sessao_local(sessionId)
        } catch (err) {
            console.log(`[ERROR] Falha ao persistir dados: ${err.message}`)
        }

        this.emitter.emit('sessionCreated', { sessionId })

        console.log(`[INFO] WAManager: sessao ${sessionId} criada e persistida`)
        return session
    }

    async connectSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (!session) {
            session = await this.createSession(sessionId)
        }
        session.manualDisconnect.delete(sessionId)
        session.insecureTried.delete(sessionId)
        await session.conectar(sessionId)
        return session
    }

    async disconnectSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            await session.disconnect(sessionId, { logout: false })
            this.qrCodes.delete(sessionId)
            console.log(`[INFO] Sessao ${sessionId} desconectada.`)
            return true
        }
        return false
    }

    _recomputeStatus() {
        let online = false
        for (const s of this.sessions.values()) {
            const info = s.sessionInfo?.get(s.id)
            if (info?.connection === 'open') { online = true; break }
        }
        const newStatus = online ? 'online' : (this.sessions.size ? 'idle' : 'offline')
        if (newStatus !== this.status) {
            this.status = newStatus
            this.emitter.emit('statusChanged', { status: newStatus })
        }
    }

    async destroySession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            await session.disconnect(sessionId, { logout: true })
            console.log(`[INFO] Sessao ${sessionId} desconectada.`)
        }

        this.sessions.delete(sessionId)
        this.qrCodes.delete(sessionId)

        const data_path = path.resolve('data.json')
        try {
            const content = await fs.readFile(data_path, 'utf-8')
            let data = JSON.parse(content)

            data.sessions = data.sessions.filter(s => s.id !== sessionId)

            await fs.writeFile(data_path, JSON.stringify(data, null, 2))
            console.log(`[INFO] Sessao ${sessionId} excluida`)
        } catch (err) {
            console.log(`[ERROR] Erro ao excluir sessar ${sessionId}`)
        }
    }

    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const info = session.sessionInfo.get(sessionId) || {};
        let status = info.connection || 'close';

        if ((session.sock || session.insecureTried.has(sessionId)) && status === 'close') {
            status = 'connecting'
        }

        return {
            id: sessionId,
            status: status,
            qrCode: this.qrCodes.get(sessionId) || null,
            allMessages: Object.fromEntries(session.messages || new Map())
        }
    }

    async listSessions() {
        const data_path = path.resolve('data.json')

        try {
            const content = await fs.readFile(data_path, 'utf-8')
            const data = JSON.parse(content)

            for (const persisted_session of data.sessions) {
                if (!this.sessions.has(persisted_session.id)) {
                    console.log(`[RECOVERY] Restaurando sessao do arquivo: ${persisted_session.id}`)
                    await this.createSession(persisted_session.id)
                }
            }
        } catch (err) {
            console.log(`[INFO] Nenhum arquivo data.json encontrado`)
        }

        return Array.from(this.sessions).map(([id, session]) => {
            const info = session.sessionInfo?.get(id) || {};
            let statusReal = info.connection || 'close';

            if (session.sock && statusReal === 'close') {
                statusReal = 'connecting';
            }

            return {
                id: id,
                status: statusReal,
                qrCode: this.qrCodes.get(id) || null,
                allMessages: Object.fromEntries(session.messages || new Map())
            }
        })
    }

    getStatus(sessionId) { }

    destroyAllSessions() { }

    on(event, callback) { }

    broadcastMessage(message) { }

    restartSession(sessionId) { }

    hasSession(sessionId) { }

    updateStatus() {
        let hasActiveSocket = false

        for (const [id, session] of this.sessions.entries()) {
            const sock = session?.sock ?? session
            if (this.isSocketAlive(sock)) {
                hasActiveSocket = true
                break
            }
        }
        this.status = hasActiveSocket ? 'working' : 'not_working'

    }

    isSocketAlive(sock) {
        if (!sock) return false
        if (typeof sock.readyState === 'number') {
            const OPEN = sock.OPEN ?? 1
            return sock.readyState === OPEN
        }
        if (typeof sock.destroyed === 'boolean') {
            return !sock.destroyed
        }
        if (typeof sock.connected === 'boolean') {
            return sock.connected
        }
        return true
    }

    static getInstance() {
        if (!this.instance) this.instance = new WAManager()
        return this.instance
    }

    async salvar_sessao_local(sessionId) {
        const data_path = path.resolve('data.json')
        let data = { sessions: [] }

        try {
            const content = await fs.readFile(data_path, 'utf-8')
            data = JSON.parse(content)
        } catch (err) {
            console.log(`[INFO] Criando novo arquivo data.json`)
        }

        const new_entry = {
            id: sessionId,
            last_updated_at: new Date().toISOString()
        }

        const idx = data.sessions.findIndex(s => s.id === sessionId)
        if (idx !== -1) {
            data.sessions[idx] = new_entry
        } else {
            data.sessions.push(new_entry)
        }

        await fs.writeFile(data_path, JSON.stringify(data, null, 2))
    }
}
