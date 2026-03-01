# AI Round Table — Frontend (Next.js)
# Build context must be repo root (for shared workspace).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared ./shared
COPY frontend ./frontend
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app ./
# Next.js embeds NEXT_PUBLIC_* at build time; browser will call backend on host.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000
ARG NEXT_PUBLIC_USE_MOCK=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK
WORKDIR /app/frontend
RUN npm run build

# In a monorepo, standalone nests server.js (e.g. frontend/server.js) so node_modules resolve correctly.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public
WORKDIR /app/frontend
EXPOSE 3000
CMD ["node", "server.js"]
