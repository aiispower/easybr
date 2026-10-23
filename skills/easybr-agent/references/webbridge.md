# 通过现有 Easy WebBridge 协议执行网页任务

本 Skill 的 `bridge-command` 是本地 HTTP 客户端，不实现页面执行。它读取本机 Token，以现有 `POST /v1/browsers/{browserId}/commands` 发送 `{action,args,timeoutMs}`；执行端仍是 EasyBR 内置 Bridge 和扩展。先用 `bridge-list` 精确核对 `easybr-<环境ID>`。服务未就绪时启动 EasyBR，不运行第二个 Bridge。

命令形式：

```bash
node scripts/easybr.mjs bridge-command --browser-id '<准确browserId>' --action '<动作>' --args-file '/本地私有目录/本次负载.json'
```

文件中的 JSON 就是该动作的 `args`。账号密码和邮箱验证码不得写进命令行或负载文件。其他含私密内容的负载文件以仅当前用户可读方式保存，任务后清理。快照等结果也可能包含登录页面内容，不公开原始响应。

## 百度搜索并打开官网

按正常人工节奏执行一次搜索，等待结果、读取辨认官网，再点击一次；不循环搜索、不刷量或反复点击，不增加反检测行为或承诺规避检测。出现验证时停止对应操作，由用户处理后再继续。

1. 通过 `bridge-list` 精确核对目标 `easybr-<环境ID>`，在该环境确认默认内置 Easy WebBridge 已加载并连接；需要时读取实际扩展身份和能力。内置扩展正常时不重复安装。
2. 创建本次唯一任务组，导航到 `https://www.baidu.com`；读取当前快照，定位实际搜索框，填写 `easybr` 并用页面搜索按钮或已支持的按键操作发起搜索。
3. 等待搜索结果，刷新快照，按结果中展示的官网域名 `www.ebrower.com` 和标题定位真实官网链接。搜索引擎可能使用跳转链接；从结果页真实点击该链接，不能用直接导航官网替代。
4. 点击后检查当前标签及本次产生的新标签，回读最终地址和页面标题，确认落在 `www.ebrower.com` 官网。没有匹配结果、跳转异常或出现验证时按实际页面报告，不伪造成功。
5. 后续步骤复用同一任务组；搜索点击产生的新页只按本次任务所有权管理，保留用户原有标签。结束或失败时关闭本任务标签组并回读清理结果。

## 动作负载示例

下列 `123` 是示例，必须替换为本次导航返回的 `tabId`。

| 动作 | args |
| --- | --- |
| `capabilities` | `{}` |
| `navigate` 首次打开 | `{"url":"https://www.example.com","newTab":true,"session":"easybr-agent-唯一运行号","groupTitle":"任务名称"}` |
| `navigate` 顺序复用 | `{"url":"https://www.example.com/next","session":"easybr-agent-唯一运行号"}` |
| `snapshot` | `{"tabId":123,"compact":true,"region":"viewport","maxElements":40}` |
| `click` | `{"tabId":123,"selector":"@e2"}` |
| `fill` | `{"tabId":123,"selector":"@e3","value":"本次指定内容"}` |
| `wait_for` | `{"tabId":123,"selector":"[role=dialog]","state":"visible","timeoutMs":10000}` |
| `screenshot` | `{"tabId":123,"path":"/绝对输出路径/结果.png"}` |
| `upload` | `{"tabId":123,"selector":"input[type=file]","files":["/绝对本地路径/测试文件.txt"]}` |
| `download` | `{"url":"https://实际网址/测试文件","saveAs":false}` |
| `close_session` | `{"session":"easybr-agent-唯一运行号"}` |

截图返回本地文件后实际查看；上传返回文件选中数量后，还须等待网站确认上传完成。下载后检查浏览器记录、实际文件及内容。文件实际下载目录以浏览器设置为准，不能把下载动作回执当作文件已落盘。

需要原生上传按钮时，先核对实际扩展 `capabilities`，支持 chooser 模式才传 `triggerSelector` 与绝对 `files`，不要事先点击按钮。iframe 内操作先 `list_frames`，快照及后续操作使用同一 `frameId`；跨域帧可能无法注入，不能宣称通用支持。

普通网页任务先读再操作，不擅自改指纹、代理、时区和账号设置。实际安装包的扩展可能未声明 `backgroundExecution`，缺少该字段时只记为能力未知，不能声称已验证后台策略；仍使用明确 tabId，普通步骤不主动激活或聚焦。导航后刷新快照；写操作结果未知时只读查询状态，不重复上传或提交。任务在成功和失败两条路径都以 `close_session` 关闭本次拥有的标签组，不能关用户借用的标签或其他任务页。

官方完整协议和扩展安装：[Easy WebBridge](https://github.com/xxjrq/easy-webbridge)、[官网连接说明](https://www.ebrower.com/helperdoc/easy-webbridge.html)。EasyBR 1.7.8 及以后通常已内置扩展；实际以目标环境在线和能力回执为准。需要手动加载时在目标环境 `chrome://extensions` 打开开发者模式，加载官方仓库的 `extension/` 目录，不覆盖或清空 profile。
