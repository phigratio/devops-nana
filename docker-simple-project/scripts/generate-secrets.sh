#!/usr/bin/env bash
# Generates the password files docker-compose mounts as secrets.
# Safe to re-run: existing files are left alone.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p secrets

# File-based compose secrets are bind-mounted with their host ownership and
# mode intact, and compose ignores the `uid`/`gid`/`mode` secret keys outside
# of swarm. The containers run as non-root users with their own UIDs (mongo is
# 999, the app is 1000), so the files must be world-readable for them to be
# read at all. The directory is 0700 instead, which is what actually keeps
# other users on this host out.
chmod 700 secrets

for name in mongo_root_password mongo_app_password; do
  file="secrets/${name}.txt"
  if [ -s "$file" ]; then
    echo "exists  $file"
  else
    # Hex, not base64: these passwords end up inside MongoDB connection
    # strings, and mongo-express does not URL-encode them, so a "/" or "+"
    # breaks it. 64 hex chars is 256 bits of entropy with no escaping needed.
    openssl rand -hex 32 | tr -d '\n' > "$file"
    echo "created $file"
  fi
  chmod 644 "$file"
done

echo
echo "Secrets are gitignored. Back them up: losing mongo_app_password.txt"
echo "means recreating the database user by hand."
