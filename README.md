<div align="center">
  <h1>✨ Superior Proxy Scraper & Validator</h1>
  <p>An ultra-high-performance, multi-threaded proxy scraping and validation engine built on Node.js 20. Featuring native Caxa executable bundling, GeoIP sorting, and an immersive expert-level CLI interface.</p>
</div>

<hr/>

## 🚀 Key Features

*   **Asynchronous Harvesting:** Scrape thousands of proxies from text, HTML, and JSON sources concurrently using highly optimized Regex abstractions.
*   **Multi-Core Validation:** Runs intense validation algorithms using native Node.js `Piscina` worker threads. Bypasses normal Single-Thread limits by dynamically testing hundreds of sockets simultaneously across all available CPU cores.
*   **Advanced Protocol Handshakes:** Intelligently identifies and tests `HTTP`, `HTTPS`, `SOCKS4`, and `SOCKS5` networks. Includes fallback pinging to guarantee connection authenticity.
*   **Zero-Config GeoIP Encapsulation:** Maps validated proxies directly to their physical Country Codes (US, GB, DE) utilizing the MaxMind GeoLite2 Database. The MMDB is natively bundled into the standalone binaries!
*   **Aesthetic Terminal UI:** Experience a stunning, immersive Command Line Interface featuring fluid progress bars, live tracking gradients, deduplication metrics, and intelligent human-readable elapsed time formatting.
*   **Smart Network Handling:** Built-in intelligent retries, granulated fetching timeouts, automated deduplication, and customizable IP blacklists (`config/blacklist.json`).
*   **Native Cross-Platform Binaries:** Run the scraper natively as a completely standalone `.exe` (or Linux/macOS binary) with zero Node.js installations required.

---

## 💻 Installation

### Option 1: Standalone Native Executables (Recommended)
You do **not** need Node.js, Python, or any external dependencies to run the compiled binaries. We use CI/CD pipelines to build standalone executables out of the box with the GeoIP databases already physically embedded in the file memory.

1. Go to the **[Releases](../../releases)** tab on GitHub.
2. Download the appropriate file for your Operating System:
   - `akscraper-windows.exe` (Windows)
   - `akscraper-linux` (Ubuntu / Linux)
   - `akscraper-macos` (macOS)
3. Open your terminal in the downloaded folder and run the file!

### Option 2: Run from Source (Developers)
If you want to modify the source code or run it natively through npm:

```bash
# Clone the Repository
git clone https://github.com/itsanwar/proxy-scraper-ak.git
cd proxy-scraper-ak

# Install Dependencies (Requires Node.js v20+)
npm install

# Run the Scraper natively
node src/index.js -s links.txt
```

---

## ⚙️ CLI Arguments & Usage

Control the engine dynamically through flexible command-line arguments.

```bash
Usage: akscraper [options]

Options:
  -s, --sources <path>       Path to the text file containing raw URLs to scrape (default: "links.txt")
  -c, --concurrency <number> Maximum concurrent fetch requests to scraping sources (default: 20)
  -w, --workers <number>     Number of Pico CPU worker threads to utilize for validation (default: your system CPU count)
  -t, --timeout <ms>         Validation socket timeout in milliseconds (default: 7000)
  -p, --protocol <type>      Force strictly ONE protocol check to massively speed up yields. (Choices: "all", "http", "https", "socks4", "socks5" | default: "all")
  -o, --output <path>        Custom directory path to save validated proxies (default: "sproxies")
  -l, --loop                 Enable infinite looping mode. Automatically restarts scraping endlessly.
  --nocache                  Bypass source cache and force raw HTTP fetching on every cycle.
  -h, --help                 Display all available commands.
```

### Expert Examples

**The "High-Yield HTTP-Only" Setup:**
Scrape sources but *only* aggressively validate HTTP proxies, bypassing heavy SOCKS fallback checks to massively speed up completion tracking. Use 80 concurrent validation workers mapping from a `sources.txt` file.
```bash
akscraper -s sources.txt -p http -w 80
```

**The "Infini-Bot" Setup:**
Force the scraper to run indefinitely in an endless loop, clearing its physical cache map on every single iteration to ensure the freshest proxies are constantly piped into your targeted server export layout architecture.
```bash
akscraper -s links.txt -o ./production_proxies -l --nocache
```

---

## 📂 Output Architecture Structure

When the engine finishes executing a validation cycle, all alive proxies are immediately sorted geographically and dumped cleanly into the targeted output folder (default `sproxies/`).

```text
sproxies/
├── ALL.txt     (A master list of every single validated proxy)
├── US.txt      (Only proxies physically located in the United States)
├── GB.txt      (Only proxies physically located in Great Britain)
├── DE.txt      (Only proxies physically located in Germany)
└── ...
```

---

## 🛠️ Configuration Layer (`config/default.js`)

You can permanently customize physical engine limits, threading layouts, output folder formats, and backend logic by tweaking the `config/default.js` mapping layer.

```javascript
export default {
    engine: {
        scrapeTimeoutMs: 10000,
        scrapeRetries: 2,
    },
    validation: {
        checkConcurreny: 800,  // Max parallel socket dials
        validationTargets: [   // The destination addresses Pinged to verify proxy life
            "http://1.1.1.1",
            "http://8.8.8.8"
        ]
    },
    output: {
        filterByCountry: true, // Auto-Generate US.txt, GB.txt, etc.
        folderName: "sproxies" // Final destination folder name
    }
}
```

## 🏗️ Building Binaries (For Contributors)

This repository utilizes `caxa` native binary mapping. 

To compile standalone executable binaries for all architectures locally:
```bash
npm run build:windows
npm run build:linux
npm run build:macos
```
*Note: Ensure you are running Node v20+ to compile the ES2024 Regex syntaxes used by internal pipeline dependencies.*
