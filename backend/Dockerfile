# AI Round Table — Backend (FastAPI)
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Default env (override via docker-compose or .env)
ENV DATABASE_URL=sqlite+aiosqlite:///./ai_round_table.db

# Run migrations then start the server (compose mounts volume at /app/data when using data/ path)
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]

EXPOSE 8000
