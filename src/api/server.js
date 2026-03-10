import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export class ApiServer {
    constructor(outputDir, port = 9090, apiKey = 'akscraper') {
        this.app = express();
        this.outputDir = path.resolve(process.cwd(), outputDir);
        this.port = port;
        this.apiKey = apiKey;
        this.server = null;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());

        // Zero-Trust Authentication Layer
        this.app.use((req, res, next) => {
            const key = req.query.apikey || req.headers['x-api-key'];
            if (!key || key !== this.apiKey) {
                return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
            }
            next();
        });
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.json({
                status: 'online',
                message: 'AK Scraper API Server',
                endpoints: ['/ALL.txt', '/HTTP.txt', '/SOCKS4.txt', '/SOCKS5.txt', '/[COUNTRY].txt']
            });
        });

        this.app.get('/:filename', (req, res) => {
            const requestedFile = req.params.filename;

            // Security: Prevent directory traversal (e.g. ../../etc/passwd)
            if (requestedFile.includes('/') || requestedFile.includes('\\')) {
                return res.status(400).json({ error: 'Bad Request: Invalid filename' });
            }
            if (!requestedFile.endsWith('.txt')) {
                return res.status(400).json({ error: 'Bad Request: Only .txt proxy files are permitted' });
            }

            const safePath = path.join(this.outputDir, requestedFile);

            if (!fs.existsSync(safePath)) {
                return res.status(404).json({ error: `Not Found: File '${requestedFile}' has not been generated yet.` });
            }

            // Stream the file directly
            res.setHeader('Content-Type', 'text/plain');
            const stream = fs.createReadStream(safePath);
            stream.pipe(res);
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    resolve(true);
                });
                this.server.on('error', (err) => {
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
