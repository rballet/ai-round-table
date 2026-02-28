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
