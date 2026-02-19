#!/usr/bin/env bun
import { Command } from "commander";
import { PortWatcher } from "./watcher";
import { ProcessWatcher } from "./process-watcher";
import chalk from "chalk";
import { type WatcherConfig } from "./types";

const program = new Command();

const parseIntArg = (val: string) => parseInt(val, 10);

program
  .name("zombie-watcher")
  .description("CLI utility to kill zombie dev-server processes on Windows")
  .version("1.1.0")
  .option("-m, --mode <type>", "Watch mode: 'port' (default) or 'process'", "port")
  .option("-b, --base <ports>", "Base ports to watch (comma-separated, required for port mode)", "5173")
  .option("-r, --range <number>", "Port range to scan (base to base+range)", parseIntArg, 20)
  .option("-i, --interval <number>", "Polling interval in ms", parseIntArg, 1000)
  .option("-s, --strategy <type>", "Kill strategy: 'chain' (kill n-1) or 'kill-base' (kill base)", "chain")
  .option("-f, --filter <names>", "Semicolon or comma-separated process names/commands to watch/kill", "bun;node;npm;npx;pnpm;yarn;vite;deno;go;air;python;python3;uvicorn;flask;ruby;rails;java;gradle;mvn;php;swift;dotnet")
  .option("--max-age <minutes>", "Max age in minutes to kill processes (Process mode only)", parseIntArg, 0)
  .option("-d, --dry-run", "Log what would be killed without killing", false)
  .option("--cleanup", "Run a one-off cleanup of all processes older than --max-age", false)
  .action(async (options) => { // Async for Bun.serve
    if (options.cleanup) {
         if (!options.maxAge) {
             console.error(chalk.red("Error: --cleanup requires --max-age <minutes>"));
             process.exit(1);
         }
         
         const config: WatcherConfig = {
            basePorts: [],
            range: 0,
            interval: 0,
            strategy: 'chain', // irrelevant
            filter: options.filter.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0),
            dryRun: options.dryRun || false,
            maxAge: options.maxAge
        };
        
        const watcher = new ProcessWatcher(config);
        await watcher.cleanup();
        process.exit(0);
        return;
    }

    // 1. Singleton Lock: Try binding from 322 up to 332
    let boundPort = -1;
    let lockServer = null;

    for (let p = 322; p < 332; p++) {
        try {
        // @ts-ignore
            lockServer = Bun.serve({
                port: p,
                // @ts-ignore
                fetch(req: Request) { return new Response(`Port Watcher Active on ${p}`); }
            });
            boundPort = p;
            console.log(chalk.gray(`[System] Watcher process bound to port ${p} (Singleton Lock).`));
            break; 
        } catch (e) {
            // Port likely busy, try next
            continue;
        }
    }

    if (boundPort === -1) {
        console.error(chalk.red.bold(`[Error] Could not bind to any lock port between 322 and 332.`));
        process.exit(1);
    }
    
    // Validate strategy
    if (options.strategy !== 'chain' && options.strategy !== 'kill-base') {
        console.error(chalk.red(`Invalid strategy: ${options.strategy}. Use 'chain' or 'kill-base'.`));
        process.exit(1);
    }

    const maxAge = options.maxAge || 0;
    const config: WatcherConfig = {
        basePorts: [], // Filled later if port mode
        range: options.range, // Can be ignored in process mode
        interval: options.interval,
        strategy: options.strategy as 'chain' | 'kill-base',
        filter: options.filter.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0),
        dryRun: options.dryRun || false,
        maxAge: maxAge
    };

    if (options.mode === 'process') {
        console.log(chalk.bold.blue("Starting Process Watcher..."));
        console.log(`Lock Port:  ${chalk.yellow(boundPort)}`);
        console.log(`Filter:    ${chalk.yellow(config.filter.join(', '))}`);
        console.log(`Interval:  ${chalk.yellow(config.interval)}ms`);
        console.log(`Max Age:   ${chalk.yellow(maxAge > 0 ? maxAge + 'm' : 'Disabled')}`);
        
        if (config.dryRun) console.log(chalk.bgYellow.black(" DRY RUN MODE "));

        const watcher = new ProcessWatcher(config);
        watcher.start();

        // Handle exit
        process.on('SIGINT', () => {
            watcher.stop();
            process.exit(0);
        });

    } else {
        // Port Mode (Default)
        const basePorts = options.base.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));

        if (basePorts.length === 0) {
            console.error(chalk.red(`Invalid base ports: ${options.base}`));
            process.exit(1);
        }
        config.basePorts = basePorts;

        console.log(chalk.bold.blue("Starting Port Watcher..."));
        console.log(`Base Ports: ${chalk.yellow(config.basePorts.join(', '))}`);
        console.log(`Range:      ${chalk.yellow(`+${config.range}`)}`);
        console.log(`Lock Port:  ${chalk.yellow(boundPort)}`);

        console.log(`Strategy:   ${chalk.yellow(config.strategy)}`);
        console.log(`Filter:    ${chalk.yellow(config.filter.join(', '))}`);
        console.log(`Interval:  ${chalk.yellow(config.interval)}ms`);
        if (config.dryRun) console.log(chalk.bgYellow.black(" DRY RUN MODE "));

        const watcher = new PortWatcher(config);
        watcher.start();

        // Handle exit
        process.on('SIGINT', () => {
            watcher.stop();
            process.exit(0);
        });
    }
  });

program.parse(process.argv);
