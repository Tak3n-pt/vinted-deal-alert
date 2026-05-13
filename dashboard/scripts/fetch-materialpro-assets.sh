#!/usr/bin/env bash
# Re-fetch MaterialPro horizontal index3 assets into dashboard/public/assets/.
# Run from dashboard/ — idempotent.

set -euo pipefail
cd "$(dirname "$0")/.."

BASE="https://bootstrapdemos.wrappixel.com/materialpro/dist/assets"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
DEST="public/assets"

mkdir -p \
  "$DEST/css" \
  "$DEST/js/theme" "$DEST/js/dashboards" "$DEST/js/breadcrumb" \
  "$DEST/libs/apexcharts/dist" \
  "$DEST/libs/bootstrap/dist/js" \
  "$DEST/libs/simplebar/dist" \
  "$DEST/fonts/tabler-icons/fonts" \
  "$DEST/images/logos" "$DEST/images/svgs" \
  "$DEST/images/backgrounds" "$DEST/images/profile"

declare -a PATHS=(
  "css/styles.css"
  "js/vendor.min.js"
  "js/breadcrumb/breadcrumbChart.js"
  "js/dashboards/dashboard3.js"
  "js/theme/app.horizontal.init.js"
  "js/theme/app.min.js"
  "js/theme/theme.js"
  "js/theme/sidebarmenu.js"
  "js/theme/feather.min.js"
  "libs/apexcharts/dist/apexcharts.min.js"
  "libs/bootstrap/dist/js/bootstrap.bundle.min.js"
  "libs/simplebar/dist/simplebar.min.js"
  "fonts/tabler-icons/fonts/tabler-icons.eot"
  "fonts/tabler-icons/fonts/tabler-icons.woff"
  "fonts/tabler-icons/fonts/tabler-icons.woff2"
  "fonts/tabler-icons/fonts/tabler-icons.ttf"
  "fonts/tabler-icons/fonts/tabler-icons.svg"
  "images/logos/favicon.png"
  "images/logos/logo-icon.svg"
  "images/logos/logo-light-icon.svg"
  "images/logos/logo-light-text.svg"
  "images/svgs/danger.svg"
  "images/svgs/success.svg"
  "images/svgs/warning.svg"
  "images/svgs/icon-flag-en.svg"
  "images/backgrounds/user-info.jpg"
  "images/profile/user-1.jpg"
)

for path in "${PATHS[@]}"; do
  out="$DEST/$path"
  if curl -sSfL -A "$UA" "$BASE/$path" -o "$out"; then
    echo "OK  $path"
  else
    echo "MISS $path" >&2
  fi
done

echo
echo "Done. $(du -sh "$DEST" | cut -f1) committed under $DEST/"
