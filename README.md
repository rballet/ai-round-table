# AI Round Table

## Setup Instructions

### Backend
1. `cd backend`
2. `python -m venv venv`
3. `source venv/bin/activate`
4. `pip install -r requirements.txt`
5. Create `.env` from `.env.example`
6. `uvicorn main:app --reload`

### Frontend
1. `npm install`
2. Create `frontend/.env.local` from `frontend/.env.example`
3. `cd frontend && npm run dev`

## Docker (backend + frontend)

Run both services with Docker Compose (useful for testing the full stack):

```bash
# Optional: set API keys for real LLM providers (backend)
export OPENAI_API_KEY=your-key
export ANTHROPIC_API_KEY=your-key

docker compose up --build
```

- **Backend:** http://localhost:8000 (API + WebSocket)
- **Frontend:** http://localhost:3000

The frontend is built with `NEXT_PUBLIC_API_URL=http://localhost:8000` so the browser talks to the backend on the host. Backend SQLite data is stored in a Docker volume `backend_data`.
