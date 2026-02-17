import { spawn } from "bun";
import { type ProcessInfo } from "./types";

export async function getPorts(base: number, range: number): Promise<Map<number, number>> {
    const portMap = new Map<number, number>();
    const maxPort = base + range;

    try {
        // Run netstat to get all TCP listening ports
        // -a: all connections/ports
        // -n: numeric format
        // -o: include PID
        const proc = spawn(["netstat", "-ano", "-p", "TCP"], {
            stdout: "pipe",
            stderr: "pipe",
        });

        const output = await new Response(proc.stdout).text();
        const lines = output.split(/[\r\n]+/);

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            // Expected format: TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234
            if (parts.length < 5 || parts[3] !== 'LISTENING') continue;

            const localAddress = parts[1];
            const pid = parseInt(parts[4], 10);

            // Extract port from 0.0.0.0:3000 or [::]:3000
            const portMatch = localAddress.match(/:(\d+)$/);
            if (portMatch) {
                const port = parseInt(portMatch[1], 10);
                if (port >= base && port <= maxPort) {
                    portMap.set(port, pid);
                }
            }
        }
    } catch (error) {
        console.error("Error running netstat:", error);
    }

    return portMap;
}

export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
    try {
        // Use wmic to get command line. It's usually present on Windows.
        // wmic process where processid=1234 get commandline,name /format:csv
        const proc = spawn(["wmic", "process", "where", `processid=${pid}`, "get", "commandline,name", "/format:csv"], {
            stdout: "pipe",
            stderr: "pipe",
        });

        const output = await new Response(proc.stdout).text();
        const lines = output.trim().split(/[\r\n]+/);

        // Header: Node,CommandLine,Name
        // Data: Deskop-XXX,node index.js,node.exe
        if (lines.length < 2) return null;

        // Simple CSV parse: wmic csv often has empty lines
        const dataLine = lines.find(l => l.includes(pid.toString()) || (l.trim().length > 0 && !l.includes('CommandLine')));
        
        if (!dataLine) return null;

        // Wmic CSV logic is annoying because command line can contain commas. 
        // Typically: Node,CommandLine,Name. 
        // Actually wmic /format:csv output is: Node,CommandLine,Name
        // But let's just grab the whole line and check for common markers or use a safer powershell if wmic fails? 
        // Let's stick to a simpler approach: finding the line that isn't the header.
        
        // Actually, wmic output is:
        // Node,CommandLine,Name
        // MY-PC,"C:\Program Files\nodejs\node.exe" server.js,node.exe
        
        // Let's try to extract loosely.
        const parts = dataLine.split(',');
        const name = parts[parts.length - 1]; // Name is usually last? Wait, wmic order depends on 'get' order.
        // We asked for: commandline,name.
        // CSV: Node,CommandLine,Name
        
        // Let's rely on Powershell for richer info if wmic proves flaky, but wmic is faster than PS startup.
        // Let's parse efficiently.
        
        return {
            pid,
            command: dataLine, // Store the raw line for filtering for now, refining later if needed.
        };
    } catch (e) {
        return null;
    }
}

export async function killProcess(pid: number, force = false): Promise<boolean> {
    try {
        const args = ["/PID", pid.toString()];
        if (force) args.push("/F");
        
        const proc = spawn(["taskkill", ...args], {
            stdout: "ignore",
            stderr: "ignore",
        });
        
        const exitCode = await proc.exited;
        return exitCode === 0;
    } catch (e) {
        return false;
    }
}
