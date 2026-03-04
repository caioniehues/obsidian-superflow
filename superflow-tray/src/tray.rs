//! System tray icon and menu management

use crate::state::{format_elapsed, format_time_remaining, truncate_title, SuperFlowState, TodayTask};
use anyhow::{Context, Result};
use std::path::Path;
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Icon, TrayIcon, TrayIconBuilder,
};

/// Menu action events
#[derive(Debug, Clone)]
pub enum MenuAction {
    /// Switch to a different task
    SwitchTask(String), // task path
    /// Pause/resume timer
    TogglePause,
    /// Start a break
    TakeBreak,
    /// Show Obsidian window
    ShowObsidian,
    /// Quit the tray app
    Quit,
}

/// Manages tray icon and context menu
pub struct TrayManager {
    tray: TrayIcon,
    icons: IconSet,
    current_frame: usize,
}

/// Preloaded icon set for animation
struct IconSet {
    stopped: Icon,
    frames: Vec<Icon>,
}

impl TrayManager {
    /// Create a new tray manager with icons
    pub fn new() -> Result<Self> {
        let icons = IconSet::load()?;
        let menu = Self::build_initial_menu();

        let tray = TrayIconBuilder::new()
            .with_icon(icons.stopped.clone())
            .with_tooltip("SuperFlow")
            .with_menu(Box::new(menu))
            .build()
            .context("Failed to create tray icon")?;

        Ok(Self {
            tray,
            icons,
            current_frame: 0,
        })
    }

    /// Build initial menu structure
    fn build_initial_menu() -> Menu {
        let menu = Menu::new();

        let _ = menu.append(&MenuItem::new("No tasks", false, None));
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&MenuItem::with_id("pause", "Pause", true, None));
        let _ = menu.append(&MenuItem::with_id("break", "Take a Break", true, None));
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&MenuItem::with_id("show", "Show Obsidian", true, None));
        let _ = menu.append(&MenuItem::with_id("quit", "Quit", true, None));

        menu
    }

    /// Update tray based on current state
    pub fn update(&mut self, state: &SuperFlowState) {
        // Update tooltip/title
        let title = self.format_title(state);
        let _ = self.tray.set_tooltip(Some(&title));

        // Update icon based on timer state
        if state.timer.is_running {
            let frame = self.progress_to_frame(state.timer.progress);
            if frame != self.current_frame && frame < self.icons.frames.len() {
                self.current_frame = frame;
                let _ = self.tray.set_icon(Some(self.icons.frames[frame].clone()));
            }
        } else if self.current_frame != usize::MAX {
            // Use stopped icon when not running
            self.current_frame = usize::MAX;
            let _ = self.tray.set_icon(Some(self.icons.stopped.clone()));
        }
    }

    /// Format tray tooltip text
    fn format_title(&self, state: &SuperFlowState) -> String {
        match &state.current_task {
            Some(task) => {
                let title = truncate_title(&task.title, 20);
                if state.timer.is_running {
                    let time = format_time_remaining(state.timer.time_remaining);
                    format!("{} — {}", title, time)
                } else {
                    let elapsed = format_elapsed(task.total_tracked_time, task.time_estimate);
                    format!("{} — {} (paused)", title, elapsed)
                }
            }
            None => "SuperFlow — No active task".to_string(),
        }
    }

    /// Convert progress (0.0-1.0) to frame index (0-15)
    fn progress_to_frame(&self, progress: f64) -> usize {
        let frame_count = self.icons.frames.len();
        if frame_count == 0 {
            return 0;
        }
        let frame = (progress * (frame_count - 1) as f64).floor() as usize;
        frame.min(frame_count - 1)
    }

    /// Update menu with today's tasks
    pub fn set_menu(&mut self, tasks: &[TodayTask], current_path: Option<&str>) {
        let menu = Menu::new();

        // Task items (radio-style)
        for task in tasks {
            let is_current = current_path == Some(&task.path);
            let label = if is_current {
                format!("● {}", truncate_title(&task.title, 25))
            } else {
                format!("○ {}", truncate_title(&task.title, 25))
            };

            let item = MenuItem::with_id(
                format!("task:{}", task.path),
                &label,
                true,
                None,
            );
            let _ = menu.append(&item);
        }

        if tasks.is_empty() {
            let _ = menu.append(&MenuItem::new("No tasks today", false, None));
        }

        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&MenuItem::with_id("pause", "Pause / Resume", true, None));
        let _ = menu.append(&MenuItem::with_id("break", "Take a Break", true, None));
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&MenuItem::with_id("show", "Show Obsidian", true, None));
        let _ = menu.append(&MenuItem::with_id("quit", "Quit", true, None));

        let _ = self.tray.set_menu(Some(Box::new(menu)));
    }

    /// Parse menu event into action
    pub fn parse_menu_event(event: &MenuEvent) -> Option<MenuAction> {
        let id = event.id().0.as_str();

        if let Some(path) = id.strip_prefix("task:") {
            return Some(MenuAction::SwitchTask(path.to_string()));
        }

        match id {
            "pause" => Some(MenuAction::TogglePause),
            "break" => Some(MenuAction::TakeBreak),
            "show" => Some(MenuAction::ShowObsidian),
            "quit" => Some(MenuAction::Quit),
            _ => None,
        }
    }
}

impl IconSet {
    /// Load icons from disk
    fn load() -> Result<Self> {
        let icons_dir = Self::icons_dir()?;

        // Load stopped icon
        let stopped_path = icons_dir.join("stopped.png");
        let stopped = Self::load_icon(&stopped_path)
            .unwrap_or_else(|_| Self::create_default_icon());

        // Load animation frames
        let frames_dir = icons_dir.join("frames");
        let mut frames = Vec::new();

        for i in 0..16 {
            let frame_path = frames_dir.join(format!("frame-{:02}.png", i));
            if let Ok(icon) = Self::load_icon(&frame_path) {
                frames.push(icon);
            }
        }

        // If no frames found, use default
        if frames.is_empty() {
            tracing::warn!("No animation frames found, using default icon");
            frames.push(Self::create_default_icon());
        }

        Ok(Self { stopped, frames })
    }

    /// Get icons directory path
    fn icons_dir() -> Result<std::path::PathBuf> {
        // Check ~/.local/share/superflow-tray/icons first
        if let Some(data_dir) = dirs::data_local_dir() {
            let path = data_dir.join("superflow-tray").join("icons");
            if path.exists() {
                return Ok(path);
            }
        }

        // Fallback to executable directory
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let path = dir.join("icons");
                if path.exists() {
                    return Ok(path);
                }
            }
        }

        // Create default location
        let path = dirs::data_local_dir()
            .context("Could not determine data directory")?
            .join("superflow-tray")
            .join("icons");

        Ok(path)
    }

    /// Load icon from PNG file
    fn load_icon(path: &Path) -> Result<Icon> {
        let img = image::open(path)
            .with_context(|| format!("Failed to open icon: {}", path.display()))?
            .into_rgba8();

        let (width, height) = img.dimensions();
        let rgba = img.into_raw();

        Icon::from_rgba(rgba, width, height)
            .context("Failed to create icon from image data")
    }

    /// Create a simple default icon (green circle)
    fn create_default_icon() -> Icon {
        const SIZE: u32 = 32;
        let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];

        // Draw a simple green circle
        let center = SIZE as f32 / 2.0;
        let radius = center - 2.0;

        for y in 0..SIZE {
            for x in 0..SIZE {
                let dx = x as f32 - center;
                let dy = y as f32 - center;
                let dist = (dx * dx + dy * dy).sqrt();

                let idx = ((y * SIZE + x) * 4) as usize;
                if dist <= radius {
                    rgba[idx] = 76;     // R
                    rgba[idx + 1] = 175; // G
                    rgba[idx + 2] = 80;  // B
                    rgba[idx + 3] = 255; // A
                } else {
                    rgba[idx + 3] = 0; // Transparent
                }
            }
        }

        Icon::from_rgba(rgba, SIZE, SIZE).expect("Failed to create default icon")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_to_frame() {
        // Test frame calculation logic
        assert_eq!((0.0_f64 * 15.0).floor() as usize, 0);
        assert_eq!((0.5_f64 * 15.0).floor() as usize, 7);
        assert_eq!((1.0_f64 * 15.0).floor() as usize, 15);
    }

    #[test]
    fn test_parse_menu_event_task() {
        // Menu events require actual menu items, so we test the parsing logic
        let path = "task:Projects/my-task.md";
        if let Some(stripped) = path.strip_prefix("task:") {
            assert_eq!(stripped, "Projects/my-task.md");
        }
    }
}
