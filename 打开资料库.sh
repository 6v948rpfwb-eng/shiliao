#!/bin/bash
# 一键启动拾料 并打开浏览器
set -u
cd "$(dirname "$0")"

[ -f .env.local ] && . ./.env.local

PORT="${SHILIAO_PORT:-8781}"
URL="http://127.0.0.1:${PORT}/"

NODE="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)"
if [ -z "${NODE:-}" ]; then
  echo "找不到 node。"
  exit 1
fi

if curl -s --max-time 2 "${URL}api/health" >/dev/null 2>&1; then
  echo "已经在跑了：${URL}"
  open "$URL"
  exit 0
fi

ARGS=(serve.js --port "${PORT}")
[ -n "${SHILIAO_ROOT:-}" ] && ARGS+=(--root "${SHILIAO_ROOT}")

nohup "$NODE" "${ARGS[@]}" >/tmp/shiliao-server.log 2>&1 &

for i in $(seq 1 40); do
  if curl -s --max-time 1 "${URL}api/health" >/dev/null 2>&1; then
    echo "已启动：${URL}"
    open "$URL"
    exit 0
  fi
  sleep 0.25
done

echo "启动失败，看日志：/tmp/shiliao-server.log"
tail -20 /tmp/shiliao-server.log
exit 1
