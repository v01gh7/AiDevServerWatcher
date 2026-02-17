import { EventEmitter } from "events";
import { getPorts, getProcessInfo, killProcess } from "./system";
import { type WatcherConfig, type ProcessInfo } from "./types";
import chalk from "chalk";

export class PortWatcher extends EventEmitter {
    private config: WatcherConfig;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private knownPorts: Map<number, number> = new Map(); // Port -> PID

    constructor(config: WatcherConfig) {
        super();
        this.config = config;
    }

    public async start() {
        console.log(chalk.cyan(`[Watcher] Starting on port ${this.config.basePort} (+${this.config.range})...`));
        if (this.config.dryRun) {
            console.log(chalk.yellow(`[Dry-Run] No processes will be actually killed.`));
        }
        
        // Initial scan
        this.knownPorts = await getPorts(this.config.basePort, this.config.range);
        console.log(chalk.gray(`[Watcher] Initial scan found ${this.knownPorts.size} active ports.`));

        this.intervalId = setInterval(() => this.tick(), this.config.interval);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log(chalk.cyan(`[Watcher] Stopped.`));
    }

    private async tick() {
        const currentPorts = await getPorts(this.config.basePort, this.config.range);
        
        // Detect new ports
        for (const [port, pid] of currentPorts) {
            if (!this.knownPorts.has(port)) {
                // New port detected!
                this.handleNewPort(port, pid);
            } else {
                // Check if PID changed on same port (restart on same port)
                const oldPid = this.knownPorts.get(port);
                if (oldPid !== pid) {
                    console.log(chalk.gray(`[Info] Port ${port} PID changed: ${oldPid} -> ${pid}`));
                }
            }
        }

        // Update detection state
        this.knownPorts = currentPorts;
    }

    private async handleNewPort(newPort: number, newPid: number) {
        console.log(chalk.green(`[Detected] New process on port ${newPort} (PID: ${newPid})`));
        
        let targetPort = -1;

        if (this.config.strategy === 'chain') {
            // Kill n-1
            targetPort = newPort - 1;
        } else if (this.config.strategy === 'kill-base') {
            // Kill base if new > base
            if (newPort > this.config.basePort) {
                targetPort = this.config.basePort;
            }
        }

        // If target valid and exists
        if (targetPort >= this.config.basePort && this.knownPorts.has(targetPort)) {
            const targetPid = this.knownPorts.get(targetPort);
            if (!targetPid || targetPid === newPid) return; // Don't kill self if logic is weird

            await this.tryKill(targetPort, targetPid, newPort);
        }
    }

    private async tryKill(port: number, pid: number, triggeredByPort: number) {
        // Safe check: verify process still exists and matches filter
        const info = await getProcessInfo(pid);
        
        if (!info) {
            console.log(chalk.yellow(`[Skip] Process on port ${port} (PID: ${pid}) already gone.`));
            return;
        }

        if (!this.matchesFilter(info)) {
            console.log(chalk.yellow(`[Skip] Process on port ${port} (PID: ${pid}) does not match filter.`));
            // console.log(chalk.gray(`      Command: ${info.command}`));
            return;
        }

        console.log(chalk.red.bold(`[KILL] Strategy triggered by port ${triggeredByPort}. Killing port ${port} (PID: ${pid})...`));
        
        if (this.config.dryRun) {
            console.log(chalk.yellow(`[Dry-Run] Would execute: taskkill /PID ${pid} /F`));
        } else {
            const success = await killProcess(pid, true); // Force kill
            if (success) {
                console.log(chalk.green(`[Success] Process ${pid} killed.`));
            } else {
                console.log(chalk.red(`[Error] Failed to kill process ${pid}.`));
            }
        }
    }

    private matchesFilter(info: ProcessInfo): boolean {
        if (!this.config.filter || this.config.filter.length === 0) return false;

        // info.command is the raw output line from wmic usually
        const cmd = (info.command || "").toLowerCase();
        
        // If "node" is in filter and command line has "node"
        return this.config.filter.some(f => cmd.includes(f.toLowerCase()));
    }
}
