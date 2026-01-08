import { Session } from './session.js'
import { EventEmitter } from 'events'
import QRCode from 'qrcode'

export class WAManager {
    constructor() {
        this.status = 'not_working'
        this.sessions = new Map()
        this.emitter = new EventEmitter()
        this.qrCodes = new Map()
    }

    async createSession(sessionId) {
        if (this.sessions.has(sessionId)) { return this.sessions.get(sessionId) }

        const session = new Session(sessionId)

        session.onQR = async (id, qr) => {
            this.emitter.emit('qr', { sessionId: id, qr })
            const image = await QRCode.toDataURL(qr, {
                errorCorrectionLevel: 'H',
                scale: 8,
                margin: 2
            })
            this.qrCodes.set(sessionId, image)
        }

        session.onConnectionUpdate = (id, info) => {
            this._recomputeStatus()
            this.emitter.emit('connection.update', { sessionId: id, ...info })
        }

        session.onError = (id, err) => {
            this.emitter.emit('error', { session: id, error: err })
        }
        
        session.onMessage = (id, detail) => {
            this.emitter.emit('message', { sessionId: id, ...detail })
        }

        this.sessions.set(sessionId, session)

        this.emitter.emit('sessionCreated', { sessionId })

        return session
    }

    async connectSession(sessionId) {
        // const session = this.sessions.get(sessionId) || this.createSession(sessionId)
        // await session.conectar(sessionId)
        // return session
        let session = this.sessions.get(sessionId)
        if ( !session ) {
            session = await this.createSession(sessionId)
        }
        await session.conectar(sessionId)
        return session
    }

    _recomputeStatus() {
        let online = false
        for ( const s of this.sessions.values() ) {
            const info = s.sessionInfo?.get(s.id)
            if ( info?.connection === 'open' ) { online = true; break }
        }
        const newStatus = online ? 'online' : ( this.sessions.size ? 'idle' : 'offline' )
        if ( newStatus !== this.status ) {
            this.status = newStatus
            this.emitter.emit('statusChanged', { status: newStatus })
        }
    }

    destroySession(sessionId) { }

    getSession(sessionId) { }

    listSessions() { }

    getStatus() { return this.status }

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

}
