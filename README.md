# dns benchmark pro

a fresh, production-style dns benchmark app.

## architecture

- frontend: react + tailwind + recharts
- backend: cloudflare worker api
- hosting: cloudflare pages for the frontend, cloudflare worker for the api

## what it does

- benchmarks major dns providers through the worker backend
- compares popular websites
- shows fastest resolver ranking
- shows chart + site averages
- supports single domain lookup
- supports dark/light theme
- keeps the response format strictly json

## local development

### 1) start the worker

```bash
cd worker
npm install
npm run dev
```

the worker runs on `http://127.0.0.1:8787`.

### 2) start the frontend

create a `.env.local` file inside `frontend`:

```bash
vite_api_base=http://127.0.0.1:8787
```

then run:

```bash
cd frontend
npm install
npm run dev
```

## deployment

### cloudflare worker
deploy the `worker` folder as a cloudflare worker.

### cloudflare pages
deploy the `frontend` folder to cloudflare pages.

set the pages environment variable:

```bash
vite_api_base=https://your-worker.your-subdomain.workers.dev
```

## files

- `frontend/` → ui
- `worker/` → api

## update
- `Last updated/`:4 June 2026