# INDECO — Asistent documente (RAG local)

Aplicație web care răspunde la întrebări în limbaj natural **exclusiv pe baza documentelor PDF indexate**, cu citări verificabile (fișier + pagină) și rulare 100% locală: modelele AI sunt serverele Ollama din rețeaua internă, nimic nu pleacă spre servicii externe.

## Arhitectură

```
┌──────────────┐   SSE    ┌──────────────────────────┐        ┌─────────────────────┐
│  React + TS  │ ───────▶ │   Backend Fastify + TS   │ ─────▶ │  Ollama .54 (L40)   │
│  (frontend)  │ ◀─────── │  pipeline RAG propriu    │        │  chat / embed / OCR │
└──────────────┘          └────────────┬─────────────┘        └─────────────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  PostgreSQL + pgvector   │
                          │  documente, fragmente,   │
                          │  vectori, conversații    │
                          └──────────────────────────┘
```

- **Ingestie**: folderul `PDF_DIR` e scanat la pornire și monitorizat continuu (chokidar). Fiecare PDF: extragere text per pagină (`pdfjs-dist`) → paginile fără strat de text trec prin **OCR** (`glm-ocr`) → fragmentare (~1000 caractere, suprapunere 150) → **embeddings** (`bge-m3`, 1024 dim, batch) → PostgreSQL.
- **Idempotență**: identitatea documentului e calea relativă, versiunea e SHA-256 al conținutului. Rescanarea nu dublează nimic; un fișier modificat primește o versiune nouă care devine activă **atomic** (cea veche rămâne interogabilă până la finalizare).
- **Căutare hibridă**: pgvector (cosine, HNSW) + full-text PostgreSQL (`romanian` + unaccent, GIN), fuzionate cu Reciprocal Rank Fusion.
- **Chat**: modelul primește doar întrebarea, istoricul recent și fragmentele recuperate, cu instrucțiuni stricte de grounding; răspunsul curge prin SSE și include citări `[S1]`… mapate pe fișier/pagină/fragment. Dacă informația lipsește, răspunde explicit că nu se regăsește în documente.
- **Observabilitate**: erorile de parsare/OCR/embedding/indexare ajung în tabela `ingestion_events` și în pagina **Administrare**.

## Cerințe

- Node.js ≥ 20 (fără Docker) sau Docker + Docker Compose
- PostgreSQL 16+ cu extensia **pgvector** (`vector`), plus `pg_trgm` și `unaccent`
- Acces la serverele Ollama din rețea (`192.168.100.54` pentru chat/embeddings/OCR)

> ⚠️ **Server PostgreSQL remote (192.168.101.60)**: extensia `vector` cere superuser la instalare. Un administrator trebuie să ruleze o singură dată, în baza `model`:
> ```sql
> CREATE EXTENSION vector;
> ```
> (`pg_trgm` și `unaccent` se instalează automat la migrare.) După aceea `npm run migrate` funcționează cu userul `indeco`.

## Instalare fără Docker

```bash
# 1. Configurare
cp .env.example .env        # ajustează DATABASE_URL / modele / PDF_DIR dacă e nevoie

# 2. Dependințe
npm install

# 3. Schema bazei de date (idempotent)
npm run migrate

# 4. Indexează PDF-urile din folderul documents/ (opțional; pornirea serverului o face oricum)
npm run index

# 5. Pornește backend (3001) + frontend (5173)
npm run dev
```

Deschide **http://localhost:5173**. Pune PDF-uri în `documents/` — sunt indexate automat, inclusiv în timp ce aplicația rulează.

## Rulare cu Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Aplicația (frontend + API) răspunde pe **http://localhost:3001**. Migrațiile rulează automat la pornire. Folderul `./documents` e montat în container.

- **DB pe mașina gazdă?** În `.env` folosește `host.docker.internal` în loc de `localhost`.
- **Fără server PostgreSQL?** Pornește și profilul cu Postgres local (pgvector inclus):
  ```bash
  docker compose --profile localdb up --build
  # și în .env: DATABASE_URL=postgresql://indeco:practica2026@db:5432/model
  ```
  (din afara containerului, DB-ul local e pe portul `5433`)

## Configurare (`.env`)

| Variabilă | Default | Rol |
|---|---|---|
| `DATABASE_URL` | serverul remote INDECO | PostgreSQL + pgvector |
| `OLLAMA_URL_CHAT/EMBED/OCR` | `http://192.168.100.54:11434` | serverele Ollama |
| `CHAT_MODEL` | `gpt-oss:20b` | modelul de generare (143 tok/s pe L40) |
| `EMBED_MODEL` / `EMBED_DIM` | `bge-m3` / `1024` | modelul de embeddings și dimensiunea vectorilor |
| `OCR_MODEL` | `glm-ocr` | OCR pentru pagini scanate |
| `PDF_DIR` | `./documents` | folderul monitorizat |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1000` / `150` | fragmentare |
| `TOP_K_SEMANTIC` / `TOP_K_LEXICAL` / `TOP_N_CONTEXT` | `20` / `20` / `8` | parametri retrieval |
| `OLLAMA_TIMEOUT_MS` / `OLLAMA_KEEP_ALIVE` | `300000` / `30m` | apeluri modele |

> ⚠️ **Schimbarea modelului de embedding** (sau a dimensiunii) invalidează indexul: rulează migrațiile pe o bază curată sau șterge datele (`TRUNCATE documents CASCADE`) și reindexează. Un index construit cu `bge-m3` se interoghează doar cu `bge-m3`. La pornire aplicația verifică potrivirea `EMBED_DIM` cu coloana din DB și raportează nepotrivirile în `/api/health`.

## API (rezumat)

| Metodă & rută | Rol |
|---|---|
| `POST /api/chat` `{question, conversationId?}` | răspuns în flux SSE: `conversation`, `sources`, `token`…, `done` |
| `GET /api/conversations` / `GET /api/conversations/:id/messages` / `DELETE /api/conversations/:id` | persistența conversațiilor |
| `GET /api/documents` | documente indexate + statistici (pagini, fragmente, OCR, erori) |
| `GET /api/admin/status` / `GET /api/admin/events` / `POST /api/admin/reindex` | monitorizare și reindexare |
| `GET /api/health` | DB + Ollama + potrivirea dimensiunii embeddings |

## Teste

```bash
npm test
```

23 de teste: unitare (fragmentare, fuziune RRF, construcția contextului, extragerea citărilor) și de integrare pe rute (Fastify `inject`, Ollama mock-uit; necesită DB accesibil).

## Structură

```
backend/src/services/   pipeline-ul RAG: pdf, chunker, ollama, indexer, watcher, retrieval, chat
backend/migrations/     schema SQL (rulate de npm run migrate)
frontend/src/pages/     Chat (streaming + citări), Admin (documente, jurnal, reindexare)
shared/src/             tipurile comune API
```

## Decizii și limitări

- Pipeline RAG implementat în servicii proprii, fără LangChain (cerință de specificație).
- Modelele `thinking` (gpt-oss) întorc raționamentul în câmp separat — aplicația citește doar `content`.
- Conținutul fragmentelor e tratat ca **date**: promptul de sistem instruiește modelul să ignore instrucțiunile aflate în documente.
- Single-user, fără autentificare (decizie de MVP); conversațiile persistă în DB.
- Paginile fără text și fără rezultat OCR sunt raportate în jurnalul de ingestie, nu blochează restul documentului.
