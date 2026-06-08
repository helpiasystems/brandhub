require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

app.use(express.json())
app.use(cors())
app.use(express.static('public'))

// ============================================================
//  ADAPTADORES DE IA
//  Para adicionar uma nova IA: crie um novo objeto em AI_ADAPTERS
//  com as funções buildRequest() e parseResponse()
// ============================================================
const AI_ADAPTERS = {

  // --- GEMINI (Google) ---
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    buildHeaders: () => ({
      'Content-Type': 'application/json'
    }),
    buildUrl: () => {
      const key = process.env.GEMINI_API_KEY
      if (!key) throw new Error('GEMINI_API_KEY não configurada no .env')
      return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`
    },
    buildRequest: ({ prompt, max_tokens }) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: max_tokens || 1000 }
    }),
    parseResponse: (data) => {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text) throw new Error('Resposta vazia do Gemini: ' + JSON.stringify(data))
      return text
    }
  },

  // --- ANTHROPIC (Claude) ---
  anthropic: {
    buildUrl: () => 'https://api.anthropic.com/v1/messages',
    buildHeaders: () => {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY não configurada no .env')
      return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      }
    },
    buildRequest: ({ prompt, max_tokens }) => ({
      model: 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 1000,
      messages: [{ role: 'user', content: prompt }]
    }),
    parseResponse: (data) => {
      const text = data?.content?.map(i => i.text || '').join('') || ''
      if (!text) throw new Error('Resposta vazia do Claude: ' + JSON.stringify(data))
      return text
    }
  },

  // --- OPENAI (GPT) ---
  // Para ativar: adicione OPENAI_API_KEY no .env e descomente
  // openai: {
  //   buildUrl: () => 'https://api.openai.com/v1/chat/completions',
  //   buildHeaders: () => {
  //     const key = process.env.OPENAI_API_KEY
  //     if (!key) throw new Error('OPENAI_API_KEY não configurada no .env')
  //     return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
  //   },
  //   buildRequest: ({ prompt, max_tokens }) => ({
  //     model: 'gpt-4o-mini',
  //     max_tokens: max_tokens || 1000,
  //     messages: [{ role: 'user', content: prompt }]
  //   }),
  //   parseResponse: (data) => data?.choices?.[0]?.message?.content || ''
  // },

}

// ============================================================
//  ENDPOINT PRINCIPAL
//  POST /api/generate
//  Body: { provider: 'gemini' | 'anthropic', prompt: '...', max_tokens: 1000 }
// ============================================================
app.post('/api/generate', async (req, res) => {
  const { provider = 'gemini', prompt, max_tokens } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'Campo "prompt" é obrigatório' })
  }

  const adapter = AI_ADAPTERS[provider]
  if (!adapter) {
    return res.status(400).json({
      error: `Provider "${provider}" não reconhecido. Disponíveis: ${Object.keys(AI_ADAPTERS).join(', ')}`
    })
  }

  try {
    const url = adapter.buildUrl()
    const headers = adapter.buildHeaders()
    const body = adapter.buildRequest({ prompt, max_tokens })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || 'Erro na API do provider',
        details: data
      })
    }

    const text = adapter.parseResponse(data)
    res.json({ text, provider })

  } catch (err) {
    console.error(`[${provider}] Erro:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// Endpoint para checar quais providers estão configurados
app.get('/api/providers', (req, res) => {
  const status = {}
  for (const [name] of Object.entries(AI_ADAPTERS)) {
    try {
      AI_ADAPTERS[name].buildHeaders()
      status[name] = 'configurado'
    } catch {
      status[name] = 'sem chave no .env'
    }
  }
  res.json(status)
})

app.listen(3000, () => {
  console.log('✅ BrandHub rodando em http://localhost:3000')
  console.log('🤖 Providers disponíveis:', Object.keys(AI_ADAPTERS).join(', '))
})
