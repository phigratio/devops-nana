#!/bin/bash
# Runs once, only when the mongo-data volume is empty.
# Creates a least-privilege application user; the app never uses the root account.
#
# This is a shell script rather than a .js one on purpose: the entrypoint runs
# .js files through mongosh, which (unlike the old `mongo` shell) has no cat()
# helper, so it cannot read the mounted secret file by itself.
set -euo pipefail

: "${MONGO_INITDB_DATABASE:?required}"
: "${MONGO_APP_USERNAME:?required}"
: "${MONGO_APP_PASSWORD_FILE:?required}"
: "${MONGO_INITDB_ROOT_USERNAME:?required}"

APP_PASSWORD="$(tr -d '\r\n' < "$MONGO_APP_PASSWORD_FILE")"

# The mongo entrypoint resolves MONGO_INITDB_ROOT_PASSWORD_FILE into
# MONGO_INITDB_ROOT_PASSWORD and then *unsets* the _FILE variable, so by the
# time this script runs only the resolved value exists.
if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ]; then
  ROOT_PASSWORD="$MONGO_INITDB_ROOT_PASSWORD"
elif [ -n "${MONGO_INITDB_ROOT_PASSWORD_FILE:-}" ]; then
  ROOT_PASSWORD="$(tr -d '\r\n' < "$MONGO_INITDB_ROOT_PASSWORD_FILE")"
else
  echo "no root password available" >&2
  exit 1
fi

# Values go through the environment so no password lands in the process list.
APP_USERNAME="$MONGO_APP_USERNAME" \
APP_PASSWORD="$APP_PASSWORD" \
APP_DB="$MONGO_INITDB_DATABASE" \
mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$ROOT_PASSWORD" \
  --authenticationDatabase admin \
  "$MONGO_INITDB_DATABASE" \
  --eval '
    const appDb = db.getSiblingDB(process.env.APP_DB);

    appDb.createUser({
      user: process.env.APP_USERNAME,
      pwd: process.env.APP_PASSWORD,
      roles: [{ role: "readWrite", db: process.env.APP_DB }],
    });

    // Index the app relies on, created up front so the first request
    // is not the one paying for it.
    appDb.users.createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: "string" } } }
    );

    print(`Created user "${process.env.APP_USERNAME}" with readWrite on "${process.env.APP_DB}"`);
  '
