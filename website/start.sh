#!/bin/bash
if [ -n "$BOT_TOKEN" ]; then
  echo "[Start] Iniciando servidor web + Discord listener..."
  node discord-listener.js &
fi
echo "[Start] Iniciando servidor web..."
exec node server.js
