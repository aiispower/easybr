# EasyBR Skill 验证

从本仓库根目录执行：

```bash
node --test skill-tests/easybr-agent.test.mjs
node skill-tests/package-skill.mjs '/本次输出目录/easybr-agent.zip'
```

测试使用模拟的 HTTP 契约，不连接或修改真实 EasyBR 环境。覆盖新旧 status 兼容、已登录用户名白名单、退出或未知状态不带旧用户名、准确环境选择、环境数据摘要、业务失败、超时不重试、固定 Mac 新建默认值、Bridge 身份与鉴权、客户端关闭边界、下载内容校验和独立目录安装；另以本机临时 HTTP 服务验证真实符号链接入口的 CLI JSON 输出。打包命令只包含 Skill 文件夹，输出大小与 SHA256；不包含测试文件或安装包。

本测试不代表客户端下载、签名、安装、登录或真实网站链路已经通过。实际结果以官网教程对应的验收记录为准。
