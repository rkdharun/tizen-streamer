#!/usr/bin/env bash
# Build, sign and (optionally) install ReelTV on a Samsung TV.
#   ./build.sh                 -> builds ReelTV.wgt
#   ./build.sh 192.168.1.50    -> builds, connects to the TV and installs/launches it
# Env: TIZEN_PROFILE (security profile name from Tizen Certificate Manager, default "ReelTV")
set -euo pipefail
cd "$(dirname "$0")"

TIZEN="${TIZEN:-$HOME/tizen-studio/tools/ide/bin/tizen}"
SDB="${SDB:-$HOME/tizen-studio/tools/sdb}"
PROFILE="${TIZEN_PROFILE:-ReelTV}"
APP_ID="ReelTVApp1.ReelTV"
OUT=".buildResult"

command -v "$TIZEN" >/dev/null 2>&1 || { echo "tizen CLI not found at $TIZEN (install Tizen Studio or set TIZEN=)"; exit 1; }

rm -rf "$OUT" ./*.wgt
"$TIZEN" build-web -e "build.sh" -e "dev-server.py" -e "README.md" -e "*.wgt" -- . -out "$OUT"
"$TIZEN" package -t wgt -s "$PROFILE" -- "$OUT"
mv "$OUT"/*.wgt ./ReelTV.wgt
echo "Built ReelTV.wgt"

if [ "${1:-}" != "" ]; then
  "$SDB" connect "$1"
  TARGET="$("$SDB" devices | awk 'NR>1 && $1 ~ /'"$1"'/ {print $3; exit}')"
  "$TIZEN" install -n ReelTV.wgt -t "$TARGET"
  "$TIZEN" run -p "$APP_ID" -t "$TARGET"
fi
