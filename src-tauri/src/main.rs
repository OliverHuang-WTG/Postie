#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    error::Error,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;

#[derive(Serialize, Deserialize)]
struct Header {
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequest {
    id: u64,
    method: String,
    url: String,
    headers: Vec<Header>,
    body: Option<String>,
    timeout_ms: u64,
    ignore_ssl: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    status: u16,
    status_text: String,
    headers: Vec<Header>,
    body: String,
    size: usize,
    elapsed_ms: u64,
}

#[derive(Default)]
struct InFlight(Mutex<HashMap<u64, oneshot::Sender<()>>>);

// Requests go through Rust rather than the webview's fetch so CORS, forbidden headers and certificate checks don't apply.
#[tauri::command]
async fn send_request(req: HttpRequest, in_flight: State<'_, InFlight>) -> Result<HttpResponse, String> {
    let id = req.id;
    let (cancel_tx, cancel_rx) = oneshot::channel();
    in_flight.0.lock().unwrap().insert(id, cancel_tx);
    let result = tokio::select! {
        r = execute(req) => r,
        _ = cancel_rx => Err("Request cancelled".to_string()),
    };
    in_flight.0.lock().unwrap().remove(&id);
    result
}

#[tauri::command]
fn cancel_request(id: u64, in_flight: State<'_, InFlight>) {
    if let Some(tx) = in_flight.0.lock().unwrap().remove(&id) {
        let _ = tx.send(());
    }
}

async fn execute(req: HttpRequest) -> Result<HttpResponse, String> {
    let mut client = reqwest::Client::builder().danger_accept_invalid_certs(req.ignore_ssl);
    if req.timeout_ms > 0 {
        client = client.timeout(Duration::from_millis(req.timeout_ms));
    }
    let client = client.build().map_err(|e| describe(&e))?;

    let method = reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|e| describe(&e))?;
    let mut builder = client.request(method, &req.url);
    for h in req.headers {
        builder = builder.header(h.name, h.value);
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let started = Instant::now();
    let resp = builder.send().await.map_err(|e| describe(&e))?;
    let status = resp.status();
    let headers = resp
        .headers()
        .iter()
        .map(|(k, v)| Header {
            name: k.to_string(),
            value: String::from_utf8_lossy(v.as_bytes()).into_owned(),
        })
        .collect();
    let bytes = resp.bytes().await.map_err(|e| describe(&e))?;

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        headers,
        size: bytes.len(),
        body: String::from_utf8_lossy(&bytes).into_owned(),
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

// reqwest's top-level message ("error sending request") hides the actual cause (DNS, TLS, refused...).
fn describe(e: &dyn Error) -> String {
    let mut msg = e.to_string();
    let mut source = e.source();
    while let Some(s) = source {
        msg.push_str(&format!("\n  caused by: {s}"));
        source = s.source();
    }
    msg
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history.json"))
}

#[tauri::command]
fn load_history(app: AppHandle) -> Result<String, String> {
    match std::fs::read_to_string(history_path(&app)?) {
        Ok(json) => Ok(json),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_history(app: AppHandle, json: String) -> Result<(), String> {
    std::fs::write(history_path(&app)?, json).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(InFlight::default())
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            load_history,
            save_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running Postie");
}
