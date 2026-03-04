#!/bin/bash
cd "$(dirname "$0")/backend"
echo "[KeyZero] A iniciar backend em $(pwd)"
node server.js
