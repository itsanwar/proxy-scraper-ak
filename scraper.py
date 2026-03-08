import geoip2.database, re, requests, threading, os, shutil, time, datetime, argparse
from concurrent.futures import ThreadPoolExecutor

parser = argparse.ArgumentParser(description="Scraping and Scanning proxies")
parser.add_argument("--output", type=str, help="Output Folder : /root/proxies")
parser.add_argument("--proxyCheck", type=str, help="1/0 | Default : 1")
parser.add_argument("--timeout", type=int, help="5-60 | Default : False")
parser.add_argument("--threads", type=int, help="1000-50000 | Default : 1000")
parser.add_argument("--filterProxies", type=str, help="1/0 | Default : 1")
args = parser.parse_args()

sTime = time.time()
folderPath = args.output or os.path.join(os.getcwd(), "sproxies")

proxyCheck = args.proxyCheck != "0"
checkTimeout = args.timeout or 5
checkThreads = args.threads or 1000
filterProxies = args.filterProxies != "0"
checkedProxies = []

print(f"""
-----------------------------------
      AK SCRAPER V3 
-----------------------------------
 ProxyCheck : {proxyCheck}
 OutputFolder : {folderPath}
 ProxyTimeout : {checkTimeout}
 ProxyThreads : {checkThreads}
 FilterProxies : {filterProxies}
-----------------------------------""")

alive = died = totalChecks = 0

def check_proxy(proxy):
    global alive, died, totalChecks
    totalChecks += 1
    proxy_url = f"http://{proxy}"
    try:
        response = requests.get("https://1.1.1.1", proxies={"http": proxy_url, "https": proxy_url}, timeout=checkTimeout)
        if response.status_code == 200:
            checkedProxies.append(proxy)
            alive += 1
        else:
            died += 1
    except:
        died += 1
    print(f"\r[+] Alive : {alive} | Died : {died} | Checking : {totalChecks} / {len(allProxies)}     ", end="")

def scan_proxies(proxy_list):
    with ThreadPoolExecutor(max_workers=checkThreads) as executor:
        executor.map(check_proxy, proxy_list)

def get_country_name(ip_address):
    try:
        return geoip2.database.Reader('GeoLite2-Country.mmdb').country(ip_address).country.iso_code
    except:
        return None

urls = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "links.txt"), encoding='utf-8').read()
good_proxies = []

def patterns(url, patterns=[lambda x: re.findall('(\d{,3}\.\d{,3}\.\d{,3}\.\d{,3}:\d{2,5})', x),
                             lambda x: re.findall('>(\d{,3}\.\d{,3}\.\d{,3}\.\d{,3})<', x),
                             lambda x: re.findall('>\n[\s]+(\d{,3}\.\d{,3}\.\d{,3}\.\d{,3})', x),
                             lambda x: re.findall('>(\d{,3}\.\d{,3}\.\d{,3}\.\d{,3})<', x),
                             lambda x: re.findall('(\d{,3}\.\d{,3}\.\d{,3}\.\d{,3})', x)]):
    scraped_proxies = []
    for pattern in patterns:
        try:
            data = pattern(requests.get(url, headers={'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36'}, timeout=5).text)
            if data:
                good_proxies.extend(data)
                scraped_proxies.extend(data)
                break
            else:
                continue
        except Exception as e:
            print(f"[-] Error scraping {url} : {e}")
            break
    print(f"[+] Scraped {len(scraped_proxies)} proxies from {url}")

threads = [threading.Thread(target=patterns, args=(url,)) for url in urls.strip().splitlines() if url]
[thread.start() for thread in threads]
[thread.join() for thread in threads]

allProxiesPath = os.path.join(folderPath, "ALL.txt")
allProxies = set(good_proxies)
print("[+] Total Scraped :", len(good_proxies))
print("[+] Total Unique :", len(allProxies))

try:
    if proxyCheck:
        print("[+] Checking Proxies...")
        scan_proxies(allProxies)
        print("\n[+] Total Checked :", len(checkedProxies))
        allProxies = checkedProxies
except KeyboardInterrupt: exit(1)

shutil.rmtree(folderPath, True)
os.mkdir(folderPath)

open(allProxiesPath, "w").write('\n'.join(allProxies))

if not filterProxies:
    print("[+] All Proxies Saved!", "\n[+] Total Time Taken :",  datetime.timedelta(seconds=int(time.time()-sTime)))
    quit(1)

print("[+] Filtering Proxies...")

for proxy in allProxies:
    countryCode = get_country_name(proxy.split(":")[0])
    if countryCode:
        open(os.path.join(folderPath, countryCode+".txt"), "a").write(f"{proxy}\n")

print("[+] Filtering Done")
print("[+] Total Time Taken :",  datetime.timedelta(seconds=int(time.time()-sTime)))
