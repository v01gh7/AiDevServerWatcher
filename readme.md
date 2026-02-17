# Zombie Dev Watcher 🧟

A simplified utility to prevent "zombie" dev-server processes from accumulating on your system. 

It launches itself on a **lock port** (default `322`) and watches one or more **target ports** (default `5173`). When a new process starts on a higher port in the range, the watcher automatically kills the old process to free up resources.

## Key Features
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
zombie-watcher.exe

# Watch multiple ports (e.g., Vite and a backend API)
zombie-watcher.exe --base "5173,3000,8080"

# Dry-run mode (see what would be killed)
zombie-watcher.exe --dry-run
```

### Options
- `--base <ports>`: Comma-separated list of base ports to watch (Default: `5173`).
- `--range <n>`: Range to scan for each base port (Default: `20`).
- `--filter <names>`: Semicolon-separated list of allowed process names (Default: `node;nuxi;vite;npm`).
- `--strategy <type>`: `chain` (kill n-1) or `kill-base` (kill base).

## Installation / Build

This project uses **Bun**.

### Build Manually
```bash
bun install
bun run build
# Creates: zombie-watcher.exe
```

### GitHub Workflow
This repository includes a manual GitHub workflow to build and release the executable.
1. Go to **Actions** tab.
2. Select **Manual Release Build**.
3. Click **Run workflow**.

This will build `zombie-watcher.exe` and update the release tag.
