# LeetCommit

<p align="center">
  <img src="assets/icon128.png" alt="LeetCommit Logo" width="80" height="80" />
</p>

<p align="center">
  <strong>Direct, secure, and automated synchronization of your LeetCode solutions to GitHub.</strong><br>
  Built with Chrome Extension Manifest V3 • 100% Client-Side • Scoped Personal Access Tokens
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-10B981?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Security-Fine--Grained%20PAT-FFA116?style=flat-square&logo=github&logoColor=white" alt="Fine-Grained PAT" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Serverless-3B82F6?style=flat-square" alt="Privacy First" />
  <img src="https://img.shields.io/badge/Languages-19%2B%20Supported-8B5CF6?style=flat-square" alt="Supported Languages" />
  <img src="https://img.shields.io/badge/Developer-ashutosh110405-black?style=flat-square&logo=github&logoColor=white" alt="Developer" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

---

## 📌 Overview

**LeetCommit** is a lightweight, privacy-first browser extension designed to effortlessly document your coding interview preparation. Whenever you solve a problem on LeetCode and receive an **Accepted** verdict, LeetCommit automatically captures the complete solution code and problem statement, committing them directly to your designated GitHub repository in a clean, structured hierarchy.

Unlike tools that rely on third-party OAuth authorization servers or require granting blanket read/write permissions across all your personal and organization repositories, **LeetCommit connects directly from your browser to GitHub's REST API**. Authentication is managed via a **Fine-Grained Personal Access Token (PAT)** restricted strictly to a single repository of your choice.

---

## ✨ Key Features

- **🔒 Single-Repository Scope (Zero-Trust Privacy)**  
  Your credentials never leave your browser. Works with GitHub Fine-Grained Personal Access Tokens scoped exclusively to your solutions repository with `Contents: Read and write` permissions.

- **⚡ Serverless & Direct Execution**  
  Zero intermediary proxy servers, zero external authentication services, and zero third-party databases. Every API call communicates directly between your local browser and `api.github.com`.

- **📄 100% Full Code Capture**  
  Utilizes official GraphQL solution verification and multi-stage memory extraction to ensure your entire code file—including all comments, indentations, and imports—is committed without truncation or whitespace corruption.

- **🧠 Auto Language Detection (19+ Languages)**  
  Automatically identifies the active programming language from LeetCode and assigns the correct file extension:
  `Python3`, `C++`, `Java`, `C`, `C#`, `JavaScript`, `TypeScript`, `Go`, `Rust`, `Kotlin`, `Swift`, `Ruby`, `PHP`, `Dart`, `Scala`, `Elixir`, `Erlang`, `Racket`, and `SQL`.

- **🎯 Smart Submission Filtering**  
  Intelligently distinguishes between **Run Code** and **Submit Code**. Clicking *Run Code* displays a ready-to-submit status toast without committing test cases to git. Only verified, accepted submissions are pushed.

- **🛡️ Duplicate Commit Prevention**  
  Checks both local cache and remote file SHAs before initiating a commit. Resubmitting identical code skips redundant commits, keeping your git history clean.

- **📊 Comprehensive Problem READMEs**  
  Each committed problem directory includes a automatically generated `README.md` containing:
  - Direct link to the problem on LeetCode
  - Difficulty badge (`Easy`, `Medium`, `Hard`)
  - Runtime and Memory performance metrics with percentile rankings (*e.g., Beats 92.4%*)
  - Topic tags (*e.g., `Array`, `Hash Table`, `Dynamic Programming`*)
  - Formatted problem description and constraints

- **🔔 Live In-Page Notifications**  
  Displays smooth, unobtrusive floating status toasts right inside LeetCode with direct links to view the newly pushed commit on GitHub.

- **🎨 Modern Dark UI Dashboard**  
  Manage your connection status, view your under-use PAT key, switch target repositories on the fly, and inspect recent sync activity directly from the extension popup.

---

## 📁 Repository Directory Structure

LeetCommit organizes your solutions systematically by default:

```text
my-leetcode-solutions/
├── 0001-two-sum/
│   ├── two-sum.py             # Pristine solution code (.py, .cpp, .java, etc.)
│   └── README.md              # Question statement, stats & badges
├── 0015-3sum/
│   ├── 3sum.cpp
│   └── README.md
├── 0020-valid-parentheses/
│   ├── valid-parentheses.ts
│   └── README.md
└── 0142-linked-list-cycle-ii/
    ├── linked-list-cycle-ii.java
    └── README.md
```

*(You can also configure the folder structure in the extension settings to categorize problems by difficulty: `Easy/0001-two-sum/`, `Medium/0015-3sum/`, etc.)*

### Sample Generated README

```markdown
# [1. Two Sum](https://leetcode.com/problems/two-sum/)

![Difficulty: Easy](https://img.shields.io/badge/Difficulty-Easy-brightgreen?style=flat-square)
![Language: Python3](https://img.shields.io/badge/Language-Python3-blue?style=flat-square)
![Runtime](https://img.shields.io/badge/Runtime-42%20ms%20(Beats%2088.5%25)-success?style=flat-square)
![Memory](https://img.shields.io/badge/Memory-17.8%20MB%20(Beats%2074.2%25)-informational?style=flat-square)

### Topics
`Array` `Hash Table`

---

### Description
Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target...
```

---

## 🚀 Installation Guide

### Option 1: Load Directly in Google Chrome (Developer Mode)

1. **Clone or Download** this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/LeetCommit.git
   ```
2. Open Google Chrome and enter `chrome://extensions/` in the address bar.
3. In the top-right corner, turn on **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `LeetCommit` project folder.
6. Pin **LeetCommit** to your Chrome toolbar for quick access!

---

## 🔑 Setting Up Your GitHub PAT (Step-by-Step)

To maintain maximum security, create a Fine-Grained Personal Access Token restricted strictly to your LeetCode repository:

1. Navigate to GitHub's **New Fine-grained Personal Access Token** page:  
   👉 [https://github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. Configure the token details:
   - **Token name**: `LeetCommit` (or any custom name)
   - **Expiration**: Select your preferred validity period (*e.g., 90 days, 1 year*)
   - **Repository access**: Choose **"Only select repositories"**
   - Select your target solutions repository (*e.g., `leetcode-solutions`*)
3. Configure Permissions:
   - Expand **Repository permissions**
   - Locate **Contents** &rarr; select **Read and write**  
     *(Leave all other permissions as "No access")*
4. Click **Generate token** at the bottom of the page and copy the generated token (`github_pat_...`).
5. Click the **LeetCommit** extension icon in your Chrome toolbar:
   - Paste your token into the **Personal Access Token** field.
   - Select your target repository from the dropdown (or type `username/repository-name`).
   - Click **Save & Connect**.

> **Tip:** If you haven't created a repository yet, you can click **"+ Create new repo"** directly inside the LeetCommit extension popup to create a private or public repository on GitHub automatically!

---

## ⚙️ Configuration & Repository Switching

Need to change your target repository or update your token?
1. Open the LeetCommit extension popup.
2. Click **⚙ Edit Config**.
3. Your connection remains **Active**. The under-use PAT key will be displayed in the input field.
4. Pick any other accessible repository from the **Target Repository** dropdown.
5. Click **Update & Save Changes** (or click **Cancel** to discard changes and return to the dashboard).

---

## 🛠️ Project Structure

```text
LeetCommit/
├── manifest.json            # Manifest V3 extension configuration
├── popup/
│   ├── popup.html           # Dark cyber dashboard & configuration markup
│   ├── popup.css            # Cyber-slate theme & responsive styles
│   └── popup.js             # Setup controller, PAT verification & repo switcher
├── welcome/
│   ├── welcome.html         # Full-page onboarding wizard
│   ├── welcome.css          # Onboarding presentation styles
│   └── welcome.js           # First-time setup controller
├── scripts/
│   ├── background.js        # Service worker: GitHub commit orchestration & URL navigation
│   ├── content.js           # Content script: GraphQL verification, fallback DOM reader & toasts
│   ├── inject.js            # Network interceptor: captures submission requests & metadata
│   ├── github-api.js        # Standalone GitHub REST API client (UTF-8 Base64, commit builder)
│   └── leetcode-parser.js   # Fast HTML-to-Markdown problem description parser
├── styles/
│   └── toast.css            # Floating toast notification styling for LeetCode
└── assets/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    └── icon.svg
```

---

## 🔒 Security & Privacy Statement

LeetCommit was designed from day one with a strict security-first philosophy:

- **No Remote Servers**: LeetCommit operates completely inside your local browser. There are no backend databases, analytics trackers, or external endpoints involved.
- **Minimal Privilege**: Fine-grained PAT support guarantees that even if a token were compromised, it would only have access to a single designated repository, leaving the rest of your GitHub profile and private repositories secure.
- **Local Storage**: Your PAT and repository settings are stored solely within Chrome's sandboxed `chrome.storage.local`.

---

## 👨‍💻 Developer & Maintainer

LeetCommit is developed and maintained by **[@ashutosh110405](https://github.com/ashutosh110405)**.

Feel free to check out my profile, report issues, suggest features, or star ⭐ the repository!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
Feel free to star ⭐ the repository and contribute!

