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
    res.send('ok')
})

const manager = new WAManager()
console.log('[DEBUG] manager criado')
app.locals.manager = manager
manager.createSession('default')
await manager.connectSession('default')

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
