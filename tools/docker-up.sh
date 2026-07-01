#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.docker}"
ENV_EXAMPLE="$ROOT_DIR/.env.docker.example"
PROXY_URL="${PROXY_URL:-http://127.0.0.1:10808}"
NO_PROXY_VALUE="${NO_PROXY_VALUE:-localhost,127.0.0.1,::1,172.17.0.0/16}"
USE_PROXY="${USE_PROXY:-auto}"
ACTION="${1:-build-up}"

usage() {
  cat <<'EOF'
用法:
  tools/docker-up.sh [build-up|build|up|down|ps|logs|configure-daemon-proxy]

常用:
  tools/docker-up.sh
  tools/docker-up.sh build
  tools/docker-up.sh up
  tools/docker-up.sh logs

代理环境变量:
  PROXY_URL=http://127.0.0.1:10808   构建容器内 pip/npm/apk 使用的宿主机代理
  USE_PROXY=auto|1|0                 auto 会在本机代理端口监听时启用代理
  NO_PROXY_VALUE=localhost,127.0.0.1,::1,172.17.0.0/16

说明:
  - build/build-up 默认通过临时 compose override 使用 host 网络构建。
  - host 网络构建时，Dockerfile 的 RUN 命令可以访问宿主机 127.0.0.1:10808。
  - 拉取 FROM 基础镜像由 Docker daemon 执行；如拉镜像失败，先运行:
      tools/docker-up.sh configure-daemon-proxy
EOF
}

die() {
  echo "错误: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$ENV_EXAMPLE" ]] || die "找不到 $ENV_EXAMPLE"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    info "已创建 $ENV_FILE，请确认 AUTH_ADMIN_PASSWORD 后再启动。"
  fi
}

docker_cmd() {
  if docker ps >/dev/null 2>&1; then
    printf 'docker'
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    printf 'sudo docker'
    return
  fi

  die "当前用户无法访问 Docker，且找不到 sudo。请把用户加入 docker 组或使用 root。"
}

compose_cmd() {
  local docker_bin="$1"
  if $docker_bin compose version >/dev/null 2>&1; then
    printf '%s compose' "$docker_bin"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    printf 'docker-compose'
    return
  fi

  if [[ "$docker_bin" == "sudo docker" && -x "$HOME/.docker/cli-plugins/docker-compose" ]]; then
    info "sudo docker compose 不可用，尝试安装用户级 Compose 插件到系统级目录。"
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo cp "$HOME/.docker/cli-plugins/docker-compose" /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi

  if $docker_bin compose version >/dev/null 2>&1; then
    printf '%s compose' "$docker_bin"
    return
  fi

  die "Docker Compose 不可用。请先安装 Compose 插件。"
}

proxy_enabled() {
  case "$USE_PROXY" in
    1|true|yes|on) return 0 ;;
    0|false|no|off) return 1 ;;
    auto)
      local host_port
      host_port="${PROXY_URL##*:}"
      host_port="${host_port%%/*}"
      ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${host_port}$"
      return
      ;;
    *) die "USE_PROXY 只能是 auto、1 或 0" ;;
  esac
}

write_proxy_override() {
  local override_file="$1"
  cat > "$override_file" <<EOF
services:
  backend:
    build:
      network: host
      args:
        HTTP_PROXY: "$PROXY_URL"
        HTTPS_PROXY: "$PROXY_URL"
        http_proxy: "$PROXY_URL"
        https_proxy: "$PROXY_URL"
        NO_PROXY: "$NO_PROXY_VALUE"
        no_proxy: "$NO_PROXY_VALUE"
  rq_worker:
    build:
      network: host
      args:
        HTTP_PROXY: "$PROXY_URL"
        HTTPS_PROXY: "$PROXY_URL"
        http_proxy: "$PROXY_URL"
        https_proxy: "$PROXY_URL"
        NO_PROXY: "$NO_PROXY_VALUE"
        no_proxy: "$NO_PROXY_VALUE"
  frontend:
    build:
      network: host
      args:
        HTTP_PROXY: "$PROXY_URL"
        HTTPS_PROXY: "$PROXY_URL"
        http_proxy: "$PROXY_URL"
        https_proxy: "$PROXY_URL"
        NO_PROXY: "$NO_PROXY_VALUE"
        no_proxy: "$NO_PROXY_VALUE"
EOF
}

run_compose() {
  local compose="$1"
  shift
  $compose --env-file "$ENV_FILE" "$@"
}

run_build() {
  local compose="$1"
  local tmp_override

  if proxy_enabled; then
    tmp_override="$(mktemp)"
    trap "rm -f '$tmp_override'; trap - RETURN" RETURN
    write_proxy_override "$tmp_override"
    info "使用构建代理: $PROXY_URL"
    $compose -f "$ROOT_DIR/docker-compose.yml" -f "$tmp_override" --env-file "$ENV_FILE" build
  else
    info "未启用构建代理。可设置 USE_PROXY=1 PROXY_URL=http://127.0.0.1:10808。"
    run_compose "$compose" build
  fi
}

configure_daemon_proxy() {
  local proxy_conf="/etc/systemd/system/docker.service.d/http-proxy.conf"
  command -v systemctl >/dev/null 2>&1 || die "当前系统没有 systemctl，无法自动配置 Docker daemon 代理。"

  info "写入 Docker daemon 代理: $PROXY_URL"
  sudo mkdir -p /etc/systemd/system/docker.service.d
  sudo tee "$proxy_conf" >/dev/null <<EOF
[Service]
Environment="HTTP_PROXY=$PROXY_URL"
Environment="HTTPS_PROXY=$PROXY_URL"
Environment="NO_PROXY=$NO_PROXY_VALUE"
EOF
  sudo systemctl daemon-reload
  sudo systemctl restart docker
  sudo systemctl show --property=Environment docker
}

main() {
  case "$ACTION" in
    -h|--help|help)
      usage
      return
      ;;
  esac

  cd "$ROOT_DIR"
  ensure_env_file

  if [[ "$ACTION" == "configure-daemon-proxy" ]]; then
    configure_daemon_proxy
    return
  fi

  local docker_bin compose
  docker_bin="$(docker_cmd)"
  compose="$(compose_cmd "$docker_bin")"

  if [[ "${DOCKER_UP_PRINT_COMPOSE:-}" == "1" ]]; then
    printf '%s\n' "$compose"
    return
  fi

  case "$ACTION" in
    build-up)
      run_build "$compose"
      run_compose "$compose" up -d
      run_compose "$compose" ps
      ;;
    build)
      run_build "$compose"
      ;;
    up)
      run_compose "$compose" up -d
      run_compose "$compose" ps
      ;;
    down)
      run_compose "$compose" down
      ;;
    ps)
      run_compose "$compose" ps
      ;;
    logs)
      run_compose "$compose" logs -f
      ;;
    *)
      usage
      die "未知命令: $ACTION"
      ;;
  esac
}

main "$@"
