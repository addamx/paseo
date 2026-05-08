#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-4173}"
SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
SERVER_PORT="${SERVER_PORT:-6767}"
SERVER_LISTEN="${PASEO_LISTEN:-${SERVER_HOST}:${SERVER_PORT}}"
WEB_DAEMON_ENDPOINT="${WEB_DAEMON_ENDPOINT:-${EXPO_PUBLIC_LOCAL_DAEMON:-localhost:${SERVER_PORT}}}"
APP_LOG="${APP_LOG:-app.log}"
SERVER_LOG="${SERVER_LOG:-server.log}"
PID_DIR="${PID_DIR:-.paseo-run}"

kill_port() {
  local port="$1"
  local pids

  # Clear old app/server listeners so nohup does not exit immediately on port conflicts.
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [ -n "$pids" ]; then
    echo "Killing processes listening on port $port: $pids"
    kill $pids || true
    sleep 1
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids || true
  fi
}

echo "Building web..."
EXPO_PUBLIC_LOCAL_DAEMON="$WEB_DAEMON_ENDPOINT" npm run build:web

echo "Building server dependencies..."
npm run build --workspace=@getpaseo/relay

echo "Building server..."
npm run build --workspace=@getpaseo/server

kill_port "$APP_PORT"
kill_port "$SERVER_PORT"

mkdir -p "$PID_DIR"

echo "Starting server..."
nohup env \
  PASEO_LISTEN="$SERVER_LISTEN" \
  PASEO_CORS_ORIGINS="${PASEO_CORS_ORIGINS:-*}" \
  npm run start --workspace=@getpaseo/server >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
printf "%s\n" "$SERVER_PID" >"$PID_DIR/server.pid"

echo "Starting app..."
nohup env \
  HOST="$APP_HOST" \
  PORT="$APP_PORT" \
  npm run serve:web >"$APP_LOG" 2>&1 &
APP_PID=$!
printf "%s\n" "$APP_PID" >"$PID_DIR/app.pid"

echo "Server started: ${SERVER_LISTEN} (pid ${SERVER_PID}, log ${SERVER_LOG})"
echo "App started: http://${APP_HOST}:${APP_PORT} (pid ${APP_PID}, log ${APP_LOG})"
