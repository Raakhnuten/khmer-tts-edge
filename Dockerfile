# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ ffmpeg

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# ---- Production Stage ----
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY public/ ./public/

RUN mkdir -p /app/output && chown -R node:node /app/output

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.js"]
