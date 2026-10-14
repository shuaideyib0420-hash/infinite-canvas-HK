---
name: open-canvas
description: 打开 Infinite Canvas 在线或本地画布，并自动连接本地 Canvas Agent。用户要求打开、启动、进入或使用 Infinite Canvas 画布时使用。
---

# Open Infinite Canvas

默认打开 Velumo 在线版。只有用户明确要求使用本地项目时，才启动本地前端。首次使用本站 Agent 时，按 https://canvas.htvelumo.com/help/ 配置自己的本站 Key 和文本模型；Windows 使用该页的本站启动脚本，它以独立 Codex 配置启动官方 Agent，不覆盖现有登录或全局 MCP。

## 在线版

1. 优先复用按本站帮助配置、已经运行的本地 Canvas Agent。未运行时，Windows 使用本站 `start-agent.ps1`，填写用户本人的本站 Key 和文本模型；不要使用开发者凭据，也不要从未配置的默认 Codex 目录直接启动。macOS/Linux 需先用独立 `CODEX_HOME` 配置本站 Responses 提供商和进程内 `VELUMO_API_KEY`，再启动：

```bash
npx -y @basketikun/canvas-agent@0.6.0
```

2. 从启动输出取得 `Local URL` 和 `Connect token`。

3. 在 Codex 右侧浏览器打开：

```text
https://canvas.htvelumo.com/canvas?mode=new#agentUrl=<Local URL>&agentToken=<Connect token>
```

## 本地版

1. 在 Infinite Canvas 项目中启动前端，并使用 Vite 输出的 `Local` 地址：

```bash
cd web
bun install
bun run dev
```

2. 复用按本站帮助配置、已经运行的 Canvas Agent。未运行时按上面的本站独立凭据步骤启动，以下命令仅用于已经配置好的独立进程环境：

```bash
npx -y @basketikun/canvas-agent@0.6.0
```

3. 从启动输出取得 `Local URL` 和 `Connect token`，在 Codex 右侧浏览器打开：

```text
<Vite Local 地址>/canvas?mode=new#agentUrl=<Local URL>&agentToken=<Connect token>
```

## MCP 与连接地址

插件在新的 Codex 任务中加载时会自动启动 `npx -y @basketikun/canvas-agent@0.6.0 mcp`。这个 MCP 进程负责提供画布工具，不提供网页连接服务；
上面启动的普通 Canvas Agent 负责提供 `Local URL` 和 `Connect token`。两个进程读取同一份本地配置，因此不需要用户手动填写地址或 token。

## 打开模式

用户没有明确指定打开方式时，始终使用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`
