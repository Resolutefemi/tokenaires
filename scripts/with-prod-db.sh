#!/usr/bin/env bash
set -euo pipefail

host="${TOKENAIRES_SSH_HOST:-srv628842}"
db_container="${TOKENAIRES_DB_CONTAINER:-legptavibhgchbevsytjqvfa}"
local_port="${TOKENAIRES_DB_TUNNEL_PORT:-55432}"

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/with-prod-db.sh <command> [args...]" >&2
  exit 2
fi

control_dir="$(mktemp -d)"
socket="$control_dir/tunnel"
cleanup() {
  ssh -S "$socket" -O exit "$host" >/dev/null 2>&1 || true
  rm -rf "$control_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

container="$(ssh "$host" "docker ps -qf name=$db_container | head -n 1")"
if [ -z "$container" ]; then
  echo "No running database container matching $db_container on $host." >&2
  exit 1
fi

details="$(ssh "$host" "docker inspect -f '{{range .NetworkSettings.Networks}}ip={{.IPAddress}}{{println}}{{end}}{{range .Config.Env}}{{println .}}{{end}}' $container")"
value() { printf '%s\n' "$details" | sed -n "s/^$1=//p" | head -n 1; }
ip="$(value ip)"
user="$(value POSTGRES_USER)"
password="$(value POSTGRES_PASSWORD)"
database="$(value POSTGRES_DB)"
database="${database:-$user}"
if [ -z "$ip" ] || [ -z "$user" ] || [ -z "$password" ]; then
  echo "Could not read the database address or credentials from $container." >&2
  exit 1
fi

ssh -f -N -M -S "$socket" -o ExitOnForwardFailure=yes -L "127.0.0.1:$local_port:$ip:5432" "$host"

encode() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
DATABASE_URL="postgres://$(encode "$user"):$(encode "$password")@127.0.0.1:$local_port/$(encode "$database")"
export DATABASE_URL
echo "Connected to production through $host. Changes here are live." >&2
"$@"
