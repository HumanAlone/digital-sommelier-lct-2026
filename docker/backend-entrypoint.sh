#!/bin/sh
set -eu

required_files="
/app/backend/artifacts/models/best.pt
/app/backend/artifacts/models/siglip_full_best.pt
/app/backend/artifacts/index/gallery.faiss
/app/backend/artifacts/index/gallery_finetuned.faiss
/app/backend/artifacts/gallery_slugs.json
/app/backend/artifacts/gallery_slugs_finetuned.json
"

missing=0
for path in $required_files; do
  if [ ! -s "$path" ]; then
    echo "ERROR: required ML artifact is missing or empty: $path" >&2
    missing=1
  elif head -c 64 "$path" | grep -q "^version https://git-lfs.github.com/spec/v1"; then
    echo "ERROR: $path is a Git LFS pointer. Run 'git lfs pull' first." >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Place the artifacts under backend/artifacts before starting Docker Compose." >&2
  exit 1
fi

exec "$@"
