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
    return res.status(214).json('ok')
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
    const { text, media, mimetype, isPtt } = req.body;

    console.log(`[DEBUG] Envio recebido - Text: ${!!text}, Media: ${!!media}, Mime: ${mimetype}`);

    // Validação básica: precisa de texto OU mídia
    if (!text && !media) {
        return res.status(400).json({ error: "Conteúdo da mensagem é obrigatório" });
    }

    const manager = WAManager.getInstance();
    const session = manager.sessions.get(sessionId);

    if (!session || !session.sock) {
        return res.status(404).json({ error: 'Sessão não conectada' });
    }

    try {
        let payload = {};
        let mediaBuffer = null;

        // 1. Processamento de Mídia (se houver)
        if (media) {
            // Remove o cabeçalho do Base64 (ex: data:image/png;base64,)
            const base64Data = media.split(',')[1] || media;
            mediaBuffer = Buffer.from(base64Data, 'base64');

            if (mimetype.includes('image')) {
                // Se for imagem ou figurinha (o Baileys diferencia pelo método ou flag)
                payload = { image: mediaBuffer, caption: text };
            } else if (mimetype.includes('audio')) {
                payload = {
                    audio: mediaBuffer,
                    mimetype: 'audio/mp4', // Padrão WhatsApp para compatibilidade
                    ptt: isPtt // Se true, envia como nota de voz
                };
            }
        } else {
            // 2. Apenas Texto
            payload = { text };
        }

        // 3. Envio via Baileys
        const sentMsg = await session.sock.sendMessage(chatJid, payload);

        // 4. Montagem do objeto de resposta para o Front-end
        const novaMensagem = {
            id: sentMsg.key.id,
            chatJid,
            chatName: session.messages.get(chatJid)?.[0]?.chatName || chatJid,
            text: text || (media ? (mimetype.includes('image') ? '[imagem]' : '[áudio]') : ''),
            fromMe: true,
            pushName: 'Eu',
            timestamp: Math.floor(Date.now() / 1000),
            url: media ? media : null, // Retorna o próprio base64 para exibição imediata
            mimetype: mimetype || null
        };

        // 5. Salva no histórico da sessão
        if (!session.messages.has(chatJid)) {
            session.messages.set(chatJid, []);
        }
        session.messages.get(chatJid).push(novaMensagem);

        // Limite de cache (ex: manter últimas 50)
        if (session.messages.get(chatJid).length > 50) {
            session.messages.get(chatJid).shift();
        }

        return res.status(201).json(novaMensagem);

    } catch (err) {
        console.error(`[ERROR] Erro ao processar envio: ${err.message}`);
        return res.status(500).json({ error: 'Erro interno ao enviar mensagem' });
    }
})

// --------------------------------- //

const manager = WAManager.getInstance()
app.locals.manager = manager
await manager.createSession('default')

const eventsToForward = ['connection', 'qr', 'message', 'mappings', 'presence', 'chats', 'contacts']

eventsToForward.forEach(eventType => {
    manager.emitter.on(eventType, (payload) => {
        broadcast({
            type: eventType,
            sessionId: payload?.sessionId || 'teste',
            data: payload?.data || 'teste'
        })
    })
})

// manager.emitter.on('qr', ({ sessionId }) => {
//     const img = manager.qrCodes.get(sessionId);
//     if (img) broadcast({ type: 'qr', sessionId, data: img });
// })

// manager.emitter.on('connection.update', (payload) => {
//     broadcast({ type: 'connection.update', ...payload })
// })

// manager.emitter.on('statusChanged', ({ status }) => {
//     broadcast({ type: 'status', data: status })
// })

// manager.emitter.on('error', ({ sessionId, error }) => {
//     broadcast({ type: 'error', sessionId, data: String(error) })
// })

// manager.emitter.on('message', (payload) => {
//     broadcast({ type: 'message', ...payload })
// })

server.listen(PORT, () => {
    console.log(`[INFO] API+WS rodando em http://localhost:${PORT}`)
    // console.log(`[DEBUG] sessões: ${[...manager.sessions.keys()]}`)
    // console.log(`[DEBUG] info on session default: ${manager.getSessionInfo('default')}`)
})
