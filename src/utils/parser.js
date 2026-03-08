export function parseProxies(text) {
    const proxies = new Set();

    // Pattern 1: Basic IP:Port format
    const basicPattern = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5})/g;
    let match;
    while ((match = basicPattern.exec(text)) !== null) {
        proxies.add(match[1]);
    }

    // Pattern 2: HTML Table IP and Port in separate tags / columns
    const htmlPattern = />\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*<.*?>\s*(\d{2,5})\s*</gs;
    while ((match = htmlPattern.exec(text)) !== null) {
        proxies.add(`${match[1]}:${match[2]}`);
    }

    // Pattern 3: JSON "ip":"x", "port":"y"
    const jsonPattern = /"ip"\s*:\s*"?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"?.*?,"port"\s*:\s*"?(\d{2,5})"?/g;
    while ((match = jsonPattern.exec(text)) !== null) {
        proxies.add(`${match[1]}:${match[2]}`);
    }

    // Pattern 4: Standalone IP & Port mapping (fallback)
    if (proxies.size === 0) {
        const ips = [...text.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)].map(m => m[1]);
        const ports = [...text.matchAll(/\b(\d{4,5})\b/g)].map(m => m[1]);

        // Only zip them if there's a plausible correlation
        if (ips.length > 0 && ports.length > 0 && ips.length <= ports.length * 2) {
            const limit = Math.min(ips.length, ports.length);
            for (let i = 0; i < limit; i++) {
                proxies.add(`${ips[i]}:${ports[i]}`);
            }
        }
    }

    // Additional Validation Pass
    const validProxies = Array.from(proxies).filter(isValidProxyFormat);
    return validProxies;
}

function isValidProxyFormat(proxy) {
    const parts = proxy.split(':');
    if (parts.length !== 2) return false;

    const [ip, port] = parts;
    const octets = ip.split('.');

    if (octets.length !== 4) return false;
    for (const octet of octets) {
        const num = parseInt(octet, 10);
        if (isNaN(num) || num < 0 || num > 255) return false;
        // prevent leading zeros bypass
        if (octet !== num.toString()) return false;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return false;

    return true;
}
