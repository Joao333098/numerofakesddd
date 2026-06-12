#!/bin/bash
echo "[Start] Iniciando servidor web..."
node server.js &
SERVER_PID=$!

echo "[Start] Iniciando Discord listener..."
node discord-listener.js &
LISTENER_PID=$!

echo "[Start] Ambos rodando. PID server=$SERVER_PID, listener=$LISTENER_PID"
wait
