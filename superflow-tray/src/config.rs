//! Configuration loading from ~/.config/superflow/tray.toml

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::PathBuf;

/// Application configuration with sensible defaults
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Plugin HTTP API port
    pub api_port: u16,
    /// Optional bearer token for API auth
    pub api_token: Option<String>,
    /// Path to state.json written by StateWriterService
    pub state_file: PathBuf,
    /// Idle threshold in seconds before pausing (default: 5 min)
    pub idle_threshold_secs: u64,
    /// Continuous work threshold for break reminder (default: 55 min)
    pub break_reminder_secs: u64,
}

impl Default for Config {
    fn default() -> Self {
        let state_file = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("~/.config"))
            .join("superflow")
            .join("state.json");

        Self {
            api_port: 8080,
            api_token: None,
            state_file,
            idle_threshold_secs: 300,     // 5 minutes
            break_reminder_secs: 3300,    // 55 minutes
        }
    }
}

impl Config {
    /// Load configuration from tray.toml, falling back to defaults
    pub fn load() -> Result<Self> {
        let config_path = dirs::config_dir()
            .context("Could not determine config directory")?
            .join("superflow")
            .join("tray.toml");

        if config_path.exists() {
            let contents = std::fs::read_to_string(&config_path)
                .with_context(|| format!("Failed to read {}", config_path.display()))?;

            let config: Config = toml::from_str(&contents)
                .with_context(|| format!("Failed to parse {}", config_path.display()))?;

            tracing::info!("Loaded config from {}", config_path.display());
            Ok(config)
        } else {
            tracing::info!("No config file found, using defaults");
            Ok(Config::default())
        }
    }

    /// Ensure config directory exists
    pub fn ensure_config_dir() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .context("Could not determine config directory")?
            .join("superflow");

        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir)
                .with_context(|| format!("Failed to create {}", config_dir.display()))?;
        }

        Ok(config_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.api_port, 8080);
        assert_eq!(config.idle_threshold_secs, 300);
        assert_eq!(config.break_reminder_secs, 3300);
        assert!(config.api_token.is_none());
    }

    #[test]
    fn test_parse_partial_config() {
        let toml = r#"
            api_port = 9090
        "#;
        let config: Config = toml::from_str(toml).unwrap();
        assert_eq!(config.api_port, 9090);
        // Other fields should have defaults
        assert_eq!(config.idle_threshold_secs, 300);
    }
}
