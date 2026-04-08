# hank

A voice AI tutor that teaches house maintenance, built with LiveKit Agents and OpenAI Realtime API

## Quick Start

1. **Backend:** Run the token server / agent stack so the API is available on port **8000** (see backend docs in-repo).

2. **Frontend:** From the `frontend` directory, install and start the dev server:

   ```bash
   cd frontend && pnpm install && pnpm dev
   ```

3. **Environment:** Copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env.local` and set **`BACKEND_URL`** if your backend is not on `http://localhost:8000`. This is a server-side variable used by the Next.js API routes (`/api/token`, `/api/summary`) to proxy requests to the backend. The browser only talks to relative API routes — no backend URL is exposed to the client.
