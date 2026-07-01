#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/tools/docker-up.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "ps" ]]; then
  exit 0
fi
if [[ "$1" == "compose" && "$2" == "version" ]]; then
  echo "docker: unknown command: docker compose" >&2
  exit 1
fi
echo "unexpected docker args: $*" >&2
exit 2
EOF

cat > "$tmp_dir/docker-compose" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then
  echo "docker-compose version 1.29.2"
  exit 0
fi
if [[ "$*" == *" build" || "$*" == *" up -d" || "$*" == *" ps" ]]; then
  exit 0
fi
echo "unexpected docker-compose args: $*" >&2
exit 2
EOF

chmod +x "$tmp_dir/docker" "$tmp_dir/docker-compose"

output="$(PATH="$tmp_dir:$PATH" DOCKER_UP_PRINT_COMPOSE=1 "$SCRIPT")"

if [[ "$output" != "docker-compose" ]]; then
  echo "expected docker-compose fallback, got: $output" >&2
  exit 1
fi

PATH="$tmp_dir:$PATH" USE_PROXY=1 "$SCRIPT" build-up >/dev/null

echo "ok"
