# Single-container image for Render: the Go API and the Next.js website run side by side.
# Next listens on Render's $PORT and proxies /api/* to the API on 127.0.0.1:8090, so the
# browser and the mobile app both talk to one HTTPS origin. Build context: repository root.

FROM golang:1.26-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM node:22-alpine AS web
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
ENV API_URL=http://127.0.0.1:8090 NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000
COPY --from=api /out/server /out/seed /usr/local/bin/
COPY --from=web /app/.next/standalone ./
COPY --from=web /app/.next/static ./.next/static
COPY --from=web /app/public ./public
COPY deploy/render/start.sh /usr/local/bin/start.sh
USER node
EXPOSE 10000
CMD ["/bin/sh", "/usr/local/bin/start.sh"]
