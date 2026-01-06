// libs
import express from 'express'
import cors from 'cors'
import { WAManager } from './models/WAManager.js'
// --------------------------------------------- //

const PORT = 3000

const app = express()

app.use(cors({
    origin: 'http://localhost:5173',
}))

app.use(express.json())

// ------------ ROTAS -------------- //

app.get('/', ( req, res ) => {
    console.log('[INFO] GET / 200 OK')
    res.set('X-Created-By', 'amogus?')
    res.send('Bolsonaro 2026!')
})

app.get('/sessions', (req, res) => {
    const { manager } = req.app.locals

    if (!manager) {
        res.status(204)
        res.send('No manager')
        console.log('[INFO] GET /sessions 204 no content')
    }
    
    console.log('[INFO] GET /sessions 200 OK')
    res.json({
        ids: [...manager.sessions.keys()],
        count: manager.sessions.size
    })
})

app.post('/sessions', (req, res) => {
    if (!req?.body?.sessionId) return
    const { manager } = req.app.locals
    if (!manager) return
    manager.createSession(req.body.sessionId)
})

// ------------- Start API --------------- //
app.listen(PORT, () => {
    console.log(`[INFO] API rodando em http://localhost:${PORT}`)
    console.log(`[INFO] Criando manager`)
    const manager = new WAManager()
    app.locals.manager = manager
    console.log(`[DEBUG] sessões: ${[...manager.sessions.keys()]}`)
})
