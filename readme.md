# Zombie Dev Watcher 🧟

![Build Status](https://github.com/v01g/ZombieDevWatcher/actions/workflows/manual_release.yml/badge.svg)

A simplified cross-platform utility to prevent "zombie" dev-server processes from accumulating on your system. 

## 📥 Download Latest Release

| Platform | Architecture | Download Link |
| :--- | :--- | :--- |
| **Windows** | x64 | [zombie-watcher-win.exe](https://github.com/v01g/ZombieDevWatcher/releases/latest/download/zombie-watcher-win.exe) |
| **Linux** | x64 | [zombie-watcher-linux](https://github.com/v01g/ZombieDevWatcher/releases/latest/download/zombie-watcher-linux) |
| **macOS** | Intel (x64) | [zombie-watcher-macos](https://github.com/v01g/ZombieDevWatcher/releases/latest/download/zombie-watcher-macos) |
| **macOS** | Silicon (ARM64) | [zombie-watcher-macos-arm64](https://github.com/v01g/ZombieDevWatcher/releases/latest/download/zombie-watcher-macos-arm64) | 

## 📦 Install via NPM (Requires Bun)

If you have [Bun installed](https://bun.sh/), you can run it directly:

```bash
# Run one-off
bunx zombie-dev-watcher

# Install globally
npm install -g zombie-dev-watcher
zombie-watcher
```

## Description

It launches itself on a **lock port** (default `322`) and watches one or more **target ports** (default `5173`). When a new process starts on a higher port in the range, the watcher automatically kills the old process to free up resources.

## Key Features
- **Cross-Platform**: Works on **Windows**, **macOS**, and **Linux**.
- **Auto-Kill Zombies**: Prevents "marching ports" (5173 -> 5174 -> 5175...) by killing the old process when a new one appears.
- **Singleton / Multi-Instance**: 
    - Binds to port **322** to ensure usage as a singleton for a specific set of watched ports.
    - If 322 is taken, it automatically tries **323, 324... up to 332**, allowing you to run multiple independent watchers for different projects.
- **Multi-Port Support**: Watch multiple base ports simultaneously (e.g., `5173` and `3000`).
- **Lightweight**: Built with Bun.
- **Safe**: Includes `--dry-run` and allowlist filtering.

## Usage

```bash
# Run with default settings (Base: 5173, Lock Port: 322)
./zombie-watcher.exe  # Windows
./zombie-watcher      # macOS/Linux

# Watch multiple ports (e.g., Vite and a backend API)
zombie-watcher --base "5173,3000,8080"

# Dry-run mode (see what would be killed)
zombie-watcher --dry-run
```

### Options
- `--base <ports>`: Comma-separated list of base ports to watch (Default: `5173`).
- `--range <n>`: Range to scan for each base port (Default: `20`).
- `--filter <names>`: Semicolon-separated list of allowed process names (Default: `bun;node;npm;npx;pnpm;yarn;vite;deno;go;air;python;python3;uvicorn;flask;ruby;rails;java;gradle;mvn;php;swift;dotnet`).
- `--strategy <type>`: `chain` (kill n-1) or `kill-base` (kill base).

## Installation / Build

This project uses **Bun**.

### Build Manually
```bash
bun install
# Build for your current platform
bun run build
```

### GitHub Workflow
This repository includes a manual GitHub workflow to build and release the executable for all platforms:
- `zombie-watcher-win.exe` (Windows x64)
- `zombie-watcher-linux` (Linux x64)
- `zombie-watcher-macos` (macOS x64)
- `zombie-watcher-macos-arm64` (macOS Silicon)

1. Go to **Actions** tab.
2. Select **Manual Release Build**.
3. Click **Run workflow**.