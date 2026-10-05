# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DISABLE_ESLINT=1 \
    NODE_OPTIONS=--max-old-space-size=384
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY next.config.js tsconfig.json ./
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY db ./db
COPY requirements-video.txt ./requirements-video.txt
# Render uses the lean Next build only; Cloudflare/OpenNext remains available via npm run build.
RUN npm run build:render

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder /app/requirements-video.txt ./requirements-video.txt
RUN python3 -m venv /opt/pumpclip-video \
    && /opt/pumpclip-video/bin/pip install --no-cache-dir -r requirements-video.txt \
    && mkdir -p data/private \
    && chown -R node:node /app /opt/pumpclip-video
ENV PUMPCLIP_PYTHON=/opt/pumpclip-video/bin/python
USER node
EXPOSE 3000
CMD ["node", "server.js"]
