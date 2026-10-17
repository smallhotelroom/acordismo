#!/usr/bin/env bash
# File: python/run-clean.sh
# Version: 2.1.2

source ~/.venvs/acordismo/bin/activate

# exit when any command fails
set -e

# keep track of the last executed command
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
# echo an error message before exiting
trap 'echo "\"${last_command}\" command finished with exit code $?."' EXIT

cd "$(dirname "$0")"

# Clean previous build
rm -f songs.db

# 1. Create schema
python db-create-tables.py --db songs.db --yes

# 2. Point to your local smallhotelroom.github.io songs directory
SHR_SONGS_DIR="${SHR_SONGS_DIR:-../../smallhotelroom.github.io/src/contents/songs}"

python db-insert-songdirectory.py \
    --input "$SHR_SONGS_DIR" \
    --db songs.db \
    --playlist "★ Small Hotel Room" \
    --yes

# 3. Copy directly into Vite's public/ directory
cp songs.db ../public/songs.db
echo "Copied clean songs.db to ../public/songs.db"
