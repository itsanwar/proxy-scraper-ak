import { Piscina } from 'piscina';
import pMap from 'p-map';
import config from '../../config/default.js';
import { logger } from '../utils/logger.js';

export class ProxyValidator {
    constructor() {
        this.pool = new Piscina({
            filename: new URL('../workers/checker.js', import.meta.url).href,
            maxThreads: config.validation.workerCount,
            concurrentTasksPerWorker: 2000,
            maxQueue: 100000
        });
    }

    async validateProxies(proxies, onProgress) {
        logger.info(`[Validator] Starting parallel validation of ${proxies.length} proxies with ${config.validation.workerCount} workers...`);
        let alive = 0;
        let dead = 0;
        let completed = 0;

        const validProxies = [];
        onProgress?.(completed, proxies.length, alive, dead);

        await pMap(proxies, async (proxy) => {
            let result = { valid: false };
            try {
                result = await this.pool.run({
                    proxy,
                    timeoutMs: config.validation.checkTimeoutMs,
                    targets: config.validation.validationTargets,
                    protocol: config.validation.checkProtocol
                });
            } catch (error) {
                // Thread errors or unexpected crashes
            }

            if (result.valid) {
                validProxies.push(result);
                alive++;
            } else {
                dead++;
            }

            completed++;
            onProgress?.(completed, proxies.length, alive, dead);

        }, { concurrency: config.validation.checkConcurrency });

        logger.info(`[Validator] Validation complete. Alive: ${alive}, Dead: ${dead}`);
        await this.pool.destroy();
        return validProxies;
    }
}
