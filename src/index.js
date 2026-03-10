#!/usr/bin/env node
process.env.UV_THREADPOOL_SIZE = Math.max(128, parseInt(process.env.UV_THREADPOOL_SIZE || '128', 10)).toString();
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import logUpdate from 'log-update';
import spinners from 'cli-spinners';
import gradient from 'gradient-string';
import config from '../config/default.js';
import { logger } from './utils/logger.js';
import { collectAllProxies } from './core/collector.js';
import { ProxyValidator } from './core/validator.js';
import { ProxyPipeline } from './core/pipeline.js';
import { ApiServer } from './api/server.js';
import { program } from 'commander';

program
    .name('akscraper')
    .description('High-Performance Asynchronous Node.js Proxy Scraper')
    .version('2.0.0')
    .option('-s, --sources <path>', 'Path to sources file (.txt or .json)', 'config/sources.json')
    .option('-c, --concurrency <number>', 'Concurrent sources to scrape simultaneously (default: 20)')
    .option('-v, --vconcurrency <number>', 'Concurrent proxies to validate simultaneously (default: 800)')
    .option('-w, --workers <number>', 'Number of validation worker threads (default: system logical threads)')
    .option('-t, --timeout <number>', 'Timeout per request in milliseconds (default: 5000)')
    .option('-p, --protocol <type>', 'Specific protocol to check (http, https, socks4, socks5, all) (default: all)')
    .option('-o, --output <path>', 'Custom directory to save validated proxies (default: "sproxies")')
    .option('-l, --loop', 'Run the scraper in an infinite loop (default: false)')
    .option('--nocache', 'Disable scraping cache to force fresh fetches on every loop')
    .option('-D, --serve', 'Host an Asynchronous REST API Server to distribute scraped files globally (default: false)')
    .option('--port <number>', 'Bind the API Server to a specific port (default: 9090)')
    .option('--key <string>', 'Zero-Trust Authentication Key for the API Server (default: "akscraper")')
    .addHelpText('after', `
Examples:
  $ akscraper -l             Runs the scraper continuously in a loop
  $ akscraper --serve        Spins up the REST API Proxy File Server alongside scanning
  $ akscraper -p http        Restricts validation strictly to HTTP proxies (skips SOCKS)
  $ akscraper -c 50          Forces Scraper Concurrency to 50
  $ akscraper -w 12          Forces Piscina Worker Threads to 12
  $ akscraper -t 3000        Enforces a strict 3000ms global timeout limit
  $ akscraper -s links.txt   Dynamically loads target URLs from a raw text file
`);

program.parse();
const options = program.opts();

if (options.concurrency) config.engine.scrapingConcurrency = parseInt(options.concurrency, 10);
if (options.vconcurrency) config.validation.checkConcurrency = parseInt(options.vconcurrency, 10);
if (options.workers) config.validation.workerCount = parseInt(options.workers, 10);
if (options.protocol) config.validation.checkProtocol = options.protocol.toLowerCase();
if (options.loop) config.engine.loop = true;
if (options.nocache) config.engine.noCache = true;
if (options.output) config.output.folderName = options.output;
if (options.timeout) {
    const tMs = parseInt(options.timeout, 10);
    config.engine.scrapeTimeoutMs = tMs;
    config.validation.checkTimeoutMs = tMs;
}

// API Server logic
let globalApiServer = null;
const isServing = options.serve === true;
const servePort = options.port ? parseInt(options.port, 10) : 9090;
const serveKey = options.key || 'akscraper';

const sourcesPath = path.resolve(process.cwd(), options.sources);
const blacklistPath = path.resolve(process.cwd(), 'config', 'blacklist.json');

let urls = [];
try {
    const fileContent = fs.readFileSync(sourcesPath, 'utf8');
    if (sourcesPath.endsWith('.json')) {
        urls = JSON.parse(fileContent);
    } else {
        urls = fileContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'));
    }
} catch (err) {
    console.error(chalk.red(`\n✖ Fatal Error: The proxy sources file was not found!`));
    console.error(chalk.yellow(`  Looking for: `) + chalk.white(sourcesPath));
    console.error(chalk.cyan(`  Please create this file and add your proxy URLs (one per line).`));
    console.error(chalk.cyan(`  Or specify a different file using the -s argument.\n`));

    if (process.stdin.isTTY) {
        process.stdout.write(chalk.gray(`  Press any key to exit...`));
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => process.exit(1));
    } else {
        process.exit(1);
    }
    // Block the main thread from proceeding
    await new Promise(() => { });
}

let blacklist = new Set();
try {
    if (fs.existsSync(blacklistPath)) {
        blacklist = new Set(JSON.parse(fs.readFileSync(blacklistPath, 'utf8')));
    }
} catch (err) {
    // Ignore missing blacklist
}

const state = {
    phase: 'Initializing...',
    isActive: true,
    scrape: { current: 0, total: 0, found: 0, active: 0, dead: 0 },
    validate: { current: 0, total: 0, alive: 0, dead: 0 },
    errors: [],
    spinnerFrame: 0,
    times: {
        totalStart: Date.now(),
        scrapeStart: null, scrapeEnd: null,
        dedupeStart: null, dedupeEnd: null,
        validateStart: null, validateEnd: null,
        totalEnd: null
    },
    finalDir: null,
    fatalError: null
};

const titleGradient = gradient(['#f3a183', '#ec6f66']);
const scrapeGradient = gradient(['#f3a183', '#ec6f66']);
const validateGradient = gradient(['#ec6f66', '#f3a183']);

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours} hours ${minutes} minutes ${seconds} seconds`;
    } else if (minutes > 0) {
        return `${minutes} mins ${seconds} seconds`;
    }
    return `${seconds} seconds`;
}

function getBar(current, total, width = 30, gradientTheme) {
    if (total === 0) return chalk.gray('─'.repeat(width));
    const percent = Math.min(1, Math.max(0, current / total));
    const completedLength = Math.round(width * percent);
    const completedStr = '━'.repeat(completedLength);
    const completed = completedLength > 0 ? (gradientTheme ? gradientTheme(completedStr) : chalk.cyan(completedStr)) : '';
    const remaining = chalk.gray('─'.repeat(width - completedLength));
    return completed + remaining;
}

function render() {
    const spinner = spinners.dots;
    const frame = spinner.frames[state.spinnerFrame % spinner.frames.length];

    let output = '\n';
    output += chalk.bold(titleGradient('✴  Powerful Proxy Scraper ✴ ')) + chalk.dim(' By @itsanwar\n');
    output += chalk.dim('─────────────────────────────────────────────────────────────\n');

    const protoCfg = config.validation.checkProtocol.toUpperCase();
    const workCfg = config.validation.workerCount;
    const vConcCfg = config.validation.checkConcurrency;
    const timeCfg = config.validation.checkTimeoutMs + 'ms';
    output += `   ${chalk.cyan('Protocol:')} ${chalk.white(protoCfg)} ${chalk.dim('•')} ${chalk.cyan('Workers:')} ${chalk.white(workCfg)} ${chalk.dim('•')} ${chalk.cyan('Val Conc:')} ${chalk.white(vConcCfg)} ${chalk.dim('•')} ${chalk.cyan('Timeout:')} ${chalk.white(timeCfg)}\n`;

    if (isServing && globalApiServer) {
        output += `   ${chalk.magenta('API Server:')} ${chalk.green(`http://0.0.0.0:${servePort}`)} ${chalk.dim('•')} ${chalk.magenta('Key:')} ${chalk.white(serveKey)}\n`;
    }

    output += chalk.dim('─────────────────────────────────────────────────────────────\n\n');

    if (state.fatalError) {
        output += chalk.red(`✖ Fatal Error: ${state.fatalError}\n`);
        logUpdate(output);
        return;
    }

    // Phase 1: Scraping 
    const sDone = state.scrape.current === state.scrape.total && state.scrape.total > 0;
    const sIcon = sDone ? chalk.green('✔') : chalk.cyan(frame);
    let sLine = `  ${sIcon} Scraping Sources  `;

    if (state.scrape.total > 0) {
        const percent = Math.floor((state.scrape.current / state.scrape.total) * 100);
        sLine += `${getBar(state.scrape.current, state.scrape.total, 25, scrapeGradient)}  ${percent.toString().padStart(3, ' ')}% `;
        sLine += chalk.dim(`[${state.scrape.current}/${state.scrape.total}] `);
        sLine += chalk.yellow(`Found: ${state.scrape.found} `);

        if (sDone && state.times.scrapeEnd) {
            const el = ((state.times.scrapeEnd - state.times.scrapeStart) / 1000).toFixed(1);
            sLine += chalk.dim(`(${el}s)`);
        }

        sLine += '\n';
        sLine += `     └─ ${chalk.green(`Active: ${state.scrape.active}`)} | ${chalk.red(`Dead: ${state.scrape.dead}`)}`;

        if (state.errors.length > 0 && state.phase === 'Scraping Sources') {
            sLine += '\n';
            const displayErrors = state.errors.slice(-3);
            displayErrors.forEach((err) => {
                let msg = err.message.replace(/\r?\n|\r/g, ' '); // Strip physical newlines
                if (msg.length > 80) msg = msg.substring(0, 77) + '...'; // Clamp string to prevent visual line wrap
                sLine += chalk.red(`     └─ Error: ${msg}`) + '\n';
            });
            if (state.errors.length > 3) {
                sLine += chalk.dim(`     └─ ...and ${state.errors.length - 3} more errors (see logs/)`);
            }
        }
    } else {
        sLine += chalk.dim('Waiting...');
    }
    output += sLine + (sLine.endsWith('\n') ? '' : '\n');

    // Phase 2: Deduplication
    let dLine = `  `;
    let dDone = state.phase === 'Validating' || state.phase === 'Done' || state.phase === 'Exporting';

    if (state.phase === 'Deduplicating') {
        dLine += `${chalk.cyan(frame)} Deduplicating & Filtering...`;
    } else if (dDone) {
        dLine += `${chalk.green('✔')} Deduplicating & Filtering ${chalk.dim(`(Unique: ${state.validate.total})`)}`;
        if (state.times.dedupeEnd) {
            const el = ((state.times.dedupeEnd - state.times.dedupeStart) / 1000).toFixed(1);
            dLine += chalk.dim(` (${el}s)`);
        }
    } else {
        dLine += chalk.dim('○ Deduplicating & Filtering');
    }
    output += dLine + '\n';

    // Phase 3: Validating
    let vLine = `  `;
    let vDone = state.phase === 'Exporting' || state.phase === 'Done';

    if (state.phase === 'Validating') {
        vLine += `${chalk.cyan(frame)} Validating Proxies `;
    } else if (vDone) {
        vLine += `${chalk.green('✔')} Validating Proxies `;
    } else {
        vLine += chalk.dim('○ Validating Proxies ');
    }

    if (state.validate.total > 0 && (state.phase === 'Validating' || vDone)) {
        const vPercent = Math.floor((state.validate.current / state.validate.total) * 100);
        vLine += `${getBar(state.validate.current, state.validate.total, 25, validateGradient)}  ${vPercent.toString().padStart(3, ' ')}% `;
        vLine += chalk.dim(`[${state.validate.current}/${state.validate.total}] `);

        if (vDone && state.times.validateEnd) {
            const el = ((state.times.validateEnd - state.times.validateStart) / 1000).toFixed(1);
            vLine += chalk.dim(`(${el}s)`);
        }

        vLine += '\n';
        vLine += `     └─ ${chalk.green(`Alive: ${state.validate.alive}`)} | ${chalk.red(`Dead: ${state.validate.dead}`)}`;
    }
    output += vLine + '\n';

    // Status Footer
    const elapsed = Math.floor(((state.times.totalEnd || Date.now()) - state.times.totalStart) / 1000);
    output += `\n  ${chalk.gray('Elapsed Time:')} ${formatTime(elapsed)} ${chalk.dim('|')} ${chalk.gray('Phase:')} ${chalk.italic(state.phase)}`;

    if (state.phase === 'Done' && state.finalDir) {
        const titleStr = scrapeGradient(' Scrape Complete ');

        let statsContent = '';
        statsContent += `  ${chalk.gray('Final Count:')}   ${chalk.green.bold(state.validate.alive + ' proxies')}\n`;
        statsContent += `  ${chalk.gray('Total Time:')}    ${chalk.blue(formatTime(elapsed))}\n`;
        statsContent += `  ${chalk.gray('Directory:')}     ${chalk.magenta(state.finalDir)}`;

        output += '\n\n' + boxen(statsContent, {
            title: titleStr,
            titleAlignment: 'center',
            padding: { top: 1, bottom: 1, left: 3, right: 3 },
            margin: { top: 0, bottom: 1, left: 2, right: 2 },
            borderColor: '#f3a183',
            borderStyle: 'round'
        });
    }

    logUpdate(output);
}

function resetState() {
    state.phase = 'Initializing...';
    state.isActive = true;
    state.scrape = { current: 0, total: 0, found: 0, active: 0, dead: 0 };
    state.validate = { current: 0, total: 0, alive: 0, dead: 0 };
    state.errors = [];
    state.spinnerFrame = 0;
    state.times = {
        totalStart: Date.now(),
        scrapeStart: null, scrapeEnd: null,
        dedupeStart: null, dedupeEnd: null,
        validateStart: null, validateEnd: null,
        totalEnd: null
    };
    state.finalDir = null;
    state.fatalError = null;
}

async function scrapeCycle() {
    resetState();
    console.clear();

    // Start TUI render loop at ~30 FPS
    const renderTimer = setInterval(() => {
        state.spinnerFrame++;
        render();
    }, 80);

    state.phase = 'Scraping Sources';
    state.times.scrapeStart = Date.now();

    // 1. Collect
    let scrapedProxies = await collectAllProxies(
        urls,
        (current, total, found, active, dead) => {
            state.scrape.current = current;
            state.scrape.total = total;
            state.scrape.found = found;
            state.scrape.active = active;
            state.scrape.dead = dead;
        },
        (url, msg) => {
            state.errors.push({ url, message: msg });
        }
    );

    state.times.scrapeEnd = Date.now();
    state.phase = 'Deduplicating';
    state.times.dedupeStart = Date.now();

    // Simulate slight delay so UI isn't jarringly fast if cache is hit
    await new Promise(r => setTimeout(r, 500));

    const uniqueUnverified = [];
    const seen = new Set();

    for (const proxy of scrapedProxies) {
        if (seen.has(proxy)) continue;
        const ip = proxy.split(':')[0];
        if (blacklist.has(ip)) continue;
        seen.add(proxy);
        uniqueUnverified.push(proxy);
    }

    state.validate.total = uniqueUnverified.length;
    state.times.dedupeEnd = Date.now();

    if (uniqueUnverified.length === 0) {
        state.fatalError = "No valid proxies found to test.";
        clearInterval(renderTimer);
        render();
        return;
    }

    let finalProxies = [];

    // 3. Validate
    state.phase = 'Validating';
    state.times.validateStart = Date.now();
    if (config.validation.checkProxies) {
        const validator = new ProxyValidator();
        finalProxies = await validator.validateProxies(uniqueUnverified, (current, total, alive, dead) => {
            state.validate.current = current;
            state.validate.total = total;
            state.validate.alive = alive;
            state.validate.dead = dead;
        });
    } else {
        finalProxies = uniqueUnverified.map(proxy => ({ proxy, valid: true, protocol: 'UNKNOWN', latency: 0 }));
        state.validate.current = uniqueUnverified.length;
        state.validate.alive = uniqueUnverified.length;
    }

    // 4. Output Pipeline
    state.times.validateEnd = Date.now();
    state.phase = 'Exporting';
    const pipeline = new ProxyPipeline();
    await pipeline.initGeoIP();
    await pipeline.save(finalProxies);

    state.finalDir = pipeline.outputDir;
    state.times.totalEnd = Date.now();
    state.phase = 'Done';
    state.isActive = false;

    // Force final render and clear interval
    clearInterval(renderTimer);
    render();
}

async function main() {
    if (isServing && !globalApiServer) {
        globalApiServer = new ApiServer(config.output.folderName, servePort, serveKey);
        try {
            await globalApiServer.start();
        } catch (err) {
            console.error(chalk.red(`\n✖ Fatal Error: Failed to start API Server on port ${servePort}. Is the port already in use?`));
            process.exit(1);
        }
    }

    do {
        await scrapeCycle();
        if (config.engine.loop) {
            console.log(chalk.cyan(`\n[Loop] Waiting 5 seconds before restarting sequence...\n`));
            await new Promise(r => setTimeout(r, 5000));
        }
    } while (config.engine.loop);
}

main().catch(err => {
    logger.fatal(`[Main] Unhandled error: ${err.message}`);
    state.fatalError = err.message;
    state.isActive = false;
    render();
    process.exit(1);
});
