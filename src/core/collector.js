import got from 'got';
import pMap from 'p-map';
import { logger } from '../utils/logger.js';
import { parseProxies } from '../utils/parser.js';
import config from '../../config/default.js';

const cache = new Map();

export async function scrapeUrl(url, onLog) {
    if (!config.engine.noCache && cache.has(url)) {
        logger.debug(`Cache hit for ${url}`);
        const proxies = cache.get(url);
        onLog?.({ type: 'success', text: `Success: 200 (CACHE) : ${url} (Found: ${proxies.length})` });
        return proxies;
    }

    try {
        const response = await got(url, {
            timeout: {
                lookup: config.engine.scrapeTimeoutMs,
                connect: config.engine.scrapeTimeoutMs,
                secureConnect: config.engine.scrapeTimeoutMs,
                socket: config.engine.scrapeTimeoutMs,
                response: config.engine.scrapeTimeoutMs
            },
            retry: { limit: config.engine.scrapeRetries },
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-encoding': 'gzip, deflate',
                'connection': 'close'
            },
            https: { rejectUnauthorized: false }
        });

        const proxies = parseProxies(response.body);
        cache.set(url, proxies);
        logger.debug(`Scraped ${proxies.length} proxies from ${url}`);
        onLog?.({ type: 'success', text: `Success: ${response.statusCode} (${response.statusMessage || 'OK'}) : ${url} (Found: ${proxies.length})` });
        return proxies;
    } catch (error) {
        logger.error(`Failed to scrape ${url} - ${error.message}`);
        let errMsg = 'Unknown Error';
        if (error.response) {
            errMsg = `${error.response.statusCode} (${error.response.statusMessage || 'Not Found'})`;
        } else if (error.code) {
            errMsg = error.code;
        } else if (error.message) {
            errMsg = error.message;
        }
        onLog?.({ type: 'error', text: `Error: ${errMsg} : ${url}` });
        return [];
    }
}

export async function collectAllProxies(urls, onProgress, onLog) {
    logger.info(`[Collector] Starting proxy collection from ${urls.length} sources with concurrency ${config.engine.scrapingConcurrency}...`);

    const allProxies = new Set();
    let completed = 0;
    let totalFound = 0;
    let activeSources = 0;
    let deadSources = 0;

    onProgress?.(completed, urls.length, 0, 0, 0);

    const results = await pMap(urls, async (url) => {
        let isDead = false;
        const proxies = await scrapeUrl(url, (logPayload) => {
            if (logPayload.type === 'error') isDead = true;
            onLog?.(logPayload);
        });

        if (isDead) {
            deadSources++;
        } else {
            activeSources++;
        }

        completed++;
        totalFound += proxies.length;
        onProgress?.(completed, urls.length, totalFound, activeSources, deadSources);
        return proxies;
    }, { concurrency: config.engine.scrapingConcurrency });

    for (const proxyList of results) {
        for (const proxy of proxyList) {
            allProxies.add(proxy);
        }
    }

    logger.info(`[Collector] Scraping complete! Collected ${allProxies.size} unique un-verified proxies.`);
    return Array.from(allProxies);
}
