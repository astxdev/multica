#!/usr/bin/env bash
set -euo pipefail

# Multica self-host updater for this fork's VPS deployment.
#
# Pulls the latest astxdev/multica-backend and multica-web images
# (published by .github/workflows/selfhost-images.yml on every push to
# main), recreates the containers, and waits for the backend to report
# healthy before handing control back. Takes a Postgres backup first
# unless --no-backup is passed; keeps the last 5 backups and prunes
# older ones automatically.
#
# Usage (on the VPS):
#   ./vps-update.sh                # backup + pull + up + health check
#   ./vps-update.sh --no-backup    # skip the backup step
#   ./vps-update.sh --dir /other/compose/dir

COMPOSE_DIR="/docker/multica-boqu"
KEEP_BACKUPS=5
DO_BACKUP=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-backup) DO_BACKUP=0; shift ;;
    --dir) COMPOSE_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

cd "$COMPOSE_DIR"
BACKUP_DIR="$COMPOSE_DIR/backups"

POSTGRES_CONTAINER="$(docker compose ps -q postgres)"
if [[ -z "$POSTGRES_CONTAINER" ]]; then
  echo "error: no running 'postgres' service found in $COMPOSE_DIR (docker compose ps -q postgres was empty)" >&2
  exit 1
fi

if [[ "$DO_BACKUP" -eq 1 ]]; then
  echo "==> Backing up database..."
  mkdir -p "$BACKUP_DIR"
  pg_user="$(docker exec "$POSTGRES_CONTAINER" printenv POSTGRES_USER)"
  pg_db="$(docker exec "$POSTGRES_CONTAINER" printenv POSTGRES_DB)"
  stamp="$(date +%Y%m%d-%H%M%S)"
  remote_dump="/tmp/multica-$stamp.dump"
  local_dump="$BACKUP_DIR/multica-$stamp.dump"

  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$pg_user" -d "$pg_db" --format=custom -f "$remote_dump"
  docker cp "$POSTGRES_CONTAINER:$remote_dump" "$local_dump"
  docker exec "$POSTGRES_CONTAINER" rm -f "$remote_dump"
  echo "    saved: $local_dump ($(du -h "$local_dump" | cut -f1))"

  # Keep only the most recent KEEP_BACKUPS dumps.
  ls -1t "$BACKUP_DIR"/multica-*.dump 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm -f
else
  echo "==> Skipping backup (--no-backup)"
fi

echo "==> Pulling latest images..."
docker compose pull

echo "==> Recreating containers..."
docker compose up -d

echo "==> Waiting for backend to report healthy..."
backend_container="$(docker compose ps -q backend)"
healthy=0
for _ in $(seq 1 30); do
  if health_json="$(docker exec "$backend_container" wget -qO- http://localhost:8080/healthz 2>/dev/null)" \
     && grep -q '"status":"ok"' <<<"$health_json"; then
    echo "    $health_json"
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  echo "error: backend did not report healthy within 60s" >&2
  echo "    check: docker compose logs backend" >&2
  exit 1
fi

echo "==> Current status:"
docker compose ps

echo ""
echo "Update complete."
