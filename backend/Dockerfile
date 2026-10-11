FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 app
COPY --from=build /out/server /out/seed /usr/local/bin/
USER app
EXPOSE 8090
ENV PORT=8090
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["server"]
