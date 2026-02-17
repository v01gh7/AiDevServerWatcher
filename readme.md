# Port Watcher - Walkthrough

I have implemented the **Port Watcher** utility, a CLI tool to manage dev-server processes and prevent port accumulation (zombies).

## Features Implemented
- **Port Monitoring**: Scans TCP ports in a given range (default `+20` from base).
- **Strategies**:
    - `chain` (Default): If new port `N` opens, kill `N-1`.
    - `kill-base`: If any new port opens, kill the `base` port.
- **Safety**:
    - **Dry Run** (`--dry-run`): Logs what would be killed without action.
    - **Filter/Allowlist** (`--filter`): Only kills processes matching specific names (e.g., `node`, `nuxi`).
- **Cross-Platform Core**: Built with Bun + TypeScript. Optimized for Windows (`netstat`, `wmic`, `taskkill`).

## Usage

### Run from Source (Recommended)
You can run the utility directly using `bun`:

```bash
bun src/index.ts --base 3000 --dry-run
```

### Build Binary
To build a standalone executable:

```bash
bun build src/index.ts --compile --outfile port-watcher.exe
```

> [!NOTE]
> The compiled binary may have issues with spawning subprocesses on some Windows environments (observed `Timeout` errors). Running from source is more reliable currently.

## Verification

I performed manual verification using a dummy server script ([test-server.js](file:///d:/_DEV_/SelfProjects/CLI_TOOLS/AiDevServerWatcher/test-server.js)) to simulate port conflicts.

### Scenario: Chain Strategy
1. **Start Server A** on port `3000`.
2. **Start Watcher** on `3000` (Strategy: Chain, Dry-Run).
3. **Start Server B** on port `3001`.
4. **Result**: Watcher detects `3001` and identifies `3000` as the target to kill.

```log
[Detected] New process on port 3001 (PID: 30128)
[KILL] Strategy triggered by port 3001. Killing port 3000 (PID: 27696)...
[Dry-Run] Would execute: taskkill /PID 27696 /F
```

## Configuration Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--base <n>` | Base port to watch | Required |
| `--range <n>` | Port range scan limit | `20` |
| `--interval <ms>` | Polling interval | `1000` |
| `--strategy <type>` | `chain` or `kill-base` | `chain` |
| `--filter <names>` | Process names to allow killing | `node;nuxi;vite;npm` |
| `--dry-run` | Log only | `false` |

## Code Structure
- [src/index.ts](file:///d:/_DEV_/SelfProjects/CLI_TOOLS/AiDevServerWatcher/src/index.ts): CLI entry point.
- [src/watcher.ts](file:///d:/_DEV_/SelfProjects/CLI_TOOLS/AiDevServerWatcher/src/watcher.ts): Core logic (Loop, Detection, Strategy).
- [src/system.ts](file:///d:/_DEV_/SelfProjects/CLI_TOOLS/AiDevServerWatcher/src/system.ts): Low-level system commands (netstat, wmic, taskkill).
