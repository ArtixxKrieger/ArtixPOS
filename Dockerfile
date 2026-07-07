# ── Build stage: compile TypeScript → JS + build frontend ──
FROM node:24-alpine AS builder

WORKDIR /app

# Dependencies first (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts && npm run postinstall

# Source
COPY . .

# Build: typecheck + compile + frontend bundle
RUN npm run build

# ── Production stage: minimal runtime ──
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy only runtime deps + built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/scripts/railway-start.sh ./scripts/railway-start.sh

EXPOSE 3000

# Health check — Railway uses this to know the container is alive
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["sh", "scripts/railway-start.sh"]
