# Postie

A small Postman replacement for Windows, built with Tauri 2 + Vue 3. No collections, no account, no sync: import a request, edit it, send it.

## Features

- **Import** from curl (bash or Chrome DevTools "Copy as cURL (cmd)", several commands at once) or a Postman collection v2.1 JSON. Folders are flattened to `Folder / Request` names, collection variables (`{{var}}`) and inherited auth are resolved on import.
- **Request editor**: method, URL, query params (synced with the URL), headers, body (raw / x-www-form-urlencoded), auth (Bearer / Basic).
- **Send** through Rust (`reqwest`), so there is no CORS and any header can be set. Cancel, timeout and "Ignore SSL errors" are supported.
- **Response**: status, time, size, pretty-printed JSON, headers, copy.
- **Saved list**: every sent or saved request is kept in `%APPDATA%\com.oliverhuang.postie\history.json`.

Shortcuts: `Ctrl+Enter` send, `Ctrl+S` save.

Not supported: multipart/form-data (file fields from Postman are dropped), environments, scripts/tests.

## Prerequisites

- Node.js 20.19+
- Rust (stable, MSVC toolchain) and Visual Studio C++ Build Tools
- WebView2 (preinstalled on Windows 11)

## Develop

```powershell
npm install
npm run tauri dev
```

## Install (adds a Start menu shortcut)

```powershell
.\scripts\install.ps1
```

This builds `src-tauri\target\release\bundle\nsis\Postie_<version>_x64-setup.exe` and installs it silently for the current user. Uninstall from Settings > Apps.
