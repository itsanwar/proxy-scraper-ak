import geoip2.database
import re
import requests
import threading
import os
import shutil
import time
import datetime
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib3.exceptions import InsecureRequestWarning
import logging

# Suppress SSL warnings for proxy checking
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

parser = argparse.ArgumentParser(description="Scraping and Scanning proxies")
parser.add_argument("--output", type=str, help="Output Folder : /root/proxies")
parser.add_argument("--proxyCheck", type=str, help="1/0 | Default : 1")
parser.add_argument("--timeout", type=int, help="5-60 | Default : 5")
parser.add_argument("--threads", type=int, help="1000-50000 | Default : 5000")
parser.add_argument("--filterProxies", type=str, help="1/0 | Default : 1")
parser.add_argument("--scrapingThreads", type=int, help="Threads for scraping | Default : 100")
args = parser.parse_args()

sTime = time.time()
folderPath = args.output or os.path.join(os.getcwd(), "sproxies")

proxyCheck = args.proxyCheck != "0"
checkTimeout = args.timeout or 5
checkThreads = min(args.threads or 5000, 50000)  # Cap at 50k
scrapingThreads = args.scrapingThreads or 100
filterProxies = args.filterProxies != "0"

# Thread-safe counter and list
lock = threading.Lock()
checkedProxies = []
alive = 0
died = 0
totalChecks = 0

print(f"""
-----------------------------------
      AK SCRAPER V3 OPTIMIZED
-----------------------------------
 ProxyCheck      : {proxyCheck}
 OutputFolder    : {folderPath}
 ProxyTimeout    : {checkTimeout}s
 CheckThreads    : {checkThreads}
 ScrapingThreads : {scrapingThreads}
 FilterProxies   : {filterProxies}
-----------------------------------""")


def check_proxy(proxy):
    """Check if proxy is alive with thread-safe counting"""
    global alive, died, totalChecks
    
    proxy_url = f"http://{proxy}"
    test_urls = [
        "http://1.1.1.1",
        "http://8.8.8.8",
        "http://www.google.com"
    ]
    
    for test_url in test_urls:
        try:
            response = requests.get(
                test_url,
                proxies={"http": proxy_url, "https": proxy_url},
                timeout=checkTimeout,
                verify=False,
                allow_redirects=False
            )
            if response.status_code in [200, 204, 301, 302, 307, 308]:
                with lock:
                    checkedProxies.append(proxy)
                    alive += 1
                    totalChecks += 1
                    print(f"\r[+] Alive: {alive} | Died: {died} | Progress: {totalChecks}/{len(allProxies)}     ", end="", flush=True)
                return True
        except:
            continue
    
    with lock:
        died += 1
        totalChecks += 1
        print(f"\r[+] Alive: {alive} | Died: {died} | Progress: {totalChecks}/{len(allProxies)}     ", end="", flush=True)
    return False


def scan_proxies(proxy_list):
    """Scan proxies with optimized thread pool"""
    print(f"[+] Starting check with {checkThreads} threads...")
    with ThreadPoolExecutor(max_workers=checkThreads) as executor:
        list(executor.map(check_proxy, proxy_list))


def get_country_name(ip_address):
    """Get country code from IP with caching"""
    try:
        with geoip2.database.Reader('GeoLite2-Country.mmdb') as reader:
            return reader.country(ip_address).country.iso_code
    except:
        return "UNKNOWN"


def scrape_url(url):
    """Scrape proxies from URL with multiple pattern matching and timeout"""
    patterns = [
        r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5})',
        r'>(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})<.*?>(\d{2,5})<',
        r'>\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*<',
        r'"ip":"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})".*?"port":"?(\d{2,5})"?',
    ]
    
    proxies = []
    try:
        headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate',
            'connection': 'close'
        }
        
        # Reduced timeout and added session for connection reuse
        session = requests.Session()
        session.headers.update(headers)
        response = session.get(url, timeout=10, verify=False, allow_redirects=True)
        response.raise_for_status()
        text = response.text
        session.close()
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                for match in matches:
                    if isinstance(match, tuple):
                        # Handle grouped patterns
                        if len(match) == 2:
                            proxies.append(f"{match[0]}:{match[1]}")
                        else:
                            proxies.append(match[0])
                    else:
                        proxies.append(match)
        
        # Also try to find standalone IPs and ports
        ips = re.findall(r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b', text)
        ports = re.findall(r'\b(\d{4,5})\b', text)
        
        if ips and ports:
            for i, ip in enumerate(ips[:len(ports)]):
                candidate = f"{ip}:{ports[i]}"
                if candidate not in proxies:
                    proxies.append(candidate)
        
        print(f"[+] Scraped {len(proxies)} from {url[:50]}...")
    except requests.exceptions.Timeout:
        print(f"[-] Timeout scraping {url[:50]}...")
    except requests.exceptions.RequestException as e:
        print(f"[-] Error scraping {url[:50]}: {str(e)[:30]}")
    except Exception as e:
        print(f"[-] Unexpected error {url[:50]}: {str(e)[:30]}")
    
    return proxies


# Check if links.txt exists
links_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "links.txt")
if not os.path.exists(links_file):
    print(f"[-] Error: {links_file} not found!")
    print("[!] Creating sample links.txt file...")
    with open(links_file, 'w') as f:
        f.write("https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt\n")
        f.write("https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt\n")
        f.write("https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt\n")
    print("[+] Sample links.txt created. Please add more proxy sources.")

urls = open(links_file, encoding='utf-8').read().strip().splitlines()
urls = [url for url in urls if url and not url.startswith('#')]

print(f"[+] Scraping from {len(urls)} sources...")

# Scrape proxies with thread pool and aggressive timeout handling
print(f"[+] Scraping from {len(urls)} sources...")
all_scraped = []
completed = 0
total_urls = len(urls)

with ThreadPoolExecutor(max_workers=scrapingThreads) as executor:
    # Submit all tasks
    future_to_url = {executor.submit(scrape_url, url): url for url in urls}
    
    try:
        # Use timeout to prevent infinite waiting - max 60 seconds total
        for future in as_completed(future_to_url, timeout=60):
            completed += 1
            try:
                result = future.result(timeout=2)  # Quick per-future timeout
                all_scraped.extend(result)
            except Exception as e:
                url = future_to_url[future]
                print(f"[-] Failed {url[:50]}: {type(e).__name__}")
            
            # Progress indicator
            if completed % 5 == 0 or completed == total_urls:
                print(f"[*] Progress: {completed}/{total_urls} sources processed...")
    except Exception as e:
        print(f"[!] Scraping timeout reached. Processed {completed}/{total_urls} sources")
        print(f"[!] Continuing with {len(all_scraped)} proxies collected so far...")

print(f"[+] Scraping complete! Total processed: {completed}/{total_urls} sources")

# Validate and deduplicate proxies
def is_valid_proxy(proxy):
    """Validate proxy format"""
    try:
        parts = proxy.split(':')
        if len(parts) != 2:
            return False
        ip, port = parts
        octets = ip.split('.')
        if len(octets) != 4:
            return False
        for octet in octets:
            if not 0 <= int(octet) <= 255:
                return False
        if not 1 <= int(port) <= 65535:
            return False
        return True
    except:
        return False

allProxies = list(set([p for p in all_scraped if is_valid_proxy(p)]))

print(f"\n[+] Total Scraped: {len(all_scraped)}")
print(f"[+] Total Valid & Unique: {len(allProxies)}")

# Check proxies if enabled
try:
    if proxyCheck and allProxies:
        print("[+] Starting proxy validation...")
        scan_proxies(allProxies)
        print(f"\n[+] Validation complete: {alive} alive, {died} dead")
        allProxies = checkedProxies
    elif not allProxies:
        print("[-] No proxies found to check!")
except KeyboardInterrupt:
    print("\n[!] Interrupted by user")
    exit(1)

# Create output folder
if os.path.exists(folderPath):
    shutil.rmtree(folderPath, ignore_errors=True)
os.makedirs(folderPath, exist_ok=True)

# Save all proxies
allProxiesPath = os.path.join(folderPath, "ALL.txt")
with open(allProxiesPath, "w") as f:
    f.write('\n'.join(allProxies))

print(f"[+] Saved {len(allProxies)} proxies to ALL.txt")

# Filter by country if enabled
if filterProxies and allProxies:
    print("[+] Filtering proxies by country...")
    country_dict = {}
    
    for proxy in allProxies:
        try:
            ip = proxy.split(":")[0]
            country = get_country_name(ip)
            if country not in country_dict:
                country_dict[country] = []
            country_dict[country].append(proxy)
        except Exception as e:
            country_dict["UNKNOWN"] = country_dict.get("UNKNOWN", []) + [proxy]
    
    for country, proxy_list in country_dict.items():
        country_file = os.path.join(folderPath, f"{country}.txt")
        with open(country_file, "w") as f:
            f.write('\n'.join(proxy_list))
        print(f"[+] {country}: {len(proxy_list)} proxies")
    
    print("[+] Filtering complete!")

elapsed = datetime.timedelta(seconds=int(time.time() - sTime))
print(f"\n{'='*50}")
print(f"[✓] Total Time: {elapsed}")
print(f"[✓] Final Count: {len(allProxies)} proxies")
print(f"[✓] Output: {folderPath}")
print(f"{'='*50}")
