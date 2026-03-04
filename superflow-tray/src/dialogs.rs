//! kdialog subprocess wrappers for user interaction

use anyhow::{Context, Result};
use std::time::Duration;
use tokio::process::Command;

/// User's choice when returning from idle
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum IdleReturnChoice {
    /// User was working on the task (keep time, resume)
    WasWorking,
    /// User was on a break (log as break time)
    WasOnBreak,
    /// Discard the idle time from tracking
    DiscardTime,
    /// User cancelled the dialog
    Cancel,
}

/// Show dialog when user returns from idle
pub async fn show_idle_return_dialog(
    task_title: &str,
    idle_duration: Duration,
) -> Result<IdleReturnChoice> {
    let mins = idle_duration.as_secs() / 60;
    let duration_str = if mins > 60 {
        format!("{}h {}m", mins / 60, mins % 60)
    } else {
        format!("{} minutes", mins)
    };

    let output = Command::new("kdialog")
        .args([
            "--title",
            "Welcome Back",
            "--radiolist",
            &format!(
                "You were idle for {} while working on '{}'.\nWhat were you doing?",
                duration_str, task_title
            ),
            "1",
            "I was working on this task (keep time)",
            "on",
            "2",
            "I was on a break (log as break)",
            "off",
            "3",
            "Discard idle time",
            "off",
        ])
        .output()
        .await
        .context("Failed to run kdialog")?;

    if !output.status.success() {
        // User cancelled or dialog failed
        return Ok(IdleReturnChoice::Cancel);
    }

    let choice = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(match choice.as_str() {
        "1" => IdleReturnChoice::WasWorking,
        "2" => IdleReturnChoice::WasOnBreak,
        "3" => IdleReturnChoice::DiscardTime,
        _ => IdleReturnChoice::Cancel,
    })
}

/// Show a simple confirmation dialog
pub async fn show_confirm_dialog(title: &str, message: &str) -> Result<bool> {
    let status = Command::new("kdialog")
        .args(["--title", title, "--yesno", message])
        .status()
        .await
        .context("Failed to run kdialog")?;

    Ok(status.success())
}

/// Show an info notification (non-blocking)
pub async fn show_info(title: &str, message: &str) -> Result<()> {
    Command::new("kdialog")
        .args(["--title", title, "--passivepopup", message, "5"])
        .spawn()
        .context("Failed to run kdialog")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idle_return_choice_eq() {
        assert_eq!(IdleReturnChoice::WasWorking, IdleReturnChoice::WasWorking);
        assert_ne!(IdleReturnChoice::WasWorking, IdleReturnChoice::WasOnBreak);
    }
}
