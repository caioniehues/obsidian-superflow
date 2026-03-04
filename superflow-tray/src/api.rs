//! HTTP client for SuperFlow plugin API

use anyhow::{Context, Result};
use reqwest::Client;

/// HTTP client for plugin API communication
pub struct ApiClient {
    client: Client,
    base_url: String,
    token: Option<String>,
}

impl ApiClient {
    /// Create a new API client
    pub fn new(port: u16, token: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: format!("http://localhost:{}", port),
            token,
        }
    }

    /// Build request with optional auth header
    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.request(method, format!("{}{}", self.base_url, path));

        if let Some(ref token) = self.token {
            req = req.bearer_auth(token);
        }

        req
    }

    /// Start tracking a task by its vault path
    pub async fn start_task(&self, task_path: &str) -> Result<()> {
        let resp = self
            .request(reqwest::Method::POST, "/api/tasks/start")
            .json(&serde_json::json!({ "path": task_path }))
            .send()
            .await
            .context("Failed to send start task request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Start task failed: {} - {}", status, body);
        }

        tracing::info!("Started task: {}", task_path);
        Ok(())
    }

    /// Stop tracking a task
    pub async fn stop_task(&self, task_path: &str) -> Result<()> {
        let resp = self
            .request(reqwest::Method::POST, "/api/tasks/stop")
            .json(&serde_json::json!({ "path": task_path }))
            .send()
            .await
            .context("Failed to send stop task request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Stop task failed: {} - {}", status, body);
        }

        tracing::info!("Stopped task: {}", task_path);
        Ok(())
    }

    /// Pause the pomodoro/timer
    pub async fn pause_pomodoro(&self) -> Result<()> {
        let resp = self
            .request(reqwest::Method::POST, "/api/pomodoro/pause")
            .send()
            .await
            .context("Failed to send pause request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Pause failed: {} - {}", status, body);
        }

        tracing::info!("Paused pomodoro");
        Ok(())
    }

    /// Resume the pomodoro/timer
    pub async fn resume_pomodoro(&self) -> Result<()> {
        let resp = self
            .request(reqwest::Method::POST, "/api/pomodoro/resume")
            .send()
            .await
            .context("Failed to send resume request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Resume failed: {} - {}", status, body);
        }

        tracing::info!("Resumed pomodoro");
        Ok(())
    }

    /// Start a break session
    pub async fn start_break(&self) -> Result<()> {
        let resp = self
            .request(reqwest::Method::POST, "/api/pomodoro/break")
            .send()
            .await
            .context("Failed to send break request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Start break failed: {} - {}", status, body);
        }

        tracing::info!("Started break");
        Ok(())
    }

    /// Check if the plugin API is reachable
    pub async fn health_check(&self) -> Result<bool> {
        match self
            .request(reqwest::Method::GET, "/api/health")
            .send()
            .await
        {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = ApiClient::new(8080, None);
        assert_eq!(client.base_url, "http://localhost:8080");
        assert!(client.token.is_none());
    }

    #[test]
    fn test_client_with_token() {
        let client = ApiClient::new(9090, Some("secret".to_string()));
        assert_eq!(client.base_url, "http://localhost:9090");
        assert_eq!(client.token, Some("secret".to_string()));
    }
}
