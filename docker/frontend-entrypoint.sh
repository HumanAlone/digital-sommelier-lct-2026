#!/bin/sh
set -eu

api_base="${WINE_API_BASE:-/api}"
escaped_api_base=$(printf '%s' "$api_base" | sed "s/'/\\\\'/g")
printf "window.WINE_API_BASE = '%s';\n" "$escaped_api_base" > /usr/share/nginx/html/config.js

