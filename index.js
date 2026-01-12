// libs
import express from 'express'
import cors from 'cors'
import { WAManager } from './models/WAManager.js'
import { WebSocketServer } from 'ws'
import http from 'http'
// --------------------------------------------- //
const PORT = 3000

const app = express()

app.use(cors({
    origin: 'http://localhost:5173',
}))

app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Set()

wss.on('connection', (ws) => {
    clients.add(ws)
    console.log('[WS] cliente conectado')

    ws.on('message', (msg) => {
        console.log('mensagem do cliente:', msg.toString())
    })

    ws.on('close', () => {
        clients.delete(ws)
        console.log('[WS] cliente desconectado')
    })
})

function broadcast(obj) {
    const data = JSON.stringify(obj)
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(data)
    }
}

// ------------ ROTAS -------------- //

app.get('/', (req, res) => {
    console.log('[INFO] GET /')
    res.set('X-Created-By', 'amogus?')
    return res.status(214)
})

app.get('/sessions', (req, res) => {
    console.log('[INFO] GET /sessions')
    const manager = WAManager.getInstance()
    if (!manager) { return res.status(418).json({ error: 'missin manager' }) }
    const sessions = manager.listSessions()
    return res.status(214).json(sessions)
})

app.post('/sessions', async (req, res) => {
    console.log('[INFO] POST /sessions')
    const sessionId = req.query.sessionId
    if (!sessionId) { return res.status(417).json({ error: 'sessionId eh obrigatorio' }) }
    const manager = WAManager.getInstance()
    if (!manager) { return res.status(418).json({ error: 'missin manager' }) }
    await manager.connectSession(sessionId)
    return res.status(214).json({ message: 'connecting..' })
})

app.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params
    const manager = WAManager.getInstance()
    const sessionData = manager.getSession(sessionId)

    if (!sessionData) {
        return res.status(418).json({
            sessionId,
            error: `Sessão ${sessionId} não encontrada`
        })
    }

    console.log(`[INFO] GET /sessions/${sessionId} - Status: ${sessionData.status}`)
    
    // O correto é passar UM único objeto combinando os dados
    return res.status(214).json({
        sessionId,
        ...sessionData
    })
})

// --------------------------------- //

const manager = WAManager.getInstance()
app.locals.manager = manager
await manager.createSession('default')
await manager.createSession('default2')
// await manager.connectSession('default')

manager.emitter.on('qr', ({ sessionId }) => {
    const img = manager.qrCodes.get(sessionId);
    if (img) broadcast({ type: 'qr', sessionId, qr: img });
})

manager.emitter.on('connection.update', (payload) => {
    broadcast({ type: 'connection.update', ...payload })
})

manager.emitter.on('statusChanged', ({ status }) => {
    broadcast({ type: 'status', status })
})

manager.emitter.on('error', ({ sessionId, error }) => {
    broadcast({ type: 'error', sessionId, message: String(error) })
})

manager.emitter.on('message', (payload) => {
    broadcast({ type: 'message', ...payload })
})

server.listen(PORT, () => {
    console.log(`[INFO] API+WS rodando em http://localhost:${PORT}`)
    // console.log(`[DEBUG] sessões: ${[...manager.sessions.keys()]}`)
    // console.log(`[DEBUG] info on session default: ${manager.getSessionInfo('default')}`)
})
