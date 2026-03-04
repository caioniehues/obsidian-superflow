//! KDE idle detection via D-Bus

use anyhow::{Context, Result};
use std::time::{Duration, Instant};
use zbus::Connection;

/// Event returned by idle monitor
#[derive(Debug, Clone)]
pub enum IdleEvent {
    /// No change in idle state
    None,
    /// User just became idle
    BecameIdle,
    /// User returned from idle
    ReturnedFromIdle { idle_duration: Duration },
}

/// Monitor user idle state via KDE's D-Bus interface
pub struct IdleMonitor {
    connection: Connection,
    idle_threshold: Duration,
    is_idle: bool,
    idle_start: Option<Instant>,
}

impl IdleMonitor {
    /// Create a new idle monitor with given threshold
    pub async fn new(threshold: Duration) -> Result<Self> {
        let connection = Connection::session()
            .await
            .context("Failed to connect to D-Bus session bus")?;

        Ok(Self {
            connection,
            idle_threshold: threshold,
            is_idle: false,
            idle_start: None,
        })
    }

    /// Get current idle time in milliseconds from KDE
    async fn get_idle_time_ms(&self) -> Result<u64> {
        // Try KDE's kwin idle interface first
        let result: Result<u64, _> = self
            .connection
            .call_method(
                Some("org.kde.kwin.IdleTime"),
                "/org/kde/kwin/IdleTime",
                Some("org.kde.kwin.IdleTime"),
                "getIdleTime",
                &(),
            )
            .await
            .map(|reply| reply.body().deserialize().unwrap_or(0));

        if let Ok(ms) = result {
            return Ok(ms);
        }

        // Fallback: try freedesktop screensaver interface
        let result: Result<u64, _> = self
            .connection
            .call_method(
                Some("org.freedesktop.ScreenSaver"),
                "/org/freedesktop/ScreenSaver",
                Some("org.freedesktop.ScreenSaver"),
                "GetSessionIdleTime",
                &(),
            )
            .await
            .map(|reply| reply.body().deserialize().unwrap_or(0));

        if let Ok(ms) = result {
            return Ok(ms);
        }

        // Final fallback: try to use xprintidle via command
        Self::get_idle_time_xprintidle().await
    }

    /// Fallback to xprintidle command
    async fn get_idle_time_xprintidle() -> Result<u64> {
        let output = tokio::process::Command::new("xprintidle")
            .output()
            .await
            .context("xprintidle not available")?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let ms: u64 = stdout.trim().parse().unwrap_or(0);
            Ok(ms)
        } else {
            Ok(0)
        }
    }

    /// Check idle state and return event if changed
    pub async fn check_idle(&mut self) -> IdleEvent {
        let idle_ms = match self.get_idle_time_ms().await {
            Ok(ms) => ms,
            Err(e) => {
                tracing::warn!("Failed to get idle time: {}", e);
                return IdleEvent::None;
            }
        };

        let idle_duration = Duration::from_millis(idle_ms);
        let is_now_idle = idle_duration >= self.idle_threshold;

        match (self.is_idle, is_now_idle) {
            // Became idle
            (false, true) => {
                self.is_idle = true;
                self.idle_start = Some(Instant::now());
                tracing::info!("User became idle");
                IdleEvent::BecameIdle
            }
            // Returned from idle
            (true, false) => {
                self.is_idle = false;
                let duration = self.idle_start.map(|s| s.elapsed()).unwrap_or_default();
                self.idle_start = None;
                tracing::info!("User returned from idle after {:?}", duration);
                IdleEvent::ReturnedFromIdle {
                    idle_duration: duration,
                }
            }
            // No change
            _ => IdleEvent::None,
        }
    }

    /// Check if currently idle
    pub fn is_idle(&self) -> bool {
        self.is_idle
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idle_event_debug() {
        let event = IdleEvent::BecameIdle;
        assert!(format!("{:?}", event).contains("BecameIdle"));
    }
}
