# Obsidian SuperFlow

A focus-first task management plugin for Obsidian with time tracking, focus modes, daily planning, and a system tray companion app.

**Fork of [TaskNotes](https://github.com/callumalpass/tasknotes)** — each task is a separate Markdown note, all views powered by [Obsidian Bases](https://help.obsidian.md/bases).

## What SuperFlow Adds

SuperFlow extends TaskNotes with features inspired by [Super Productivity](https://super-productivity.com/):

- **Focus Modes** — Pomodoro, Flowtime (work until natural break), or Countdown timer
- **Daily Planning** — "Review yesterday → Plan today" workflow on vault open
- **System Tray App** — Rust companion showing progress, task switching, idle detection (Linux/Wayland)
- **Anti-Procrastination** — Break enforcement, tracking reminders, daily/weekly summaries

## Quick Start

1. Install from Community Plugins (or build from source)
2. Enable the **Bases** core plugin in Obsidian settings
3. Create a task: `Ctrl+P` → **SuperFlow: Create new task**
4. Start a focus session: `Ctrl+P` → **SuperFlow: Start focus session**

## Task Structure

Tasks are Markdown files with YAML frontmatter:

```yaml
title: "Complete documentation"
status: "in-progress"
due: "2024-01-20"
priority: "high"
contexts: ["work"]
timeEstimate: 120
timeEntries:
  - startTime: "2024-01-15T10:30:00Z"
    endTime: "2024-01-15T11:15:00Z"
```

Views (Task List, Kanban, Calendar, Agenda) are `.base` files querying this data.

## Focus Modes

| Mode | Description |
|------|-------------|
| **Pomodoro** | 25-min work / 5-min break cycles |
| **Flowtime** | Work until natural break, rest proportional to work |
| **Countdown** | Fixed duration, no enforced breaks |

Switch modes via command palette or status bar. Break enforcement modal appears when sessions complete.

## KDE Plasma Integration

The companion plasmoid (`superflow-plasmoid/`) displays your current task and timer in the Plasma panel:

- Current task name and remaining time
- Visual progress indicator
- Click to switch tasks or control timer

Install: `cd superflow-plasmoid && ./install.sh`

Requires KDE Plasma 6.0+.

### Alternative: System Tray App

For non-KDE environments, a Rust tray app (`superflow-tray/`) provides similar functionality with GTK3.

## Core Features (from TaskNotes)

- Natural language task creation
- Time tracking with start/stop per task
- Recurring tasks with RRULE format
- Calendar sync (Google, Microsoft, ICS)
- Dependencies between tasks
- Custom statuses, priorities, user fields
- HTTP API for automation

## Documentation

See `docs/` for detailed documentation:

- [Core Concepts](docs/core-concepts.md) — Data model and architecture
- [Features](docs/features.md) — All capabilities
- [HTTP API](docs/HTTP_API.md) — REST endpoints
- [Privacy](docs/privacy.md) — Data handling

## Development

```bash
npm install
npm run dev      # Watch mode
npm run build    # Production build
npm run test     # Run tests
```

## License

MIT — see [LICENSE](LICENSE).

## Credits

- Original [TaskNotes](https://github.com/callumalpass/tasknotes) by Callum Alpass
- Calendar components by [FullCalendar.io](https://fullcalendar.io/)
