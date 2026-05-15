# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# NOTE: do NOT use --ignore-scripts — native packages like esbuild need
# their postinstall step to download the correct platform binary.
RUN npm ci

COPY . .
RUN npm run build

# Prune dev dependencies so only production deps end up in the final image
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Copy built artifacts + production node_modules from builder
COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# Use cluster mode to utilise all CPU cores
CMD ["node", "dist/cluster.cjs"]
