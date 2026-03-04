# SuperFlow Tray Implementation Notes

## Architecture

### Threading Model
`tray-icon` requires the main thread for GTK/SNI integration, so the event loop uses `tokio::select!` on the main thread while file watching and idle detection run as tokio tasks. Menu events use a blocking channel bridge from std::thread.

### State Synchronization
The plugin writes state.json on changes (debounced), and the tray watches with `notify` crate. This file-based IPC avoids the complexity of WebSockets while being reliable across process restarts.

### Idle Detection Strategy
Tries KDE's D-Bus interface first (`org.kde.kwin.IdleTime`), falls back to `xprintidle` command. This covers both Wayland (KDE) and X11 setups without hard dependencies.

## Module Overview

| File | Purpose |
|------|---------|
| `src/main.rs` | Entry point, event loop orchestration |
| `src/config.rs` | Load `~/.config/superflow/tray.toml` |
| `src/state.rs` | Parse state.json from StateWriterService |
| `src/tray.rs` | Tray icon, menu, icon animation |
| `src/api.rs` | HTTP client for plugin API |
| `src/idle.rs` | D-Bus idle detection |
| `src/dialogs.rs` | kdialog wrappers |
| `src/notifications.rs` | Desktop notifications |
| `superflow-tray.service` | systemd user unit |

## Build Info

- **Tests:** 14 passing
- **Binary size:** ~11MB stripped
- **Dependencies:** GTK3, libappindicator

## Next Steps

1. Add icon PNGs to `icons/` (stopped.png + frames/frame-00.png through frame-15.png)
2. Test with actual plugin running (`cargo run` while Obsidian is open)
3. Wire up any missing API endpoints in the plugin if needed
