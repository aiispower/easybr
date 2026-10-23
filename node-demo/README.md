# Local API 与 CDP 示例说明

[返回主页](../README.md) · [Local API 官方文档](https://www.ebrower.com/helperdoc/apidoc.html)

本目录保留 Puppeteer、Playwright 与 Selenium 的连接示意。现有示例中的调试端口、WebSocket 地址和驱动路径是历史演示值，不能直接当作当前环境的地址运行。

## 正确接入顺序

1. 通过 EasyBR Local API 选择并启动准确环境。
2. 从本次启动响应读取实际 CDP HTTP / WebSocket 调试地址和匹配的 driver 路径。
3. 将实际值传给所选自动化工具，再定位目标页面。
4. 操作完成后核对页面和文件，只清理本次创建的标签；不要关闭其他任务共用的浏览器。

Local API 负责环境生命周期；网页自动化可以使用 CDP 工具，也可直接使用内置 Easy WebBridge。普通用户与 Agent 上手建议先看 [AI 接入指南](../docs/AI-QUICKSTART.md)。

## 文件

| 文件 | 参考内容 |
| --- | --- |
| `playwright.js` | Playwright 连接已有 CDP 调试地址 |
| `puppeteer.js` | Puppeteer 连接已有浏览器 WebSocket |
| `selenium.js`、`index.js` | Selenium 历史示意，需核对当前驱动与 debuggerAddress 配置 |

示例依赖与 API 会随所选工具版本变化，使用前按各工具官方文档核对。不要把本目录示意描述成已经完成真实任务验收的自动化脚本。
