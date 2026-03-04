---
hide:
  - toc
---

# SuperFlow Documentation

SuperFlow is a focus-first task management plugin for Obsidian. Each task is a Markdown file with structured metadata in YAML frontmatter.

Built as a fork of [TaskNotes](https://github.com/callumalpass/tasknotes), SuperFlow adds focus modes (Pomodoro, Flowtime, Countdown), daily planning workflows, and KDE Plasma integration.

## Requirements

SuperFlow requires **Obsidian 1.10.1** or later and depends on the **Bases** core plugin. Before you begin, open Obsidian Settings and confirm Bases is enabled under Core Plugins.

## Getting Started

### 1. Install and Enable

Install SuperFlow from Community Plugins in Obsidian settings, then enable it. If Bases is still disabled, enable it right away so SuperFlow views can open correctly.

### 2. Create Your First Task

Press <kbd>Ctrl+P</kbd> (or <kbd>Cmd+P</kbd> on macOS), run **SuperFlow: Create new task**, fill in the modal, and save. If you prefer inline workflows, start with a checkbox like `- [ ] Buy groceries` and convert it using the inline task command.

### 3. Start a Focus Session

Run **SuperFlow: Start focus session** to begin tracking time on your current task. Choose between Pomodoro (25/5 cycles), Flowtime (natural breaks), or Countdown (fixed duration) modes.

### 4. Open the Task List

Open your first view from the SuperFlow ribbon icon or by running **SuperFlow: Open tasks view** from the command palette. This opens the default Task List `.base` file inside `SuperFlow/Views`.

## Quick Links

<div class="card-grid">
  <a class="card" href="/core-concepts/">
    <span class="card__title">Core Concepts</span>
    <span class="card__desc">Data model, task structure, and architecture</span>
  </a>
  <a class="card" href="/features/">
    <span class="card__title">Features</span>
    <span class="card__desc">Focus modes, time tracking, planning, and more</span>
  </a>
  <a class="card" href="/features/time-management/">
    <span class="card__title">Time Management</span>
    <span class="card__desc">Focus modes, Pomodoro timer, and time tracking</span>
  </a>
  <a class="card" href="/features/calendar-integration/">
    <span class="card__title">Calendar Integration</span>
    <span class="card__desc">Google Calendar, Outlook, and ICS subscriptions</span>
  </a>
  <a class="card" href="/HTTP_API/">
    <span class="card__title">HTTP API</span>
    <span class="card__desc">REST API for automation and external integrations</span>
  </a>
  <a class="card" href="/troubleshooting/">
    <span class="card__title">Troubleshooting</span>
    <span class="card__desc">Common issues and how to resolve them</span>
  </a>
</div>
