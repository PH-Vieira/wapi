// libs
import express from 'express'
import cors from 'cors'
import { WAManager } from './models/WAManager.js'
import QRCode from 'qrcode'
// --------------------------------------------- //

const PORT = 3000

const app = express()

app.use(cors({
    origin: 'http://localhost:5173',
}))

app.use(express.json())

// ------------ ROTAS -------------- //

app.get('/', (req, res) => {
    console.log('[INFO] GET / 200 OK')
    res.set('X-Created-By', 'amogus?')
    res.send('Bolsonaro 2026!')
})

app.get('/manager', (req, res) => {
    console.log(`[INFO] GET /manager`)
    const { manager } = req.app.locals
    if ( !manager ) {
        return res.json({
            running: false,
            reason: "no_manager"
        })
    }
})

app.get('/manager/start', (req, res) => {
    const { _manager } = req.app.locals
    if (_manager) {
        res.json({
            "answer": 1
        })
    }
    const manager = new WAManager()
    manager.qrCodes = new Map()
    manager.onQR = async (sessionId, qr) => {
        const image = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'H',
            scale: 8,
            margin: 1
        })
        manager.qrCodes.set(sessionId, image)
    }
    app.locals.manager = manager
})

app.get('/manager/stop', (req, res) => {

})

app.get('/sessions', (req, res) => {
    const { manager } = req.app.locals

    if (!manager) return res.status(500).send('Manager não inicializado')

    console.log('[INFO] GET /sessions 200 OK')
    res.json({
        ids: [...manager.sessions.keys()],
        count: manager.sessions.size
    })
})

app.post('/sessions', (req, res) => {
    const { sessionId } = req.body
    if (!sessionId) { console.log(`[DEBUG] no session id, ${sessionId}`); return res.status(400).send('sessionId é obrigatório') }
    const { manager } = req.app.locals
    if (!manager) return res.status(500).send('Manager não inicializado')
    manager.createSession(req.body.sessionId)
    res.send(`Session ${sessionId} created`)
})

app.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params
    const { manager } = req.app.locals
    console.log(`[INFO] GET /session/${sessionId} 200 OK`)
    res.send(manager.getSessionInfo(sessionId))
})

app.post('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).send('sessionId é obrigatório')

    const { manager } = req.app.locals
    if (!manager) return res.status(500).send('Manager não inicializado')

    if (manager.isConnected(sessionId)) return res.status(200).send('Sessão já iniciada')

    try {
        await manager.conectar(sessionId)
        console.log(`[INFO] POST /sessions/${sessionId} 200 OK`)
        res.status(200).send(`Sessão ${sessionId} conectando... QR no terminal`)
    } catch (err) {
        console.log(`[ERROR] ${err}`)
        res.status(500).send('Erro ao conectar sessão')
    }
})

app.delete('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).send('sessionId é obrigatório')

    const { manager } = req.app.locals
    if (!manager) return res.status(500).send('Manager não inicializado')

    if (!manager.isConnected(sessionId)) return res.status(200).send('Sessão não iniciada')

    try {
        await manager.disconnect(sessionId)
        console.log(`[INFO] DELETE /sessions/${sessionId} 200 OK`)
        res.status(200).send(`Sessão ${sessionId} disconectando...`)
    } catch (err) {
        console.log(`[ERROR] ${err}`)
        res.status(500).send('Erro ao disconectar sessão')
    }
})

app.get('/sessions/:sessionId/qr', (req, res) => {
    const { sessionId } = req.params
    console.log(`[DEBUG] checking qr code for ${sessionId ? sessionId : ''}`)
    const { manager } = req.app.locals

    const qr = manager.qrCodes.get(sessionId)

    if (!qr) return res.status(404).json({ qr: null })

    res.json({ qr })
})

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
app.listen(PORT, () => {
    console.log(`[INFO] API rodando em http://localhost:${PORT}`)
    // console.log(`[DEBUG] sessões: ${[...manager.sessions.keys()]}`)
    // console.log(`[DEBUG] info on session default: ${manager.getSessionInfo('default')}`)
})
