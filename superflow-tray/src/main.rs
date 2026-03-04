//! SuperFlow Tray - System tray companion for Obsidian SuperFlow

mod api;
mod config;
mod dialogs;
mod idle;
mod notifications;
mod state;
mod tray;

use anyhow::{Context, Result};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch};
use tray_icon::menu::MenuEvent;

use api::ApiClient;
use config::Config;
use dialogs::IdleReturnChoice;
use idle::{IdleEvent, IdleMonitor};
use state::{parse_state, SuperFlowState};
use tray::{MenuAction, TrayManager};

/// Channel capacity for events
const CHANNEL_CAPACITY: usize = 32;

/// Interval for idle checking (seconds)
const IDLE_CHECK_INTERVAL: u64 = 5;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize GTK (required by libayatana-appindicator on Linux)
    #[cfg(target_os = "linux")]
    gtk::init().context("Failed to initialize GTK")?;

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("superflow_tray=info".parse().unwrap()),
        )
        .init();

    tracing::info!("Starting SuperFlow Tray");

    // Load configuration
    let config = Config::load()?;
    tracing::info!("Config loaded: port={}, idle_threshold={}s",
        config.api_port, config.idle_threshold_secs);

    // Ensure config directory exists
    Config::ensure_config_dir()?;

    // Initialize API client
    let api = Arc::new(ApiClient::new(config.api_port, config.api_token.clone()));

    // Check API connectivity
    if !api.health_check().await.unwrap_or(false) {
        tracing::warn!("Plugin API not reachable at port {}", config.api_port);
    }

    // Initialize idle monitor
    let idle_threshold = Duration::from_secs(config.idle_threshold_secs);
    let idle_monitor = IdleMonitor::new(idle_threshold).await
        .context("Failed to initialize idle monitor")?;

    // State file watcher channel
    let (state_tx, state_rx) = watch::channel::<Option<SuperFlowState>>(None);

    // Menu action channel
    let (menu_tx, menu_rx) = mpsc::channel::<MenuAction>(CHANNEL_CAPACITY);

    // Idle event channel
    let (idle_tx, idle_rx) = mpsc::channel::<IdleEvent>(CHANNEL_CAPACITY);

    // Start file watcher
    let state_file = config.state_file.clone();
    tokio::spawn(watch_state_file(state_file, state_tx));

    // Start idle monitor loop
    tokio::spawn(idle_monitor_loop(idle_monitor, idle_tx));

    // Start menu event handler
    let menu_tx_clone = menu_tx.clone();
    std::thread::spawn(move || menu_event_loop(menu_tx_clone));

    // Run main event loop (must be on main thread for tray-icon)
    run_event_loop(config, api, state_rx, menu_rx, idle_rx).await
}

/// Watch state file for changes
async fn watch_state_file(
    path: std::path::PathBuf,
    tx: watch::Sender<Option<SuperFlowState>>,
) {
    let (notify_tx, mut notify_rx) = mpsc::channel::<()>(1);

    // Create file watcher
    let mut watcher: RecommendedWatcher = match notify::recommended_watcher(
        move |result: Result<Event, notify::Error>| {
            if let Ok(event) = result {
                if event.kind.is_modify() || event.kind.is_create() {
                    let _ = notify_tx.blocking_send(());
                }
            }
        },
    ) {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("Failed to create file watcher: {}", e);
            return;
        }
    };

    // Watch parent directory (state file may not exist yet)
    if let Some(parent) = path.parent() {
        if let Err(e) = watcher.watch(parent, RecursiveMode::NonRecursive) {
            tracing::error!("Failed to watch directory: {}", e);
            return;
        }
    }

    tracing::info!("Watching state file: {}", path.display());

    // Initial read
    if path.exists() {
        match parse_state(&path) {
            Ok(state) => {
                let _ = tx.send(Some(state));
            }
            Err(e) => tracing::warn!("Initial state read failed: {}", e),
        }
    }

    // Watch for changes
    while notify_rx.recv().await.is_some() {
        // Small delay for file to be fully written
        tokio::time::sleep(Duration::from_millis(50)).await;

        if path.exists() {
            match parse_state(&path) {
                Ok(state) => {
                    tracing::debug!("State updated");
                    let _ = tx.send(Some(state));
                }
                Err(e) => tracing::warn!("Failed to parse state: {}", e),
            }
        }
    }
}

/// Monitor idle state periodically
async fn idle_monitor_loop(
    mut monitor: IdleMonitor,
    tx: mpsc::Sender<IdleEvent>,
) {
    let interval = Duration::from_secs(IDLE_CHECK_INTERVAL);

    loop {
        tokio::time::sleep(interval).await;

        let event = monitor.check_idle().await;
        if !matches!(event, IdleEvent::None) {
            if tx.send(event).await.is_err() {
                break;
            }
        }
    }
}

/// Handle menu events in separate thread (required by tray-icon)
fn menu_event_loop(tx: mpsc::Sender<MenuAction>) {
    loop {
        if let Ok(event) = MenuEvent::receiver().recv() {
            if let Some(action) = TrayManager::parse_menu_event(&event) {
                if tx.blocking_send(action).is_err() {
                    break;
                }
            }
        }
    }
}

/// Main event loop
async fn run_event_loop(
    config: Config,
    api: Arc<ApiClient>,
    mut state_rx: watch::Receiver<Option<SuperFlowState>>,
    mut menu_rx: mpsc::Receiver<MenuAction>,
    mut idle_rx: mpsc::Receiver<IdleEvent>,
) -> Result<()> {
    // Initialize tray (must be on main thread)
    let mut tray = TrayManager::new()?;
    tracing::info!("Tray initialized");

    // Track continuous work time for break reminders
    let mut work_start: Option<Instant> = None;
    let mut last_break_reminder: Option<Instant> = None;
    let break_threshold = Duration::from_secs(config.break_reminder_secs);

    // Track whether we paused due to idle
    let mut idle_paused = false;

    loop {
        tokio::select! {
            // State file changed
            Ok(()) = state_rx.changed() => {
                if let Some(ref state) = *state_rx.borrow() {
                    // Update tray display
                    tray.update(state);
                    tray.set_menu(
                        &state.today_tasks,
                        state.current_task.as_ref().map(|t| t.path.as_str()),
                    );

                    // Track work time for break reminders
                    if state.timer.is_running && state.timer.session_type == "work" {
                        if work_start.is_none() {
                            work_start = Some(Instant::now());
                        }

                        // Check for break reminder
                        if let Some(start) = work_start {
                            let worked = start.elapsed();
                            let should_remind = worked >= break_threshold
                                && last_break_reminder
                                    .map(|t| t.elapsed() > Duration::from_secs(600))
                                    .unwrap_or(true);

                            if should_remind {
                                let mins = worked.as_secs() / 60;
                                if let Err(e) = notifications::notify_break_reminder(mins) {
                                    tracing::warn!("Failed to send break reminder: {}", e);
                                }
                                last_break_reminder = Some(Instant::now());
                            }
                        }
                    } else {
                        work_start = None;
                    }
                }
            }

            // Menu action
            Some(action) = menu_rx.recv() => {
                handle_menu_action(action, &api, &state_rx).await;
            }

            // Idle event
            Some(event) = idle_rx.recv() => {
                idle_paused = handle_idle_event(
                    event,
                    &api,
                    &state_rx,
                    idle_paused,
                ).await;
            }
        }
    }
}

/// Handle menu actions
async fn handle_menu_action(
    action: MenuAction,
    api: &ApiClient,
    state_rx: &watch::Receiver<Option<SuperFlowState>>,
) {
    match action {
        MenuAction::SwitchTask(path) => {
            // Stop current task if any
            if let Some(ref state) = *state_rx.borrow() {
                if let Some(ref current) = state.current_task {
                    if current.path != path {
                        if let Err(e) = api.stop_task(&current.path).await {
                            tracing::error!("Failed to stop current task: {}", e);
                        }
                    }
                }
            }
            // Start new task
            if let Err(e) = api.start_task(&path).await {
                tracing::error!("Failed to start task: {}", e);
            }
        }

        MenuAction::TogglePause => {
            if let Some(ref state) = *state_rx.borrow() {
                if state.timer.is_running {
                    if let Err(e) = api.pause_pomodoro().await {
                        tracing::error!("Failed to pause: {}", e);
                    }
                } else {
                    if let Err(e) = api.resume_pomodoro().await {
                        tracing::error!("Failed to resume: {}", e);
                    }
                }
            }
        }

        MenuAction::TakeBreak => {
            if let Err(e) = api.start_break().await {
                tracing::error!("Failed to start break: {}", e);
            }
        }

        MenuAction::ShowObsidian => {
            // Try to focus Obsidian window via wmctrl or xdotool
            let _ = tokio::process::Command::new("wmctrl")
                .args(["-a", "Obsidian"])
                .spawn();
        }

        MenuAction::Quit => {
            tracing::info!("Quit requested");
            std::process::exit(0);
        }
    }
}

/// Handle idle events, returns whether we're in idle-paused state
async fn handle_idle_event(
    event: IdleEvent,
    api: &ApiClient,
    state_rx: &watch::Receiver<Option<SuperFlowState>>,
    was_idle_paused: bool,
) -> bool {
    match event {
        IdleEvent::BecameIdle => {
            // Only pause if timer is running
            if let Some(ref state) = *state_rx.borrow() {
                if state.timer.is_running {
                    if let Err(e) = api.pause_pomodoro().await {
                        tracing::error!("Failed to pause on idle: {}", e);
                        return false;
                    }

                    // Notify user
                    if let Some(ref task) = state.current_task {
                        let _ = notifications::notify_idle_paused(&task.title);
                    }

                    return true;
                }
            }
            false
        }

        IdleEvent::ReturnedFromIdle { idle_duration } => {
            if !was_idle_paused {
                return false;
            }

            // Show dialog asking what user was doing
            let task_title = state_rx
                .borrow()
                .as_ref()
                .and_then(|s| s.current_task.as_ref())
                .map(|t| t.title.clone())
                .unwrap_or_else(|| "your task".to_string());

            match dialogs::show_idle_return_dialog(&task_title, idle_duration).await {
                Ok(IdleReturnChoice::WasWorking) => {
                    // Keep time, resume
                    if let Err(e) = api.resume_pomodoro().await {
                        tracing::error!("Failed to resume: {}", e);
                    }
                }
                Ok(IdleReturnChoice::WasOnBreak) => {
                    // Log as break, resume
                    // TODO: Call API to log break time
                    if let Err(e) = api.resume_pomodoro().await {
                        tracing::error!("Failed to resume: {}", e);
                    }
                }
                Ok(IdleReturnChoice::DiscardTime) => {
                    // TODO: Call API to subtract idle duration
                    if let Err(e) = api.resume_pomodoro().await {
                        tracing::error!("Failed to resume: {}", e);
                    }
                }
                Ok(IdleReturnChoice::Cancel) | Err(_) => {
                    // User cancelled, just resume
                    if let Err(e) = api.resume_pomodoro().await {
                        tracing::error!("Failed to resume: {}", e);
                    }
                }
            }

            false
        }

        IdleEvent::None => was_idle_paused,
    }
}
