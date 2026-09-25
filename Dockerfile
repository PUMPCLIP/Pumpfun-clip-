FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
RUN python3 -m venv /opt/pumpclip-video && /opt/pumpclip-video/bin/pip install --no-cache-dir -r requirements-video.txt && \
    mkdir -p data/private && chown -R node:node /app
ENV PUMPCLIP_PYTHON=/opt/pumpclip-video/bin/python
USER node
EXPOSE 3000
CMD ["npm","run","start"]
