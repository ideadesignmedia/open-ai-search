require("@ideadesignmedia/config.js")
const { getEmbedding } = require('@ideadesignmedia/open-ai.js')
const { db, makeModels, construct } = require('@ideadesignmedia/db.js')
const app = require('express').Router()
const cosineSimilarity = (a, b) => {
    let dotproduct = 0;
    let mA = 0;
    let mB = 0;
    for (i = 0; i < a.length; i++) {
        dotproduct += a[i] * b[i];
        mA += a[i] * a[i];
        mB += b[i] * b[i];
    }
    return dotproduct / (Math.sqrt(mA) * Math.sqrt(mB))
}
const { Embedding } = makeModels(new db('embeddings'), [
    {
        name: 'Embedding',
        schema: {
            input: 'string',
            embedding: ['number']
        },
        validator: data => {
            return data
        }
    }
])
app.post('/embeddings', async (req, res) => {
    const { input } = req.body
    if (!input) return res.status(400).send('No input provided')
    const multiple = input instanceof Array
    const found = multiple ? await new Embedding().findAll({ input: a => input.includes(a) }).catch(e => {
        console.log(e)
        return []
    }) : await new Embedding().find({ input }).catch(e => {
        console.log(e)
        return undefined
    })
    if (multiple) {
        try {
            const results = []
            const gather = []
            for (let i = 0; i < input.length; i++) {
                const inputData = found.find(a => a.input === input[i])
                if (inputData) results.push({ index: i, embedding: inputData.embedding })
                else gather.push({ index: i, input: input[i] })
            }
            if (gather.length) await getEmbedding(gather.map(a => a.input)).then(async embeddings => {
                if (!embeddings.data) results.push(...gather.map(a => ({ index: a.index, error: true, message: 'Failed to get embedding' })))
                for (let i = 0; i < gather.length; i++) {
                    let a = gather[i]
                    let embedding = embeddings.data.find(a => a.index === i)
                    if (!embedding) return { index: a.index, error: true, message: 'Failed to get embedding' }
                    await construct(Embedding, { input: a.input, embedding: embedding.embedding }).then(data => data.save()).then(({ embedding }) => {
                        results.push({ index: a.index, embedding: embedding })
                    }).catch(e => {
                        console.log(e)
                        results.push({ index: a.index, error: true, message: 'Failed to save embedding' })
                    })
                }
            }).catch(e => {
                console.log(e)
                results.push(...gather.map(a => ({ index: a.index, error: true, message: 'Failed to get embedding' })))
            })
            return res.status(200).json({ error: false, results: results.sort((a, b) => a.index - b.index).map(a => ({ error: a.error || false, message: a.message, embedding: a.embedding })) })
        } catch (e) {
            console.log(e)
            return res.status(500).json({ error: true, message: 'Internal server error.' })
        }
    } else {
        if (found) return res.status(200).json({ error: false, embedding: found.embedding })
        getEmbedding(input).then(async embeddings => {
            const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
            if (!embedding) {
                console.log('BAD EMBEDDING', input, embeddings)
                return res.status(500).json({ error: true, message: 'Failed to get embedding' })
            }
            construct(Embedding, { input, embedding }).then(data => data.save()).then(({ embedding }) => {
                return res.status(200).json({ error: false, embedding })
            }).catch(e => {
                console.log(e)
                return res.status(500).json({ error: true, message: 'Failed to save embedding' })
            })
        }).catch(e => {
            console.log(e)
            return res.status(500).json({ error: true, message: 'Failed to get embedding' })
        })
    }
})
app.post('/search', (req, res) => {
    const { input, data, limit } = req.body
    if (!input) return res.status(400).json({ error: true, message: 'No input provided' })
    if (typeof input !== 'string') return res.status(400).json({ error: true, message: 'Input must be a string' })
    if (!data) return res.status(400).json({ error: true, message: 'No data provided' })
    if (!(data instanceof Array)) return res.status(400).json({ error: true, message: 'Data must be an array' })
    new Embedding().find({ input }).then(async inputEmbedding => {
        if (!inputEmbedding) inputEmbedding = await getEmbedding(input).then(async embeddings => {
            const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
            if (!embedding) return null
            return await construct(Embedding, { input, embedding }).then(data => data.save()).then(({ embedding }) => embedding).catch(e => {
                console.log(e)
                return null
            })
        }).catch(e => {
            console.log(e)
            return null
        })
        if (!inputEmbedding) return res.status(500).json({ error: true, message: 'Failed to get input embedding' })
        const similarData = []
        for (let i = 0; i < data.length; i++) {
            const a = data[i]
            if (!a) continue
            if (a.input && a.embedding instanceof Array && a.embedding.every(a => typeof a === 'number')) {
                similarData.push({ input: a.input, similarity: cosineSimilarity(inputEmbedding.embedding, a.embedding) })
            } else {
                if (a.input) a = a.input
                if (typeof a !== 'string') continue
                const found = await new Embedding().find({ input: a }).catch(e => {
                    console.log(e)
                    return undefined
                })
                if (found) similarData.push({ input: a, similarity: cosineSimilarity(inputEmbedding.embedding, found.embedding) })
                else {
                    const embedding = await getEmbedding(a).then(async embeddings => {
                        const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
                        if (!embedding) return null
                        return await construct(Embedding, { input: a, embedding }).then(data => data.save()).then(({ embedding }) => embedding).catch(e => {
                            console.log(e)
                            return null
                        })
                    }).catch(e => {
                        console.log(e)
                        return null
                    })
                    if (embedding) similarData.push({ input: a, similarity: cosineSimilarity(inputEmbedding.embedding, embedding) })
                }
            }
        }
        try {
            const results = similarData.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
            return res.status(200).json({ error: false, results })
        } catch (e) {
            console.log(e)
            return res.status(500).json({ error: true, message: 'Something went wrong.' })
        }
    }).catch(e => {
        console.log(e)
        return res.status(500).json({ error: true, message: 'Internal server error.' })
    })
})
require('@ideadesignmedia/webserver.js')({ port: process.env.PORT || 5000 }, app)