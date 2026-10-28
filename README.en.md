# EasyBR AI Fingerprint Browser

**Work in isolated browser profiles through conversation.** EasyBR combines separate browser environments with a Local API and built-in Easy WebBridge. A compatible local AI agent can manage a selected environment, read pages, fill forms, upload and download files, capture screenshots, and continue workflows in an existing signed-in browser.

[Website](https://www.ebrower.com/) · [Downloads](https://www.ebrower.com/down.html) · [GitHub releases](https://github.com/aiispower/easybr/releases) · [中文](README.md)

## What can you automate?

| Workflow | Capabilities |
| --- | --- |
| Environment management | Inspect, create and start a specific profile using the Local API |
| Research and browsing | Search, navigate, read page content, and produce reports with source links |
| Forms and dashboards | Fill supplied information, prepare drafts, and perform explicitly authorized submissions |
| Files | Upload local files, download reports, capture screenshots, and export PDFs |
| Multi-account work | Run the requested workflow in separately selected profiles and report each result |
| Diagnostics | Distinguish application, sign-in, environment, Bridge, extension and website failures |
| Developer integration | Use the Local API, Easy WebBridge, or CDP-based automation tools |

EasyBR runs on Windows and Apple silicon Macs. The free plan includes five independent environments; check the [official website](https://www.ebrower.com/) for current plans and features.

## How the parts fit together

- **EasyBR** stores separate profiles, cookies, local storage, proxy settings and browser configuration.
- **Local API** manages environments on the local computer.
- **Easy WebBridge** executes page commands in the chosen browser.
- **An AI agent and Skills** interpret the task, select tools, execute steps and verify the outcome.

EasyBR 1.7.8 and later include the Bridge and extension. The target environment must be running and connected. Separate extension installation is available for ordinary Chrome, Edge and QQ Browser; see the [official WebBridge guide](https://www.ebrower.com/helperdoc/easy-webbridge.html).

## A prompt to start

```text
Connect to EasyBR and check the application version, sign-in state, environment list and Bridge connection. Use only the environment I select, confirm its identity and website account, and preserve other profiles and tabs. Complete the task I describe and verify the final page or downloaded file. If a submission times out, check its status before submitting again. Ask me to complete any required account-security verification.
```

[Setup guide (Chinese)](docs/AI-QUICKSTART.md) · [Task prompt library (Chinese)](docs/AI-PROMPTS.md)

## Downloads

- [Official Windows and macOS downloads](https://www.ebrower.com/down.html)
- [GitHub release directory](https://github.com/aiispower/easybr/releases)
- [Mac ARM64 1.7.15 manual installation ZIP](https://github.com/aiispower/easybr/releases/download/mac-v1.7.15/easybrmac.zip)
- [All Mac 1.7.15 assets and checksums](https://github.com/aiispower/easybr/releases/tag/mac-v1.7.15)

Windows assets use their own `windows-v<version>` release tags. Download only the artifact matching your operating system and architecture. Public downloads do not require a release token.

## Mac agent Skill

Download [easybr-agent.zip](https://github.com/aiispower/easybr/raw/refs/heads/main/downloads/easybr-agent.zip), extract it, and place the complete `easybr-agent` directory in your agent's Skill folder. For Codex this normally is `~/.codex/skills/`.

The helper scripts require a local agent with file/command access and Node.js 20 or later. The built-in EasyBR Bridge has its own runtime. This Skill covers Mac onboarding; Windows users can connect an installed EasyBR environment using WebBridge and the Local API.

## Documentation and examples

- [Local API reference](https://www.ebrower.com/helperdoc/apidoc.html)
- [Easy WebBridge guide](https://www.ebrower.com/helperdoc/easy-webbridge.html)
- [Windows / Mac AI conversation workflow](https://www.ebrower.com/helperdoc/ai-agent-workflow.html)
- [Mac first-time installation details](https://www.ebrower.com/helperdoc/ai-browser-mac.html)
- [CDP example notes](node-demo/README.md)
- [Skill source](skills/easybr-agent/) and [product screenshots](images/)

![EasyBR profile management](images/image-20241219193535151.png)

This repository distributes product information, examples, an agent Skill and release artifacts. It does not contain the EasyBR desktop application's or browser kernel's source code. Website permissions, security checks and available extension capabilities still apply to each task. Scheduled execution requires an agent or an external scheduler.

For support, contact the team through the [official website](https://www.ebrower.com/). Updated: 2026-10-24.
