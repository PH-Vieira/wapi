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

// app.get('/manager', (req, res) => {
//     console.log(`[INFO] GET /manager`)
//     const { manager } = req.app.locals
//     if ( !manager ) {
//         return res.json({
//             running: false,
//             reason: "no_manager"
//         })
//     } else {
//         return res.json({
//             running: true,
//             reason: "manager_ok"
//         })
//     }
// })

// app.get('/manager/start', (req, res) => {
//     console.log(`[INFO] GET /manager/start`)
//     const { _manager } = req.app.locals
//     if (_manager) {
//         return res.json({
//             running: true,
//             reason: "manager_ok"
//         })
//     }
//     const manager = new WAManager()
//     manager.qrCodes = new Map()
//     manager.onQR = async (sessionId, qr) => {
//         const image = await QRCode.toDataURL(qr, {
//             errorCorrectionLevel: 'H',
//             scale: 8,
//             margin: 1
//         })
//         manager.qrCodes.set(sessionId, image)
//     }
//     app.locals.manager = manager
//     return res.json({
//         running: true,
//         reason: "manager_created"
//     })
// })

// app.get('/manager/stop', (req, res) => {
//     const { manager } = req.app.locals
//     if ( !manager ) return
//     console.log(`[DEBUG] ${Object.keys(manager)}`)
//     console.log(`${[...manager.sessions.keys()]}`)
//     manager.destructor()
//     return res.json({
//         "ok": "ok"
//     })
// })

// app.get('/sessions', (req, res) => {
//     const { manager } = req.app.locals

//     if (!manager) return res.status(500).send('Manager não inicializado')

//     console.log('[INFO] GET /sessions 200 OK')
//     res.json({
//         ids: [...manager.sessions.keys()],
//         count: manager.sessions.size
//     })
// })

// app.post('/sessions', (req, res) => {
//     const { sessionId } = req.body
//     if (!sessionId) { console.log(`[DEBUG] no session id, ${sessionId}`); return res.status(400).send('sessionId é obrigatório') }
//     const { manager } = req.app.locals
//     if (!manager) return res.status(500).send('Manager não inicializado')
//     manager.createSession(req.body.sessionId)
//     res.send(`Session ${sessionId} created`)
// })

// app.get('/sessions/:sessionId', (req, res) => {
//     const { sessionId } = req.params
//     const { manager } = req.app.locals
//     console.log(`[INFO] GET /session/${sessionId} 200 OK`)
//     res.send(manager.getSessionInfo(sessionId))
// })

// app.post('/sessions/:sessionId', async (req, res) => {
//     const { sessionId } = req.params
//     if (!sessionId) return res.status(400).send('sessionId é obrigatório')

//     const { manager } = req.app.locals
//     if (!manager) return res.status(500).send('Manager não inicializado')

//     if (manager.isConnected(sessionId)) return res.status(200).send('Sessão já iniciada')

//     try {
//         await manager.conectar(sessionId)
//         console.log(`[INFO] POST /sessions/${sessionId} 200 OK`)
//         res.status(200).send(`Sessão ${sessionId} conectando... QR no terminal`)
//     } catch (err) {
//         console.log(`[ERROR] ${err}`)
//         res.status(500).send('Erro ao conectar sessão')
//     }
// })

// app.delete('/sessions/:sessionId', async (req, res) => {
//     const { sessionId } = req.params
//     if (!sessionId) return res.status(400).send('sessionId é obrigatório')

//     const { manager } = req.app.locals
//     if (!manager) return res.status(500).send('Manager não inicializado')

//     if (!manager.isConnected(sessionId)) return res.status(200).send('Sessão não iniciada')

//     try {
//         await manager.disconnect(sessionId)
//         console.log(`[INFO] DELETE /sessions/${sessionId} 200 OK`)
//         res.status(200).send(`Sessão ${sessionId} disconectando...`)
//     } catch (err) {
//         console.log(`[ERROR] ${err}`)
//         res.status(500).send('Erro ao disconectar sessão')
//     }
// })

// app.get('/sessions/:sessionId/qr', (req, res) => {
//     const { sessionId } = req.params
//     console.log(`[DEBUG] checking qr code for ${sessionId ? sessionId : ''}`)
//     const { manager } = req.app.locals

//     const qr = manager.qrCodes.get(sessionId)

//     if (!qr) return res.status(404).json({ qr: null })

//     res.json({ qr })
// })

// ------------- Start API --------------- //
// console.log(`[INFO] Criando manager`)
// const manager = new WAManager()
// manager.qrCodes = new Map()
// manager.onQR = async (sessionId, qr) => {
//     const image = await QRCode.toDataURL(qr, {
//         errorCorrectionLevel: 'H',
//         scale: 8,
//         margin: 1
//     })
//     manager.qrCodes.set(sessionId, image)
// }
// app.locals.manager = manager
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

server.listen(PORT, () => {
    console.log(`[INFO] API+WS rodando em http://localhost:${PORT}`)
    // console.log(`[DEBUG] sessões: ${[...manager.sessions.keys()]}`)
    // console.log(`[DEBUG] info on session default: ${manager.getSessionInfo('default')}`)
})
