# Search

Uses AI embeddings to search for similar documents.

## Usage

``` yarn install; yarn start```
Starts the server on port 5000.

## Routes

### POST /embeddings
Send a string or list of strings to receive embeddings for.

#### Single example:
CURL:
```curl -X POST -H "Content-Type: application/json" -d '{"input": "hello world"}' http://localhost:5000/embeddings```

Sample response:
```{"error": false, "embedding": [0.1, 0.2, 0.3, 0.4]}```

#### List example:
CURL:
```curl -X POST -H "Content-Type: application/json" -d '{"input": ["hello", "world"]}' http://localhost:5000/embeddings```

Sample response:
```
{
    "error": false,
    "results": [
        {
            "error": false,
            "embedding": [0.1, 0.2, 0.3, 0.4]
        },
        {
            "error": false,
            "embedding": [0.1, 0.2, 0.3, 0.4]
        }
    ]
}
```

### POST /search
Send a string and list of data strings or embeddings to receive the data sorted by most similar to the input embedding.

#### Example:
CURL:
```curl -X POST -H "Content-Type: application/json" -d '{"input": "hell", "data": ["test", "track", "hello", "world"]}' http://localhost:5000/search```

Sample response:
```{
    "error": false,
    "results": [
        {
            "input": "hello",
            "similarity": 0.863932212554896
        },
        {
            "input": "world",
            "similarity": 0.8628597878658721
        },
        {
            "input":"track",
            "similarity":0.8182238349742279
        },
        {
            "input": "test",
            "similarity": 0.8175459141724035
        }
    ]
}
```

Also you can add the limit parameter to limit the number of results: 
```curl -X POST -H "Content-Type: application/json" -d '{"input": "hell", "data": ["test", "track", "hello", "world"], "limit": 2}' http://localhost:5000/search```

Sample response:
```
{
    "error": false,
    "results": [
        {
            "input": "hello",
            "similarity": 0.863932212554896
        },
        {
            "input": "world",
            "similarity": 0.8628597878658721
        }
    ]
}
```