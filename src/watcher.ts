import { EventEmitter } from "events";
import { getAllTcpPorts, getProcessInfo, killProcess } from "./system";
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
        console.log(chalk.cyan(`[Watcher] Starting...`));
        console.log(chalk.cyan(`[Watcher] Monitoring ports:`));
        for (const base of this.config.basePorts) {
            console.log(chalk.cyan(`  - ${base} (+${this.config.range})`));
        }

        if (this.config.dryRun) {
            console.log(chalk.yellow(`[Dry-Run] No processes will be actually killed.`));
        }
        
        // Initial scan
        this.knownPorts = await getAllTcpPorts();
        console.log(chalk.gray(`[Watcher] Initial scan found ${this.knownPorts.size} active TCP ports.`));

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
        const allPorts = await getAllTcpPorts();
        
        // Check for new ports relevant to ANY of our config.basePorts
        for (const [port, pid] of allPorts) {
            // Is this port within any of our monitored ranges?
            const relevantBase = this.getRelevantBase(port);
            
            if (relevantBase !== -1) {
                // It's a monitored port.
                if (!this.knownPorts.has(port)) {
                    // New port detected!
                    this.handleNewPort(port, pid, relevantBase);
                } else {
                    // Check if PID changed
                    const oldPid = this.knownPorts.get(port);
                    if (oldPid !== pid) {
                        console.log(chalk.gray(`[Info] Port ${port} PID changed: ${oldPid} -> ${pid}`));
                    }
                }
            }
        }

        // Update detection state (we can store ALL ports, it's fine, or filter. Storing all is 0(1) for next diff)
        this.knownPorts = allPorts;
    }

    private getRelevantBase(port: number): number {
        for (const base of this.config.basePorts) {
            if (port >= base && port <= base + this.config.range) {
                return base;
            }
        }
        return -1;
    }

    private async handleNewPort(newPort: number, newPid: number, basePort: number) {
        console.log(chalk.green(`[Detected] New process on port ${newPort} (PID: ${newPid}) [Base: ${basePort}]`));
        
        let targetPort = -1;

        if (this.config.strategy === 'chain') {
            // Kill n-1
            targetPort = newPort - 1;
        } else if (this.config.strategy === 'kill-base') {
            // Kill base if new > base
            if (newPort > basePort) {
                targetPort = basePort;
            }
        }

        // Strategy check: ensure targetPort is within range and is >= basePort
        if (targetPort >= basePort && this.knownPorts.has(targetPort)) {
            const targetPid = this.knownPorts.get(targetPort);
            // Don't kill self (sanity check) or if it's the same process (pid comparison)
            if (!targetPid || targetPid === newPid) return; 

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
