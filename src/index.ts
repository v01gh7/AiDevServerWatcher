#!/usr/bin/env bun
import { Command } from "commander";
import { PortWatcher } from "./watcher";
import chalk from "chalk";
import { type WatcherConfig } from "./types";

const program = new Command();

const parseIntArg = (val: string) => parseInt(val, 10);

program
  .name("port-watcher")
  .description("CLI utility to kill zombie dev-server processes on Windows")
  .version("1.0.0")
  .option("-b, --base <number>", "Base port to watch", parseIntArg, 5173)
  .option("-r, --range <number>", "Port range to scan (base to base+range)", parseIntArg, 20)
  .option("-i, --interval <number>", "Polling interval in ms", parseIntArg, 1000)
  .option("-s, --strategy <type>", "Kill strategy: 'chain' (kill n-1) or 'kill-base' (kill base)", "chain")
  .option("-f, --filter <names>", "Semicolon-separated process names/commands to allow killing (e.g. 'node;nuxi')", "node;nuxi;vite;npm")
  .option("-d, --dry-run", "Log what would be killed without killing", false)
  .action(async (options) => { // Async for Bun.serve
    // 1. Singleton Lock: Launch dummy server on port 322
    try {
        const lockServer = Bun.serve({
            port: 322,
            fetch(req) { return new Response("Port Watcher Active"); }
        });
        console.log(chalk.gray(`[System] Watcher process bound to port 322 (Singleton Lock).`));
    } catch (e) {
        console.error(chalk.red.bold(`[Error] Could not bind to port 322.`));
        console.error(chalk.yellow(`Another instance of Port Watcher might be running.`));
        process.exit(1);
    }
    
    // Validate strategy
    if (options.strategy !== 'chain' && options.strategy !== 'kill-base') {
        console.error(chalk.red(`Invalid strategy: ${options.strategy}. Use 'chain' or 'kill-base'.`));
        process.exit(1);
    }

    const config: WatcherConfig = {
        basePort: options.base,
        range: options.range,
        interval: options.interval,
        strategy: options.strategy as 'chain' | 'kill-base',
        filter: options.filter.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0),
        dryRun: options.dryRun || false
    };

    console.log(chalk.bold.blue("Starting Port Watcher..."));
    console.log(`Base Port: ${chalk.yellow(config.basePort)}`);
    console.log(`Range:     ${chalk.yellow(`+${config.range}`)}`);
    console.log(`Strategy:  ${chalk.yellow(config.strategy)}`);
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
