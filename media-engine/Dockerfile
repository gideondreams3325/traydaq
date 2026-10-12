FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY --chown=node:node worker.mjs ./
USER node
ENV NODE_ENV=production TRAYDAQ_MEDIA_ENGINE_ENABLED=false
CMD ["node","worker.mjs"]
