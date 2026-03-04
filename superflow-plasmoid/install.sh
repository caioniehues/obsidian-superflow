#!/bin/bash
set -e
cd "$(dirname "$0")"

# Install or update the plasmoid
kpackagetool6 -t Plasma/Applet -i package/ 2>/dev/null || \
kpackagetool6 -t Plasma/Applet -u package/

echo "✓ Installed SuperFlow plasmoid"
echo ""
echo "To add to panel:"
echo "  1. Right-click your KDE panel"
echo "  2. Click 'Add Widgets...'"
echo "  3. Search for 'SuperFlow'"
echo "  4. Drag it to your panel"
