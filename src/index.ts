#!/usr/bin/env bun
import { Command } from "commander";
import { PortWatcher } from "./watcher";
import chalk from "chalk";
import { type WatcherConfig } from "./types";

const program = new Command();

const parseIntArg = (val: string) => parseInt(val, 10);

program
  .name("zombie-watcher")
  .description("CLI utility to kill zombie dev-server processes on Windows")
  .version("1.0.0")
  .option("-b, --base <ports>", "Base ports to watch (comma-separated)", "5173")
  .option("-r, --range <number>", "Port range to scan (base to base+range)", parseIntArg, 20)
  .option("-i, --interval <number>", "Polling interval in ms", parseIntArg, 1000)
  .option("-s, --strategy <type>", "Kill strategy: 'chain' (kill n-1) or 'kill-base' (kill base)", "chain")
  .option("-f, --filter <names>", "Semicolon-separated process names/commands to allow killing (e.g. 'node;nuxi')", "node;nuxi;vite;npm")
  .option("-d, --dry-run", "Log what would be killed without killing", false)
  .action(async (options) => { // Async for Bun.serve
    // 1. Singleton Lock: Try binding from 322 up to 332
    let boundPort = -1;
    let lockServer = null;

    for (let p = 322; p < 332; p++) {
        try {
            lockServer = Bun.serve({
                port: p,
                fetch(req) { return new Response(`Port Watcher Active on ${p}`); }
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

    const basePorts = options.base.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));

    if (basePorts.length === 0) {
        console.error(chalk.red(`Invalid base ports: ${options.base}`));
        process.exit(1);
    }

    const config: WatcherConfig = {
        basePorts: basePorts,
        range: options.range,
        interval: options.interval,
        strategy: options.strategy as 'chain' | 'kill-base',
        filter: options.filter.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0),
        dryRun: options.dryRun || false
    };

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
  });

program.parse(process.argv);
