#!/bin/sh
# icons/*.svg から public/icons/*.png を作る。macOS の sips を使う。
# SVG のまま渡さないのは、Safari が manifest と apple-touch-icon の SVG を読むか確かめていないため
set -eu
cd "$(dirname "$0")/.."

png() {
    sips -s format png -z "$2" "$2" "icons/$1.svg" --out "public/icons/$3" >/dev/null
}

png icon 192 icon-192.png
png icon 512 icon-512.png
png icon-maskable 512 maskable-512.png
png icon-maskable 180 apple-touch-icon.png
