# Port Watcher

A simplified utility to prevent "zombie" dev-server processes from accumulating on your system. 

It launches itself on port **322** (as a singleton lock) and watches a target port range (defaulting to **5173** for Vite, etc.). When a new process starts on a higher port in the range, the watcher automatically kills the old process to free up resources.

## Key Features
- **Auto-Kill Zombies**: Prevents "marching ports" (5173 -> 5174 -> 5175...) by killing the old process when a new one appears.
- **Singleton**: Binds to port **322** to ensure only one watcher runs at a time.
- **Lightweight**: Built with Bun.
- **Safe**: Includes `--dry-run` and allowlist filtering.

## Usage

```bash
# Run with default settings (Base: 5173, Lock Port: 322)
port-watcher.exe

# Custom base port to watch
port-watcher.exe --base 3000

# Dry-run mode (see what would be killed)
port-watcher.exe --dry-run
```

### Options
- `--base <n>`: Base port to watch (Default: `5173`).
- `--range <n>`: Range to scan (Default: `20`).
- `--filter <names>`: Semicolon-separated list of allowed process names (Default: `node;nuxi;vite;npm`).
- `--strategy <type>`: `chain` (kill n-1) or `kill-base` (kill base).

## Installation / Build

This project uses **Bun**.

### Build Manually
```bash
bun install
bun build src/index.ts --compile --outfile port-watcher.exe
```

### GitHub Workflow
This repository includes a manual GitHub workflow to build and release the executable.
1. Go to **Actions** tab.
2. Select **Manual Release Build**.
3. Click **Run workflow**.

This will build the executable and update the release tag with the new binary.
