require("@ideadesignmedia/config.js")
const { getEmbedding } = require('@ideadesignmedia/open-ai.js')
const { db, makeModels } = require('@ideadesignmedia/db.js')
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
    const found = multiple ? new Embedding().findAll({ input: a => input.includes(a) }).catch(e => {
        console.log(e)
        return []
    }) : new Embedding().find({ input }).catch(e => {
        console.log(e)
        return null
    })
    if (multiple) {
        try {
            const results = []
            for (let i = 0; i < input.length; i++) {
                const inputData = found.find(a => a.input === input[i])
                if (inputData) {
                    results.push(inputData)
                    continue
                }
                await getEmbedding(input[i]).then(async embeddings => {
                    const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
                    if (!embedding) {
                        console.log('BAD EMBEDDING', input, embeddings)
                        return results.push({ error: true, message: 'Failed to get embedding' })
                    }
                    return await construct(Embedding, { input, embedding }).save().then(({ embedding }) => {
                        results.push({ error: false, embedding })
                    }).catch(e => {
                        console.log(e)
                        results.push({ error: true, message: 'Failed to get embedding' })
                    })
                }).catch(e => {
                    console.log(e)
                    results.push({ error: true, message: 'Failed to get embedding' })
                })
            }
            return res.status(200).json({ error: false, results })
        } catch (e) {
            console.log(e)
            return res.status(500).json({ error: true, message: 'Internal server error.' })
        }
    } else {
        if (found) return res.status(200).json({ error: false, })
        getEmbedding(input).then(async embeddings => {
            const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
            if (!embedding) {
                console.log('BAD EMBEDDING', input, embeddings)
                return res.status(500).json({ error: true, message: 'Failed to get embedding' })
            }
            construct(Embedding, { input, embedding }).save().then(({ embedding }) => {
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
    const { input, data } = req.body
    if (!input) return res.status(400).json({ error: true, message: 'No input provided' })
    if (typeof input !== 'string') return res.status(400).json({ error: true, message: 'Input must be a string' })
    if (!data) return res.status(400).json({ error: true, message: 'No data provided' })
    if (!(data instanceof Array)) return res.status(400).json({ error: true, message: 'Data must be an array' })
    if (!data.every(a => a && a.embedding instanceof Array && a.embedding.every(a => typeof a === 'number'))) return res.status(400).json({ error: true, message: 'Data must be an array of objects with an embedding' })
    new Embedding().find({ input }).then(async inputEmbedding => {
        if (!inputEmbedding) inputEmbedding = await getEmbedding(input).then(async embeddings => {
            const embedding = embeddings && embeddings.data ? embeddings.data[0].embedding : null
            if (!embedding) return null
            return await construct(Embedding, { input, embedding }).save().then(({ embedding }) => embedding).catch(e => {
                console.log(e)
                return null
            })
        }).catch(e => {
            console.log(e)
            return null
        })
        if (!inputEmbedding) return res.status(500).json({ error: true, message: 'Failed to get input embedding' })
        try {
            const results = data.sort((a, b) => {
                if (!a.similarity) a.similarity = cosineSimilarity(inputEmbedding.embedding, a.embedding)
                if (!b.similarity) b.similarity = cosineSimilarity(inputEmbedding.embedding, b.embedding)
                return b.similarity - a.similarity
            })
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