import { spawn } from "bun";
import { type ProcessInfo } from "./types";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

export async function getAllTcpPorts(): Promise<Map<number, number>> {
    const portMap = new Map<number, number>();

    try {
        if (isWin) {
            return await getPortsWindows();
        } else if (isMac) {
            return await getPortsMac();
        } else if (isLinux) {
            return await getPortsLinux();
        }
    } catch (error) {
        console.error("Error gathering ports:", error);
    }
    return portMap;
}

export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    try {
        if (isWin) {
            return await getProcessInfoWindows(pid);
        } else {
            return await getProcessInfoUnix(pid);
        }
    } catch (e) {
        return null;
    }
}

export async function killProcess(pid: number, force = false): Promise<boolean> {
    try {
        if (isWin) {
            const args = ["/PID", pid.toString()];
            if (force) args.push("/F");
            const proc = spawn(["taskkill", ...args], { stdout: "ignore", stderr: "ignore" });
            const exitCode = await proc.exited;
            return exitCode === 0;
        } else {
            // Unix (Mac/Linux)
            const args = force ? ["-9", pid.toString()] : [pid.toString()];
            const proc = spawn(["kill", ...args], { stdout: "ignore", stderr: "ignore" });
            const exitCode = await proc.exited;
            return exitCode === 0;
        }
    } catch (e) {
        return false;
    }
}

// --- Platform Specific Implementations ---

async function getPortsWindows(): Promise<Map<number, number>> {
    const portMap = new Map<number, number>();
    const proc = spawn(["netstat", "-ano", "-p", "TCP"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const lines = output.split(/[\r\n]+/);

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5 || parts[3] !== 'LISTENING') continue;
        const localAddress = parts[1];
        const pid = parseInt(parts[4], 10);
        const portMatch = localAddress.match(/:(\d+)$/);
        if (portMatch) {
            portMap.set(parseInt(portMatch[1], 10), pid);
        }
    }
    return portMap;
}

async function getPortsMac(): Promise<Map<number, number>> {
    const portMap = new Map<number, number>();
    // lsof -iTCP -sTCP:LISTEN -P -n
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const proc = spawn(["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const lines = output.split(/[\r\n]+/);

    for (const line of lines) {
        if (line.startsWith('COMMAND')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue; 
        
        const pid = parseInt(parts[1], 10);
        const address = parts[8]; // *:3000 or 127.0.0.1:3000
        const portMatch = address.match(/:(\d+)$/);
        
        if (portMatch && !isNaN(pid)) {
            portMap.set(parseInt(portMatch[1], 10), pid);
        }
    }
    return portMap;
}

async function getPortsLinux(): Promise<Map<number, number>> {
    const portMap = new Map<number, number>();
    // ss -lptn
    // State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
    // LISTEN 0 128 *:3000 *:* users:(("node",pid=123,fd=19))
    const proc = spawn(["ss", "-lptn"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const lines = output.split(/[\r\n]+/);

    for (const line of lines) {
        if (line.startsWith('State')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;

        const localAddress = parts[3];
        const processInfo = parts.slice(5).join(' '); // users:(("node",pid=123,fd=19))
        
        const portMatch = localAddress.match(/:(\d+)$/);
        const pidMatch = processInfo.match(/pid=(\d+)/);

        if (portMatch && pidMatch) {
            portMap.set(parseInt(portMatch[1], 10), parseInt(pidMatch[1], 10));
        }
    }
    return portMap;
}

async function getProcessInfoUnix(pid: number): Promise<ProcessInfo | null> {
    const proc = spawn(["ps", "-p", pid.toString(), "-o", "command="], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const command = output.trim();
    
    if (!command) return null;
    
    return {
        pid,
        command
    };
}

async function getProcessInfoWindows(pid: number): Promise<ProcessInfo | null> {
    const proc = spawn(["wmic", "process", "where", `processid=${pid}`, "get", "commandline,name", "/format:csv"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split(/[\r\n]+/);
    if (lines.length < 2) return null;
    const dataLine = lines.find(l => l.includes(pid.toString()) || (l.trim().length > 0 && !l.includes('CommandLine')));
    if (!dataLine) return null;
    return {
        pid,
        command: dataLine,
    };
}


export async function getMatchingProcesses(filterNames: string[]): Promise<ProcessInfo[]> {
    if (!filterNames || filterNames.length === 0) return [];
    
    // Construct WQL query
    // Name='node.exe' OR Name='bun.exe'
    // Construct WQL query
    let names = filterNames;
    if (isWin) {
        // Automatically append .exe if missing for Windows convenience
        const expanded: string[] = [];
        for (const n of filterNames) {
            expanded.push(n);
            if (!n.endsWith('.exe')) {
                expanded.push(`${n}.exe`);
            }
        }
        names = expanded;
    }
    const clause = names.map(n => `Name='${n}'`).join(" OR ");
    
    try {
        if (isWin) {
            // wmic process where "..." get CommandLine,ProcessId,CreationDate,ParentProcessId /format:csv
            const cmd = ["wmic", "process", "where", clause, "get", "CommandLine,ProcessId,CreationDate,ParentProcessId", "/format:csv"];
            
            // Run with timeout race to prevent hanging
            const proc = spawn(cmd, { stdout: "pipe", stderr: "pipe" });
            
            // Timeout promise
            const timeout = new Promise<string>((_, reject) => 
                setTimeout(() => {
                    proc.kill();
                    reject(new Error("Timeout waiting for wmic"));
                }, 5000)
            );

            // Output promise
            const outputPromise = new Response(proc.stdout).text();
            
            const output = await Promise.race([outputPromise, timeout]);
            
            const lines = output.trim().split(/[\r\n]+/);
            const results: ProcessInfo[] = [];

            // CSV Header: Node,CommandLine,CreationDate,ParentProcessId,ProcessId
            // Note: WMIC output order can be alphabetical explicitly if not using /format:csv, 
            // but with /format:csv it typically follows the GET order OR alphabetical.
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Improved Parsing using Regex to handle commas in command line safely.
                // Expected format: Node,CommandLine,CreationDate,ParentProcessId,ProcessId
                // Regex: capture everything until the last 3 commas.
                // ^(.*)          From start, capture greedy (Node + Cmd)
                // ,([^,]+)       Comma, then Date (non-greedy/no comma)
                // ,(\d+)         Comma, then PPID (digits)
                // ,(\d+)         Comma, then PID (digits)
                // \s*            Optional whitespace/CR/LF at end
                
                const match = line.match(/^(.*),([^,]+),(\d+),(\d+)\s*$/);
                
                if (!match) {
                    if (!line.includes("ParentProcessId")) {
                        console.log(`[DEBUG] Line did not match regex: ${line}`);
                    }
                    continue;
                }

                // match[1] = Node,Cmd
                // match[2] = Date
                // match[3] = PPID
                // match[4] = PID
                
                const ppidStr = match[3];
                const pidStr = match[4];
                const dateStr = match[2];
                
                const pid = parseInt(pidStr, 10);
                const ppid = parseInt(ppidStr, 10);

                
                // Clean Command Line:
                // match[1] contains "Node,CommandLine".
                // We need to strip the Node name.
                // Assuming Node name is first field up to first comma.
                const nodeCmd = match[1];
                const firstComma = nodeCmd.indexOf(',');
                let cmdLine = (firstComma !== -1) ? nodeCmd.substring(firstComma + 1) : nodeCmd;
                
                cmdLine = cmdLine.replace(/^"|"$/g, ''); // Strip outer quotes

                if (!isNaN(pid)) {
                    results.push({
                        pid,
                        ppid: isNaN(ppid) ? undefined : ppid,
                        command: cmdLine, // Strip surrounding quotes
                        creationDate: dateStr
                    });
                }
            }
            return results;

        } else {
            // Unix implementation (ps -o pid,lstart,command)
            // Need to map names to something `ps` understands or just grep?
            // `ps -A -o pid,lstart,command | grep node`
            const proc = spawn(["ps", "-A", "-o", "pid,lstart,command"], { stdout: "pipe", stderr: "pipe" });
            const output = await new Response(proc.stdout).text();
            const lines = output.split('\n');
            const results: ProcessInfo[] = [];
            
            for (const line of lines) {
                // Parse PID LSTART COMMAND
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('PID')) continue;
                
                // PID is first
                const firstSpace = trimmed.indexOf(' ');
                const pidStr = trimmed.substring(0, firstSpace);
                
                // LSTART is date (e.g. "Mon Feb 19 22:50:00 2026") - Fixed width? usually ~24 chars
                // Command is the rest
                // Actually `ps` output is column based but `lstart` has spaces.
                // Better strategy: filter by name first? 
                
                const pid = parseInt(pidStr, 10);
                if (isNaN(pid)) continue;

                const rest = trimmed.substring(firstSpace).trim();
                // Assume command matches one of the filters
                const matchesFilter = filterNames.some(f => rest.includes(f));
                if (matchesFilter) {
                     results.push({
                         pid,
                         command: rest, // Approx, includes date at start
                         // parsing date from ps output is painful, leaving empty for now or implementing later if needed for linux
                     });
                }
            }
            return results;
        }
    } catch (e) {
        console.error("Error listed processes:", e);
        return [];
    }
}
