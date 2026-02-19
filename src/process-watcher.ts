import { EventEmitter } from "events";
import { getMatchingProcesses, killProcess } from "./system";
import { type WatcherConfig, type ProcessInfo } from "./types";
import chalk from "chalk";

interface ProcessRecord {
    pid: number;
    command: string;
    firstSeen: number; // Timestamp
    creationDate?: string;
    ppid?: number;
}

export class ProcessWatcher extends EventEmitter {
    private config: WatcherConfig;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private knownProcesses: Map<number, ProcessRecord> = new Map(); // PID -> Record

    private serviceStartTime: number;

    constructor(config: WatcherConfig) {
        super();
        this.config = config;
        this.serviceStartTime = Date.now();
    }

    public async cleanup() {
        if (!this.config.maxAge || this.config.maxAge <= 0) {
            console.log(chalk.red("Cleanup requires --max-age to be set > 0"));
            return;
        }
        
        const maxAge = this.config.maxAge;
        console.log(chalk.cyan(`[Cleanup] Scanning for processes older than ${maxAge} minutes...`));
         // 1. Get current processes matching filter
        const currentProcesses = await getMatchingProcesses(this.config.filter);
        const maxAgeMs = maxAge * 60 * 1000;
        const now = Date.now();

        for (const proc of currentProcesses) {
            // Absolute age check for cleanup
            const record: ProcessRecord = {
                 pid: proc.pid,
                 command: proc.command,
                 firstSeen: now, // Doesn't matter for this check
                 creationDate: proc.creationDate
            };
            
            const startTime = this.getStartTime(record);
            const age = now - startTime;
            
            if (age > maxAgeMs) {
                await this.kill(proc.pid, `Cleanup: Age ${Math.floor(age/60000)}m > ${this.config.maxAge}m`);
            }
        }
        console.log(chalk.cyan(`[Cleanup] Done.`));
    }

    public async start() {
        console.log(chalk.cyan(`[ProcessWatcher] Starting...`));
        if (this.config.filter && this.config.filter.length > 0) {
            console.log(chalk.cyan(`[ProcessWatcher] Monitoring processes: ${this.config.filter.join(", ")}`));
        } else {
            console.log(chalk.red(`[ProcessWatcher] Error: No process filter specified. Use --filter.`));
            return;
        }

        const maxAge = this.config.maxAge || 0;
        if (maxAge > 0) {
            console.log(chalk.cyan(`[ProcessWatcher] Max Age: ${maxAge} minutes`));
            console.log(chalk.cyan(`[ProcessWatcher] Note: Existing processes have a grace period of ${maxAge}m from now.`));
        }
        
        // Initial scan
        await this.tick();

        this.intervalId = setInterval(() => this.tick(), this.config.interval);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log(chalk.cyan(`[ProcessWatcher] Stopped.`));
    }

    private async tick() {
        // 1. Get current processes matching filter
        const currentProcesses = await getMatchingProcesses(this.config.filter);
        const now = Date.now();

        // 2. Identify new processes and update known list
        const currentPids = new Set<number>();
        
        // Group by command line to find duplicates
        const byCommand = new Map<string, ProcessRecord[]>();

        for (const proc of currentProcesses) {
            currentPids.add(proc.pid);
            
            let record = this.knownProcesses.get(proc.pid);
            if (!record) {
                // New process detected
                console.log(chalk.green(`[Detected] New process PID: ${proc.pid}`));
                // console.log(chalk.gray(`           Cmd: ${proc.command}`));
                
                record = {
                    pid: proc.pid,
                    command: proc.command,
                    firstSeen: now,
                    creationDate: proc.creationDate,
                    ppid: proc.ppid
                };
                this.knownProcesses.set(proc.pid, record);
            }

            // Add to grouping for duplicate check
            // Normalize command: remove quotes, trim? already done in system.ts mostly
            const cmdKey = record.command.trim(); 
            if (!byCommand.has(cmdKey)) {
                byCommand.set(cmdKey, []);
            }
            byCommand.get(cmdKey)!.push(record);
        }

        // 3. Remove stale processes from knownProcesses
        for (const [pid] of this.knownProcesses) {
            if (!currentPids.has(pid)) {
                this.knownProcesses.delete(pid);
            }
        }

        // 4. Logic: Duplicate Detection & Cleanup (Cluster by PPID)
        for (const [cmd, records] of byCommand) {
             if (records.length > 1) {
                 // Group by PPID to identify "Clusters" (Siblings)
                 const clusters = new Map<number, ProcessRecord[]>();
                 const noPpidRecords: ProcessRecord[] = [];

                 for (const r of records) {
                     if (r.ppid !== undefined) {
                         if (!clusters.has(r.ppid)) clusters.set(r.ppid, []);
                         clusters.get(r.ppid)!.push(r);
                     } else {
                         noPpidRecords.push(r);
                     }
                 }

                 // Treat no-ppid records as their own individual clusters
                 for (const r of noPpidRecords) {
                     // Use negative PID as fake cluster ID to avoid collision
                     clusters.set(-r.pid, [r]);
                 }

                 // Now we have a list of clusters. We want to keep the NEWEST CLUSTER.
                 // Cluster start time = Start time of the EARLIEST process in the cluster.
                 // (Or maybe the parent's start time? We don't have parent's start time easily.)
                 // Let's use the earliest process in the cluster as the proxy for "Cluster Start Time".

                 const clusterInfos = Array.from(clusters.entries()).map(([ppid, members]) => {
                     // Sort members by start time
                     members.sort((a, b) => this.getStartTime(a) - this.getStartTime(b));
                     return {
                         ppid,
                         members,
                         startTime: this.getStartTime(members[0])
                     };
                 });

                 // Sort clusters by start time (Oldest to Newest)
                 clusterInfos.sort((a, b) => a.startTime - b.startTime);

                 // Keep the NEWEST cluster. Kill all others.
                 const newestCluster = clusterInfos[clusterInfos.length - 1];

                 if (clusterInfos.length > 1) {
                     console.log(chalk.magenta(`[CLUSTERS] Found ${clusterInfos.length} process clusters for command.`));
                     console.log(chalk.gray(`            Cmd: "${chalk.white(cmd)}"`));
                     
                     for (let i = 0; i < clusterInfos.length - 1; i++) {
                         const oldCluster = clusterInfos[i];
                         console.log(chalk.yellow(`            Killing Old Cluster (PPID: ${oldCluster.ppid}, Count: ${oldCluster.members.length})`));
                         
                         for (const member of oldCluster.members) {
                             await this.kill(member.pid, `Old Instance (Cluster PPID ${oldCluster.ppid})`);
                         }
                     }
                     
                     console.log(chalk.green(`            Keeping Newest Cluster (PPID: ${newestCluster.ppid}, Count: ${newestCluster.members.length})`));
                 }
                 
                 // Note: If clusterInfos.length === 1, that means we have multiple processes 
                 // but they are all in the SAME cluster (Siblings). We do NOTHING. 
                 // This fixes the "Autoforge workers" issue.
             }
        }

        // 5. Logic: Max Age
        const maxAge = this.config.maxAge || 0;
        if (maxAge > 0) {
            const maxAgeMs = maxAge * 60 * 1000;
            for (const record of this.knownProcesses.values()) {
                const startTime = this.getStartTime(record);
                // Relative Age Logic:
                // Effective Start Time = MAX(ProcessStart, WatcherStart)
                // If process started BEFORE watcher, age is effectively 0 at start.
                
                const effectiveStart = Math.max(startTime, this.serviceStartTime);
                const age = now - effectiveStart;
                
                if (age > maxAgeMs) {
                    await this.kill(record.pid, `Max Age Exceeded (${Math.floor(age/1000/60)}m > ${maxAge}m)`);
                }
            }
        }
    }

    private getStartTime(record: ProcessRecord): number {
        // Try to parse WMI CreationDate if available: YYYYMMDDHHMMSS.mmmmm+TZ
        // 20260219200036.437206+300
        if (record.creationDate) {
            const match = record.creationDate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
            if (match) {
                 const year = parseInt(match[1]);
                 const month = parseInt(match[2]) - 1;
                 const day = parseInt(match[3]);
                 const hour = parseInt(match[4]);
                 const minute = parseInt(match[5]);
                 const second = parseInt(match[6]);
                 return new Date(year, month, day, hour, minute, second).getTime();
            }
        }
        return record.firstSeen;
    }

    private async kill(pid: number, reason: string) {
        if (this.config.dryRun) {
             console.log(chalk.yellow(`[Dry-Run] Would kill PID ${pid}. Reason: ${reason}`));
             // Remove from known list so we don't spam? 
             // Actually if we don't kill it, it stays. ensuring we don't spam log would be good.
             // But dry run implies showing what IS happening.
             return;
        }

        console.log(chalk.red.bold(`[KILL] Killing PID ${pid}. Reason: ${reason}`));
        const success = await killProcess(pid, true);
        if (success) {
            console.log(chalk.green(`[Success] Process ${pid} killed.`));
            this.knownProcesses.delete(pid);
        } else {
            console.log(chalk.red(`[Error] Failed to kill process ${pid}.`));
        }
    }
}
