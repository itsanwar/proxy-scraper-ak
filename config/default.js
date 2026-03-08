import os from 'os';

export default {
    engine: {
        // Whether to disable map caching on fetch calls
        noCache: false,
        // Whether to run indefinitely in a loop
        loop: false,
        // Number of proxy sources to fetch concurrently
        scrapingConcurrency: 20,
        // Wait timeout per source request (ms)
        scrapeTimeoutMs: 10000,
        // Number of fetch retries per source
        scrapeRetries: 2,
    },
    validation: {
        // Whether to validate proxies or just scrape
        checkProxies: true,
        // Which protocol to check (all, http, https, socks4, socks5)
        checkProtocol: 'all',
        // Number of parallel validation workers/threads (will default to num CPUs via Piscina, but can be capped)
        workerCount: Math.min(10, os.cpus().length || 4),
        // Timeout for a proxy connection check in ms (default 5s in python, increased to 7s for higher yields)
        checkTimeoutMs: 7000,
        // Max parallel proxy tests
        checkConcurrency: 800,
        // URLs used to test standard internet connectivity 
        validationTargets: [
            "http://1.1.1.1",
            "http://8.8.8.8",
            "http://www.google.com"
        ]
    },
    output: {
        // Automatically group valid proxies into files by Country Code?
        filterByCountry: true,
        // Export folder location
        folderName: "sproxies",
        // Path to local mmdb db
        geoDbPath: "./GeoLite2-Country.mmdb"
    }
};
