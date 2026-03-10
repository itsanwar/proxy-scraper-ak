# Contributing to AK Scraper

First off, thank you for considering contributing to AK Scraper! People like you make the open-source community an amazing place to learn, inspire, and create.

## 🛠️ Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally: `git clone https://github.com/your-username/proxy-scraper-ak.git`
3. **Install dependencies**: `npm install`
4. **Create a new branch** for your feature or bug fix: `git checkout -b feature/your-feature-name`

## 🧠 Architecture Guidelines

Before writing code, please understand the core engine architecture:
- **`src/index.js`**: The orchestrator and CLI parser (`commander`). Keeps the TUI alive.
- **`src/core/collector.js`**: Handles scraping concurrent streams from the internet natively.
- **`src/core/validator.js`**: Manages the `Piscina` worker threads. DO NOT perform heavy synchronous mapping here; offload logic to the `checker.js` threads to prevent TUI blocking.
- **`src/workers/checker.js`**: Isolated native Node.js threads. Changes here must never contain `console.log` as it shatters the graphical UI overlays. Use the `parentPort` messaging relays instead.

## ✅ Submitting Changes

1. Ensure your code passes standard native executions: `node src/index.js -s links.txt`
2. **Commit your changes** with descriptive formatting: `git commit -m "feat(api): description"`
3. **Push to your fork**: `git push origin feature/your-feature-name`
4. Submit a **Pull Request** against the `main` branch. Fill out the PR template accurately.

## 🐛 Bug Reports

We use strict YAML-based issue reporting. Please navigate to the **Issues** tab and click **New Issue** to fill out our automated bug report forms.

Thank you for contributing!
