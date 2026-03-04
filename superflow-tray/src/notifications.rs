//! Desktop notifications via notify-rust

use anyhow::Result;
use notify_rust::{Notification, Urgency};

/// Show break reminder notification
pub fn notify_break_reminder(work_minutes: u64) -> Result<()> {
    Notification::new()
        .summary("Time for a Break")
        .body(&format!(
            "You've been working for {} minutes. Consider taking a short break!",
            work_minutes
        ))
        .icon("appointment-soon")
        .urgency(Urgency::Normal)
        .timeout(10000) // 10 seconds
        .show()?;

    tracing::info!("Sent break reminder notification");
    Ok(())
}

/// Show notification when tracking is paused due to idle
pub fn notify_idle_paused(task_title: &str) -> Result<()> {
    Notification::new()
        .summary("Tracking Paused")
        .body(&format!(
            "You seem to be away. Tracking paused for '{}'.",
            task_title
        ))
        .icon("dialog-information")
        .urgency(Urgency::Low)
        .timeout(5000)
        .show()?;

    tracing::info!("Sent idle pause notification");
    Ok(())
}

/// Show notification for pomodoro completion
pub fn notify_pomodoro_complete(session_type: &str) -> Result<()> {
    let (summary, body) = match session_type {
        "work" => ("Work Session Complete", "Time for a break!"),
        "short-break" | "long-break" => ("Break Over", "Ready to get back to work?"),
        _ => ("Timer Complete", ""),
    };

    Notification::new()
        .summary(summary)
        .body(body)
        .icon("dialog-information")
        .urgency(Urgency::Normal)
        .timeout(10000)
        .show()?;

    Ok(())
}

/// Show generic info notification
pub fn notify_info(summary: &str, body: &str) -> Result<()> {
    Notification::new()
        .summary(summary)
        .body(body)
        .icon("dialog-information")
        .urgency(Urgency::Low)
        .timeout(5000)
        .show()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    // Notification tests would require a display, so we skip them
    // in automated testing
}
