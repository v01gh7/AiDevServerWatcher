# Zombie Dev Watcher 🧟

![Build Status](https://github.com/v01gh7/ZombieDevWatcher/actions/workflows/manual_release.yml/badge.svg)

A simplified cross-platform utility to prevent "zombie" dev-server processes from accumulating on your system. 

## 💖 Support the Project

**The program is free, but even a 30-cent donation helps!**

I develop RapidWhisper in my free time and **every donation motivates me to keep improving it**. Even if you can't donate — **just hop into Discord and say that the app helps you**. That feedback alone makes it all worth it!

**Ways to support:**

| Platform | Link |
|----------|------|
| 💰 **Streamlabs** | [streamlabs.com/v01gh7/tip](https://streamlabs.com/v01gh7/tip) |
| 🎁 **Donatex** | [donatex.gg/donate/v01gh7](https://donatex.gg/donate/v01gh7) |
| ☕ **Ko-fi** | [ko-fi.com/v01gh7](https://ko-fi.com/v01gh7) |
| 💬 **Discord** | [discord.gg/f37B7eKq](https://discord.gg/f37B7eKq) — drop a message that it helps! |

---

## 📥 Download Latest Release

| Platform | Architecture | Download Link |
| :--- | :--- | :--- |
| **Windows** | x64 | [zombie-watcher-win.exe](https://github.com/v01gh7/ZombieDevWatcher/releases/latest/download/zombie-watcher-win.exe) |
| **Linux** | x64 | [zombie-watcher-linux](https://github.com/v01gh7/ZombieDevWatcher/releases/latest/download/zombie-watcher-linux) |
| **macOS** | Intel (x64) | [zombie-watcher-macos](https://github.com/v01gh7/ZombieDevWatcher/releases/latest/download/zombie-watcher-macos) |
| **macOS** | Silicon (ARM64) | [zombie-watcher-macos-arm64](https://github.com/v01gh7/ZombieDevWatcher/releases/latest/download/zombie-watcher-macos-arm64) | 

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

The tool operates in two modes:

1. **Port Mode** (Default): Watches target ports (e.g., `5173`). When a new process starts on a higher port in the range, the watcher automatically kills the old process to free up resources.
2. **Process Mode** (`--mode process`): Watches for **duplicate processes** based on their command line arguments. If you launch the same script/command again, the old instance is killed. It also supports killing processes that run for too long.

## Key Features
- **Cross-Platform**: Works on **Windows**, **macOS**, and **Linux**.
- **Auto-Kill Zombies**: Prevents "marching ports" (5173 -> 5174 -> 5175...) by killing the old process when a new one appears.
- **Process Deduplication**: Kills older instances of the exact same command line to prevent duplicates.
- **Max Age Timeout**: Automatically kill processes that have been running for too long (e.g., > 30 mins).
- **Singleton / Multi-Instance**: 
    - Binds to port **322** to ensure usage as a singleton for a specific set of watched ports.
    - If 322 is taken, it automatically tries **323, 324... up to 332**, allowing you to run multiple independent watchers for different projects.

## Usage

### 1. Port Watcher (Default)

Matches processes by **port usage**.

```bash
# Run with default settings (Base: 5173, Lock Port: 322)
./zombie-watcher.exe

# Watch multiple ports (e.g., Vite and a backend API)
zombie-watcher --base "5173,3000,8080"
```

### 2. Process Watcher (New)

Matches processes by **exact command line**. Useful for scripts that don't bind ports or when you want to ensure only one instance of a specific task runs.

```bash
# Watch for duplicate node/bun processes and kill the old ones
zombie-watcher --mode process --filter "node;bun"

# Kill any node process that runs longer than 30 minutes
zombie-watcher --mode process --max-age 30
```

### Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `-m, --mode` | Watch mode: `port` or `process` | `port` |
| `-b, --base` | Base ports to watch (Port Mode) | `5173` |
| `-r, --range` | Port range to scan | `20` |
| `-f, --filter` | Filter process names (semicolon separated) | `bun;node;npm;...` |
| `--max-age` | Kill processes older than N minutes (Process Mode) | `0` (Disabled) |
| `--cleanup` | One-off kill of processes older than max-age | `false` |
| `-d, --dry-run` | Log what would be killed without killing | `false` |

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