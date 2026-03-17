# Transaction Classifier

The classifier flags transactions only when they match one of the user's active pacts. It runs as a pact-aware two-layer pipeline: a fast keyword layer followed by an optional LLM layer powered by Ollama.

## Pipeline

```
POST /api/transactions
        │
        ▼
┌─────────────────┐
│  Pact keywords    │──▶ keyword match for an active pact? ──▶ flagged immediately
│  (instant)        │
└─────────────────┘
        │ no match
        ▼
┌─────────────────┐
│  Ollama LLM      │──▶ LLM matches an active pact? ──▶ flagged with LLM reason
│  (optional)      │──▶ LLM says safe?              ──▶ saved unflagged
│  10s timeout     │──▶ Ollama down/slow?           ──▶ saved unflagged
└─────────────────┘
        │
        ▼
   Transaction saved to DB
```

Every transaction goes through this pipeline in `classify_transaction()` before being persisted. The classification result (category, flagged, flag_reason) is stored on the transaction row.

If the user has no active pacts, the classifier does nothing and the transaction is saved unflagged.

## Pact Categories

Only the user's active pact categories can flag a transaction. Some categories have built-in keyword support:

| Category   | What it catches                                      |
|------------|------------------------------------------------------|
| `gambling` | Casinos, sports betting, lottery, poker              |
| `adult`    | Pornography, adult entertainment, escort services    |
| `alcohol`  | Liquor stores, bars, breweries, alcohol purchases    |
| `drugs`    | Dispensaries, smoke shops, drug paraphernalia         |

Other preset categories like `coffee shops`, `ride share`, and `online shopping` also have keyword lists. Custom pact categories fall back to simple substring matching first, then the LLM can make a pact-aware decision.

## Layer 1: Pact Keywords

Defined in `_match_user_pacts()`. Matches the merchant name and description against keyword lists, but only for categories the user currently has active:

- `GAMBLING_KEYWORDS` — draftkings, fanduel, betmgm, roobet, casino, etc.
- `ADULT_KEYWORDS` — onlyfans, strip club, escort, etc.
- `ALCOHOL_KEYWORDS` — liquor, total wine, bevmo, bar tab, pub, etc.
- `DRUG_KEYWORDS` — dispensary, cannabis, smoke shop, etc.

Matching is case-insensitive substring search against `"{merchant} {description}"`. If a keyword matches one of the user's active pact categories, the transaction is flagged instantly without calling the LLM.

To add new keywords, edit the lists at the top of `classifier.py`.

## Layer 2: Ollama LLM

Implemented by the Ollama adapter in `backend/infrastructure/classifiers/ollama.py`. It only runs when the keyword layer does not flag and the user has at least one active pact.

- Sends the transaction (merchant, description, amount) to Ollama's `/api/generate` endpoint
- Uses a structured prompt that only lists the user's active pact categories
- Parses the JSON response and returns a `ClassificationResult`
- Ignores any LLM category that is not one of the user's active pacts

### Failure handling

The LLM layer is fully optional. If Ollama is unreachable, slow, or returns unparseable output, the transaction is saved unflagged. Specific cases:

| Failure                  | Behavior                                    |
|--------------------------|---------------------------------------------|
| `OLLAMA_ENABLED=false`   | LLM layer skipped entirely                  |
| Ollama not running       | Logged as warning, transaction saved unflagged |
| Request timeout (>10s)   | Logged as warning, transaction saved unflagged |
| Unparseable LLM response | Logged as warning, transaction saved unflagged |
| HTTP error from Ollama   | Logged as warning, transaction saved unflagged |

## Configuration

Set in `backend/config.py` (overridable via environment variables):

| Variable         | Default                    | Description                      |
|------------------|----------------------------|----------------------------------|
| `OLLAMA_ENABLED` | `true`                     | Enable/disable the LLM layer     |
| `OLLAMA_URL`     | `http://localhost:11434`   | Ollama API base URL              |
| `OLLAMA_MODEL`   | `llama3.2:1b`              | Model to use for classification  |

### Local development

Install and run Ollama natively:

```bash
curl -fsSL https://ollama.com/install.sh | sudo sh
ollama serve
ollama pull llama3.2:1b
```

The default `OLLAMA_URL` (`http://localhost:11434`) works out of the box.

### EC2 Docker deployment

Ollama runs as a Docker container defined in `docker-compose.prod.yml`. The API container uses `OLLAMA_URL=http://ollama:11434` to reach it over the Docker network.

After first deploy, pull the model:

```bash
docker exec bank_ollama ollama pull llama3.2:1b
```

The model is persisted in the `ollama_data` Docker volume.

## Code Location

- Rule-based orchestration lives in `backend/services/classifier.py`.
- The external Ollama integration lives in `backend/infrastructure/classifiers/ollama.py`.
