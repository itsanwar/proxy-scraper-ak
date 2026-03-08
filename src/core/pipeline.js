import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import maxmind from 'maxmind';
import config from '../../config/default.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

export class ProxyPipeline {
    constructor() {
        this.outputDir = path.resolve(process.cwd(), config.output.folderName);
        this.lookup = null;
        this.resolvedGeoDbPath = path.resolve(projectRoot, config.output.geoDbPath);
    }

    async initGeoIP() {
        if (config.output.filterByCountry && fs.existsSync(this.resolvedGeoDbPath)) {
            try {
                this.lookup = await maxmind.open(this.resolvedGeoDbPath);
                logger.info('[Pipeline] GeoIP database loaded successfully.');
            } catch (err) {
                logger.warn(`[Pipeline] Failed to load GeoIP db: ${err.message}`);
            }
        } else if (config.output.filterByCountry) {
            logger.warn('[Pipeline] GeoIP database not found at path: ' + this.resolvedGeoDbPath);
        }
    }

    getCountryMapping(ip) {
        if (!this.lookup) return 'UNKNOWN';
        const geo = this.lookup.get(ip);
        if (geo && geo.country && geo.country.iso_code) {
            return geo.country.iso_code;
        }
        return 'UNKNOWN';
    }

    async save(validProxies) {
        if (fs.existsSync(this.outputDir)) {
            fs.rmSync(this.outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.outputDir, { recursive: true });

        const allLines = validProxies.map(p => p.proxy);
        fs.writeFileSync(path.join(this.outputDir, 'ALL.txt'), allLines.join('\n'));
        logger.info(`[Pipeline] Saved ${allLines.length} proxies to ALL.txt`);

        if (config.output.filterByCountry) {
            const countryMap = new Map();
            for (const p of validProxies) {
                const ip = p.proxy.split(':')[0];
                const country = this.getCountryMapping(ip);
                if (!countryMap.has(country)) {
                    countryMap.set(country, []);
                }
                countryMap.get(country).push(p.proxy);
            }

            for (const [country, proxies] of countryMap.entries()) {
                fs.writeFileSync(path.join(this.outputDir, `${country}.txt`), proxies.join('\n'));
            }
            logger.info(`[Pipeline] Saved proxies grouped by ${countryMap.size} countries.`);
        }
    }
}
