//! State parsing for ~/.config/superflow/state.json

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

/// Root state structure written by StateWriterService
#[derive(Debug, Clone, Deserialize)]
pub struct SuperFlowState {
    pub version: u8,
    pub timestamp: String,
    #[serde(rename = "currentTask")]
    pub current_task: Option<CurrentTask>,
    pub timer: TimerState,
    #[serde(rename = "todayTasks")]
    pub today_tasks: Vec<TodayTask>,
}

/// Currently active task being tracked
#[derive(Debug, Clone, Deserialize)]
pub struct CurrentTask {
    pub path: String,
    pub title: String,
    #[serde(rename = "timeEstimate")]
    pub time_estimate: Option<u64>,     // milliseconds
    #[serde(rename = "totalTrackedTime")]
    pub total_tracked_time: u64,        // milliseconds
    pub status: String,
    pub project: Option<String>,
}

/// Timer state (pomodoro/flowtime/countdown)
#[derive(Debug, Clone, Deserialize)]
pub struct TimerState {
    pub mode: String,           // "pomodoro" | "flowtime" | "countdown" | "none"
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    pub progress: f64,          // 0.0–1.0
    #[serde(rename = "timeRemaining")]
    pub time_remaining: u64,    // seconds
    #[serde(rename = "sessionType")]
    pub session_type: String,   // "work" | "short-break" | "long-break"
}

/// Task from today's task list
#[derive(Debug, Clone, Deserialize)]
pub struct TodayTask {
    pub path: String,
    pub title: String,
    pub status: String,
    #[serde(rename = "totalTrackedTime")]
    pub total_tracked_time: u64,
}

/// Parse state from JSON file
pub fn parse_state(path: &Path) -> Result<SuperFlowState> {
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read state file: {}", path.display()))?;

    let state: SuperFlowState = serde_json::from_str(&contents)
        .with_context(|| "Failed to parse state JSON")?;

    Ok(state)
}

/// Extract task ID from vault path for API calls
/// E.g., "Projects/task.md" -> "Projects/task" (without .md)
pub fn task_id_from_path(path: &str) -> String {
    path.trim_end_matches(".md").to_string()
}

/// Format time remaining as human-readable string
pub fn format_time_remaining(seconds: u64) -> String {
    if seconds >= 3600 {
        let hours = seconds / 3600;
        let mins = (seconds % 3600) / 60;
        format!("{}h{}m", hours, mins)
    } else {
        let mins = seconds / 60;
        format!("{}m", mins)
    }
}

/// Format elapsed time, showing overtime if beyond estimate
pub fn format_elapsed(tracked_ms: u64, estimate_ms: Option<u64>) -> String {
    let tracked_mins = tracked_ms / 60_000;

    match estimate_ms {
        Some(est) if tracked_ms > est => {
            let over_mins = (tracked_ms - est) / 60_000;
            format!("{}m (+{}m)", tracked_mins, over_mins)
        }
        _ => format!("{}m", tracked_mins),
    }
}

/// Truncate title to max length, adding ellipsis if needed
pub fn truncate_title(title: &str, max_len: usize) -> String {
    if title.len() <= max_len {
        title.to_string()
    } else {
        format!("{}…", &title[..max_len - 1])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_STATE: &str = r#"{
        "version": 1,
        "timestamp": "2026-03-04T10:00:00Z",
        "currentTask": {
            "path": "Projects/implement-tray.md",
            "title": "Implement tray app",
            "timeEstimate": 3600000,
            "totalTrackedTime": 1800000,
            "status": "in-progress",
            "project": "SuperFlow"
        },
        "timer": {
            "mode": "pomodoro",
            "isRunning": true,
            "progress": 0.5,
            "timeRemaining": 750,
            "sessionType": "work"
        },
        "todayTasks": [
            {
                "path": "Projects/implement-tray.md",
                "title": "Implement tray app",
                "status": "in-progress",
                "totalTrackedTime": 1800000
            },
            {
                "path": "Projects/write-tests.md",
                "title": "Write tests",
                "status": "pending",
                "totalTrackedTime": 0
            }
        ]
    }"#;

    #[test]
    fn test_parse_valid_state() {
        let state: SuperFlowState = serde_json::from_str(SAMPLE_STATE).unwrap();
        assert_eq!(state.version, 1);
        assert!(state.current_task.is_some());
        assert_eq!(state.timer.mode, "pomodoro");
        assert!(state.timer.is_running);
        assert_eq!(state.today_tasks.len(), 2);
    }

    #[test]
    fn test_parse_null_current_task() {
        let json = r#"{
            "version": 1,
            "timestamp": "2026-03-04T10:00:00Z",
            "currentTask": null,
            "timer": {
                "mode": "none",
                "isRunning": false,
                "progress": 0,
                "timeRemaining": 0,
                "sessionType": "work"
            },
            "todayTasks": []
        }"#;
        let state: SuperFlowState = serde_json::from_str(json).unwrap();
        assert!(state.current_task.is_none());
    }

    #[test]
    fn test_task_id_from_path() {
        assert_eq!(task_id_from_path("Projects/task.md"), "Projects/task");
        assert_eq!(task_id_from_path("task.md"), "task");
        assert_eq!(task_id_from_path("folder/subfolder/task.md"), "folder/subfolder/task");
    }

    #[test]
    fn test_format_time_remaining() {
        assert_eq!(format_time_remaining(0), "0m");
        assert_eq!(format_time_remaining(300), "5m");
        assert_eq!(format_time_remaining(3600), "1h0m");
        assert_eq!(format_time_remaining(3900), "1h5m");
    }

    #[test]
    fn test_format_elapsed() {
        assert_eq!(format_elapsed(1800000, None), "30m");
        assert_eq!(format_elapsed(1800000, Some(3600000)), "30m");
        assert_eq!(format_elapsed(4200000, Some(3600000)), "70m (+10m)");
    }

    #[test]
    fn test_truncate_title() {
        assert_eq!(truncate_title("Short", 20), "Short");
        assert_eq!(truncate_title("This is a very long title", 10), "This is a…");
    }
}
