# hank

A voice AI tutor that teaches house maintenance, built with LiveKit Agents and OpenAI Realtime API

## Quick Start

1. **Backend:** Run the token server / agent stack so the API is available on port **8000** (see backend docs in-repo).

2. **Frontend:** From the `frontend` directory, install and start the dev server:

   ```bash
   cd frontend && pnpm install && pnpm dev
   ```

3. **Environment:** Copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env.local` and set **`NEXT_PUBLIC_BACKEND_URL`** to the same base URL as your backend (default `http://localhost:8000`). The browser uses this variable to poll session summaries after a call ends. Restart `pnpm dev` after changing it.

The repo root [`.env.example`](.env.example) also documents `NEXT_PUBLIC_BACKEND_URL` for reference.
