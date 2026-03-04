# SuperFlow Tray

System tray companion for Obsidian SuperFlow. Displays current task and timer in the system tray, with quick task switching and idle detection.

## Features

- **Tray icon** showing current task and timer status
- **Context menu** to switch between today's tasks
- **Idle detection** (KDE/X11) — pauses tracking when you step away
- **Break reminders** after continuous work
- **Desktop notifications** via freedesktop

## Requirements

- Linux with GTK3 (KDE Plasma, GNOME, etc.)
- Obsidian with SuperFlow plugin running
- Optional: `kdialog` for idle return dialogs, `wmctrl` for window focus

## Installation

### Build from source

```bash
cd superflow-tray
cargo build --release
```

### Install

```bash
# Binary
sudo install -Dm755 target/release/superflow-tray /usr/local/bin/

# Icons (create default or copy custom)
mkdir -p ~/.local/share/superflow-tray/icons/frames

# systemd user service (optional)
mkdir -p ~/.config/systemd/user
cp superflow-tray.service ~/.config/systemd/user/
systemctl --user enable --now superflow-tray
```

## Configuration

Create `~/.config/superflow/tray.toml`:

```toml
# Plugin HTTP API port (default: 8080)
api_port = 8080

# Optional bearer token for API auth
api_token = ""

# Idle detection threshold in seconds (default: 5 min)
idle_threshold_secs = 300

# Break reminder after continuous work in seconds (default: 55 min)
break_reminder_secs = 3300
```

## How It Works

1. **StateWriterService** (Obsidian plugin) writes state to `~/.config/superflow/state.json`
2. **superflow-tray** watches that file and updates the tray icon
3. Menu actions call the plugin's HTTP API on localhost:8080

## License

MIT
