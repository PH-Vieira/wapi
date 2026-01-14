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

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

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

app.get('/sessions', async (req, res) => {
    console.log('[INFO] GET /sessions')
    const manager = WAManager.getInstance()
    if (!manager) { return res.status(418).json({ error: 'missin manager' }) }
    const sessions = await manager.listSessions()
    return res.status(214).json(sessions)
})

app.post('/sessions/:sessionId/connect', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) { return res.status(417).json({ error: 'sessionId eh obrigatorio' }) }
    console.log(`[INFO] POST /sessions${sessionId}/connect`)
    const manager = WAManager.getInstance()
    if (!manager) { return res.status(418).json({ error: 'missin manager' }) }
    await manager.connectSession(sessionId)
    return res.status(214).json({ message: 'connecting..' })
})

app.post('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) { return res.status(417).json({ error: 'sessionId eh obrigatorio' }) }
    console.log(`[INFO] POST /sessions/${sessionId}`)
    const manager = WAManager.getInstance()
    if (!manager) { return res.status(418).json({ error: 'missin manager' }) }
    try {
        await manager.createSession(sessionId)
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
    return res.status(214).json({ message: `session ${sessionId} created` })
})

app.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params
    const manager = WAManager.getInstance()
    const session = manager.sessions.get(sessionId)

    if (!session) {
        return res.status(418).json({ sessionId, error: `Sessão ${sessionId} não encontrada` })
    }

    const allMessages = {}
    if (session.messages) {
        session.messages.forEach((msgs, jid) => { allMessages[jid] = msgs })
    }

    const info = session.sessionInfo?.get(sessionId) || {}
    const statusReal = info.connection || 'close'

    const responseData = {
        sessionId,
        status: statusReal,
        qrCode: manager.qrCodes.get(sessionId) || null,
        allMessages: allMessages
    }

    console.log(`[INFO] GET /sessions/${sessionId} - Status: ${responseData.status}`)
    return res.status(200).json(responseData)
})

app.post('/sessions/:sessionId/disconnect', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) { return res.status(417).json({ error: 'sessionId eh obrigatorio' }) }
    console.log(`[INFO] POST /sessions${sessionId}/disconnect`)
    const manager = WAManager.getInstance()
    await manager.disconnectSession(sessionId)
    res.json({ message: "sessao desconectada" })
})

app.delete('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) { return res.status(417).json({ error: 'sessionId eh obrigatorio' }) }
    console.log(`[INFO] DELETE /sessions${sessionId}`)
    const manager = WAManager.getInstance()
    await manager.destroySession(sessionId)
    res.json({ message: 'sessao excluida com sucesso' })
})

app.get('/sessions/:sessionId/chats/:chatJid/messages', (req, res) => {
    const { sessionId, chatJid } = req.params;
    const manager = WAManager.getInstance();
    const session = manager.sessions.get(sessionId);

    if (!session) return res.status(404).json({ error: 'sessao nao encontrada' });

    const messages = session.messages.get(chatJid) || [];
    return res.json(messages);
})

app.post('/sessions/:sessionId/chats/:chatJid/messages', async (req, res) => {
    const { sessionId, chatJid } = req.params;
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: 'O texto da mensagem é obrigatório' });

    const manager = WAManager.getInstance();
    const session = manager.sessions.get(sessionId);

    if (!session || !session.sock) {
        return res.status(404).json({ error: 'Sessão não encontrada ou não conectada' });
    }

    try {
        const sentMsg = await session.sock.sendMessage(chatJid, { text });

        const novaMensagem = {
            id: sentMsg.key.id,
            chatJid,
            text,
            fromMe: true,
            pushName: 'Eu',
            timestamp: Math.floor(Date.now() / 1000),
            url: null,
            mimetype: null
        };

        if (!session.messages.has(chatJid)) {
            session.messages.set(chatJid, []);
        }
        session.messages.get(chatJid).push(novaMensagem);

        return res.status(201).json(novaMensagem);
    } catch (err) {
        console.error(`[ERROR] Falha ao enviar mensagem: ${err.message}`);
        return res.status(500).json({ error: 'Erro interno ao enviar mensagem' });
    }
});


// --------------------------------- //

const manager = WAManager.getInstance()
app.locals.manager = manager
await manager.createSession('default')

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
