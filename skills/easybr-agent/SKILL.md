---
name: easybr-agent
description: 在 Mac 上通过对话下载和接入 EasyBR，检查登录及连接，创建、启动指定指纹环境并通过 Easy WebBridge 操作网页和排障。用于 EasyBR 用户接入和环境任务，不修改 Electron、后端或浏览器内核。
---

# EasyBR 对话操作（Mac）

把用户要求落实为实际安装、环境状态和网页结果。先读状态，复用已就绪部分；用户要求重新下载安装时必须实际下载并安装，不能拿已安装版本替代验收。有账号直接登录，没有账号通过现有注册界面邮箱注册；登录失败时不要擅自另注册。不要把用户一次指定的环境数量、账号或测试环境名写成所有用户的默认值。

## 运行与接入

从本 Skill 目录运行命令，要求 Agent 可执行 Node.js 20 或更新版本，脚本无 npm 依赖。EasyBR 内置 Bridge 使用 Electron 自己的运行时；用户无需为 Bridge 另装 Node.js，但运行这些辅助脚本的 Agent 需要 Node.js。若 Agent 没有本机命令和文件能力，先说明该限制，不宣称远程聊天即可安装本机应用。

```bash
node scripts/easybr.mjs doctor
node scripts/easybr.mjs list
```

`doctor` 只读，分别报告管理端、账号、环境列表和 Bridge 状态。支持账号状态的新版客户端会通过 `/auto/status` 核对当前管理界面会话及服务端账号，返回 `login_status`、`username` 和 `client_version`。`api_login_verified: true` 表示已由该接口确认当前登录，可以核对返回的用户名后继续，不需要每次再人工查看界面。用户名只用于当前用户的本机诊断，不写入公开资料。

`login_status: logged_out` 时协助登录或注册；`unknown` 时先检查界面、网络和版本，不输出猜测的用户名。旧客户端只返回服务在线，`doctor` 会保留 `unknown`，即使环境列表成功也不能当作已登录。`ui_login_verified` 始终为 `false`：只读 API 检查不代表已实际执行界面退出再登录验收。默认 Local API 是 `http://127.0.0.1:3001`，Bridge 是 `http://127.0.0.1:17777`。仅用户已配置其他本机端口时设置 `EASYBR_API_BASE_URL` / `EASY_WEBBRIDGE_URL`。不接受远程管理地址。

- 未安装或明确要求重装：读 [Mac 安装流程](references/mac-install.md)，完成下载、核验、安装、启动和登录。
- 已安装但管理端未启动：`node scripts/easybr.mjs start-manager`，有多个安装位置时传 `--app '/实际应用路径.app'`，随后重新诊断。
- 需要登录或注册：使用现有客户端界面，脚本没有登录或注册接口。没账号时引导填写邮箱并点击获取验证码，由用户在邮箱或垃圾邮件中查收；用户可自行填写，也可把验证码提供给 Agent 仅用于当前注册。密码设置和协议确认由用户按页面完成，注册后再登录。验证码失效时重新获取最新一封；邮箱已注册则回登录或找回密码。邮箱验证码不是图形 CAPTCHA，不因需要邮箱填码而停止全部辅助操作。系统权限、图形 CAPTCHA 和账号安全验证按实际提示由用户完成，之后继续。详见 [账号接入](references/mac-install.md#登录注册与后续)。

## 环境操作

明确目标账号与任务范围。名称必须精确匹配；重名时用真实返回的 ID，不取第一个。`list` 不启动环境，不输出完整配置、Cookie 或代理凭据。

```bash
node scripts/easybr.mjs create --name '本次任务的唯一环境名'
node scripts/easybr.mjs open --id '<刚返回的环境ID>'
```

`create` 使用现有 `/auto/addBrowers`，默认固定环境（`openmodel: "2"`）、146 内核、MacOS、直连、保留会话且关闭云同步；可传 `--kernel 119` 或 `--url 'https://目标网址'`。这些默认值只用于新建环境，不修改已有环境。需要代理、特定指纹或业务账号时先确认需求，再在客户端现有界面配置；不要自行购买代理或复制其他环境的凭据。名称已存在时只返回既有身份并标记 `created: false`，不覆盖配置。

`open` 使用 `/auto/openBrower`；支持 `--id` 或 `--name` 二选一。已在线则复用；管理端显示已打开但 Bridge 未上线时等待并报告卡点，不重启环境。首次内核下载按客户端现有提示处理；复用已有内核缓存不算首次下载验收。启动窗口可能显示，不能承诺全程无前台窗口。

查询和创建可能失败于套餐额度、登录失效、网络问题。HTTP 200 也可能是业务失败。创建或启动超时只发起过一次写请求，先重新查询名称、ID和已打开状态，不盲目重复请求。

### 关闭与保护已有环境

任务结束默认只关闭自有标签组，保留用户原有环境和标签页。需关闭本次新建环境时优先使用浏览器正常退出。当前客户端的 `/auto/closeBrower` 在超时后可能强制结束进程；用户要求“不强杀”时不要调用该接口。只有任务允许该客户端行为时才使用：

```bash
node scripts/easybr.mjs close --id '<准确环境ID>' --allow-client-close
```

脚本没有批量关闭、删除、清缓存或修改环境命令，不会自动清理用户数据。保留用户明确要求保护的环境，操作前后核对其 ID 和配置。

## 网页操作

使用现有 Easy WebBridge Skill/CLI；独立安装本包时也可用下列 HTTP 传输命令调用同一公开协议，无需另装浏览器执行器或启动第二个 Bridge：

```bash
node scripts/easybr.mjs bridge-list
node scripts/easybr.mjs bridge-command --browser-id 'easybr-<环境ID>' --action capabilities
node scripts/easybr.mjs bridge-command --browser-id 'easybr-<环境ID>' --action navigate --args-file '/本地私有目录/navigate.json'
```

`navigate.json` 示例（JSON 文件必须由 Agent 按实际任务生成）：

```json
{"url":"https://www.example.com","newTab":true,"session":"easybr-agent-本次唯一运行号","groupTitle":"本次任务"}
```

保持准确的同一 `browserId`，使用返回的明确 `tabId`。每项任务一个唯一 `session` 和标签组；顺序步骤复用组内页，确需同时比较时才在同组新增页。先快照再点击/填写；导航和明显 DOM 变化后刷新快照。普通操作保持后台，最终以页面、文件和任务结果回读确认，不能把按钮点击或文件选择成功当作提交/上传完成。

入门演示在准确环境中先核对默认内置 WebBridge 已加载并连接，再按正常人工节奏打开百度搜索 `easybr`：单次搜索、等待结果、读取辨认官网 `www.ebrower.com`、点击一次并回读落地页地址和标题。不循环搜索或反复点击，遇验证由用户处理，不承诺规避检测。不得直接导航官网冒充搜索点击；步骤见 [搜索演示](references/webbridge.md#百度搜索并打开官网)。

网页负载、上传下载和收尾示例见 [WebBridge 任务](references/webbridge.md)。没有命令需要把 Bridge Token 传到命令行：脚本从本机 `~/.easy-webbridge/bridge-token` 或用户已有环境变量读取，不输出 Token。

## 排障与结束

按 [排障表](references/troubleshooting.md)区分下载安装、登录、环境启动、扩展连接和网站操作问题，修复后回到失败步骤重测。实测中的问题记录复现步骤、实际结果、处理方式、复测证据及剩余限制；不能用“已记录”代替“已通过”。必须修改产品代码才能解决时明确报告阻塞，本 Skill 不擅自改 Electron 或后端。

用户明确授权的完整任务覆盖必要的任务内操作；不逐按钮重复确认。仅当目标/范围不清、超出授权或遇到必须由用户完成的验证时暂停。账号密码和邮箱验证码不存储、不写入命令参数、配置、教程、截图或日志；不声明自动读取用户邮箱。第三方网站的登录、图形 CAPTCHA 和平台限制仍需按其实际要求处理。

官网帮助：[Mac 对话使用教程](https://www.ebrower.com/helperdoc/ai-browser-mac.html)、[Local API](https://www.ebrower.com/helperdoc/apidoc.html)、[Easy WebBridge](https://www.ebrower.com/helperdoc/easy-webbridge.html)。
