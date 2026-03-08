import got from 'got';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { SocksProxyAgent } from 'socks-proxy-agent';

// This function runs isolated in a worker thread
export default async function checkProxy({ proxy, timeoutMs, targets, protocol = 'all' }) {
    const p = protocol.toLowerCase();
    const checkHttp = p === 'all' || p === 'http' || p === 'https';
    const checkSocks5 = p === 'all' || p === 'socks5';
    const checkSocks4 = p === 'all' || p === 'socks4';
    const httpAgent = {
        http: new HttpProxyAgent({ proxy: `http://${proxy}`, timeout: timeoutMs }),
        https: new HttpsProxyAgent({ proxy: `http://${proxy}`, timeout: timeoutMs })
    };

    const socks5Agent = {
        http: new SocksProxyAgent(`socks5://${proxy}`, { timeout: timeoutMs, tls: { rejectUnauthorized: false } }),
        https: new SocksProxyAgent(`socks5://${proxy}`, { timeout: timeoutMs, tls: { rejectUnauthorized: false } })
    };

    const socks4Agent = {
        http: new SocksProxyAgent(`socks4://${proxy}`, { timeout: timeoutMs, tls: { rejectUnauthorized: false } }),
        https: new SocksProxyAgent(`socks4://${proxy}`, { timeout: timeoutMs, tls: { rejectUnauthorized: false } })
    };

    const testProtocol = async (agentObj, protocol, url) => {
        try {
            const start = Date.now();
            await got(url, {
                agent: agentObj,
                timeout: {
                    request: timeoutMs
                },
                retry: { limit: 0 },
                throwHttpErrors: false,
                https: { rejectUnauthorized: false }
            });
            return { valid: true, protocol, latency: Date.now() - start };
        } catch (err) {
            // Either the connection timed out, was refused, or the proxy is dead
            return { valid: false };
        }
    };

    // Test across targets
    for (const url of targets) {
        if (checkHttp) {
            // Test HTTP first 
            let result = await testProtocol(httpAgent, 'HTTP', url);
            if (result.valid) return { proxy, ...result };
        }

        if (checkSocks5) {
            // Test SOCKS5
            let result = await testProtocol(socks5Agent, 'SOCKS5', url);
            if (result.valid) return { proxy, ...result };
        }

        if (checkSocks4) {
            // Test SOCKS4
            let result = await testProtocol(socks4Agent, 'SOCKS4', url);
            if (result.valid) return { proxy, ...result };
        }
    }

    return { proxy, valid: false };
}
