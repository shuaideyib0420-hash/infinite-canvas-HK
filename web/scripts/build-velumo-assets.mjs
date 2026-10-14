import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "..");
const publicDir = resolve(web, "public");
await mkdir(resolve(publicDir, "plugins"), { recursive: true });
await cp(resolve(root, "plugins/canvas/registry/dist"), resolve(publicDir, "plugins"), { recursive: true });
for (const name of ["VERSION", "CHANGELOG.md"]) await cp(resolve(root, name), resolve(publicDir, name));
await mkdir(resolve(publicDir, "licenses"), { recursive: true });
await cp(resolve(root, "LICENSE"), resolve(publicDir, "licenses/infinite-canvas-MIT.txt"));

const chapters = [
    ["features", "功能介绍", "overview/features.zh-CN.mdx"],
    ["canvas-node-manual", "节点操作", "canvas/canvas-node-manual.zh-CN.mdx"],
    ["canvas-shortcuts", "快捷键", "canvas/canvas-shortcuts.zh-CN.mdx"],
    ["codex-app-plugin", "官方插件", "overview/codex-app-plugin.zh-CN.mdx"],
    ["local-codex-canvas", "Agent 与 MCP", "development/local-codex-canvas.zh-CN.mdx"],
];
const navigation = '<a href="/">返回画布</a> · <a href="/help/">使用帮助</a> · ' + chapters.map(([slug, title]) => '<a href="' + slug + '.html">' + title + '</a>').join(" · ");
const style = "body{margin:auto;max-width:1000px;padding:24px;font:16px/1.75 system-ui;color:#292524;background:#fafaf9}nav{padding:12px 0;border-bottom:1px solid #ddd}a{color:#0369a1}main{padding:20px 0}pre{overflow:auto;padding:16px;background:#eee;border-radius:8px;white-space:pre-wrap}code{overflow-wrap:anywhere}table{border-collapse:collapse;display:block;overflow:auto}td,th{padding:8px;border:1px solid #ddd}img{max-width:100%}footer{font-size:13px;color:#57534e}@media(prefers-color-scheme:dark){body{color:#e7e5e4;background:#1c1917}a{color:#7dd3fc}pre{background:#292524}footer{color:#a8a29e}}";
function page(title, html) {
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' · Velumo 画布</title><style>' + style + '</style></head><body><nav>' + navigation + '</nav><main>' + html + '</main><footer>基于 Infinite Canvas · Copyright © 2026 basketikun · <a href="/licenses/infinite-canvas-MIT.txt">MIT License</a></footer></body></html>';
}
const intro = '<h1>Velumo 画布使用帮助</h1><p>从本站入口打开画布，在设置的渠道页填写自己的 Velumo API Key，查询并选择有权限的模型，再创建画布或导入作品。可按模型选择 OpenAI 兼容或 Gemini 原生协议。</p><p>Key 默认仅本次页面会话使用；勾选“记住”才保存在此浏览器。作品、素材和历史主要保存在当前浏览器，请定期导出；配置导出排除 Key 和 WebDAV 密码。跨设备可用导入导出或自己的 WebDAV。</p><h2>Windows 本地 Agent</h2><ol><li>安装 Node.js 官方受支持的 LTS 版本（包含 npm/npx）。</li><li>下载 <a href="/agent/start-agent.ps1" download>本站启动脚本</a>，在 PowerShell 运行。脚本会要求输入自己的本站 Key 和可用的文本模型 ID，不使用开发者凭据。</li><li>保留终端运行，在网页 Agent 面板填入终端显示的 Local URL 和 Connect token。每台电脑连接自己的本机服务。</li><li>在侧栏对话创建或修改节点；画布修改按官方流程确认。关闭终端后服务退出，再运行脚本即可重新连接。</li></ol><p>若 Windows 阻止下载脚本运行，可在检查脚本内容后仅对本次进程执行：</p><pre>powershell.exe -NoProfile -ExecutionPolicy Bypass -File &quot;$env:USERPROFILE\\Downloads\\start-agent.ps1&quot;</pre><p>启动脚本使用独立的本站 Codex 配置目录，Key 只传给本次进程；不覆盖已有 Codex 登录或全局 MCP。网页模型 Key、Agent Connect token、本地 Codex 模型配置是三个不同对象。浏览器询问本地网络许可时，允许本站访问自己的 Agent。</p><h2>插件、脚本与同步</h2><p>画布插件管理提供官方 Markdown、SVG、HTML、3D 全景、便利贴节点。也可安装自己信任的插件；渠道模型的“调用脚本”可使用官方模板适配请求。第三方代码按官方方式在页面运行，请只使用自己信任的代码。</p><p>设置内保留本地代理、WebDAV、自定义提示词源、主题与语言。代理在自己的电脑运行；WebDAV由用户自行提供。手机和平板可用基础画布，本次本地 Agent 方式不提供免安装的云端 Agent。</p><h2>用量与问题处理</h2><p>Key 名称、分组及参考价可在渠道页手动查询；最终费用以本站控制台用量为准。超时、取消或断线可能已计费，请先核对用量再决定是否重试。图片已生成而保存失败时，重新保存已有结果，无需重新生成。</p><p>Windows为首发验收目标；macOS/Linux功能保留，实机验证状态另列。模型可用参数和权限以本站实际配置与验收清单为准。</p><h2>详细手册</h2><ul>' + chapters.map(([slug, title]) => '<li><a href="' + slug + '.html">' + title + '</a></li>').join("") + '</ul><p><a href="https://api.htvelumo.com/docs/#images">本站 API 接入文档</a></p>';
await mkdir(resolve(publicDir, "help"), { recursive: true });
await writeFile(resolve(publicDir, "help/index.html"), page("使用帮助", intro));
for (const [slug, title, source] of chapters) {
    let content = await readFile(resolve(root, "docs/content/docs", source), "utf8");
    content = content.replace(/^---[\s\S]*?---\r?\n/, "")
        .replaceAll("https://github.com/basketikun/infinite-canvas", "https://github.com/shuaideyib0420-hash/infinite-canvas-HK")
        .replaceAll("git@github.com:basketikun/infinite-canvas.git", "https://github.com/shuaideyib0420-hash/infinite-canvas-HK.git")
        .replaceAll("https://canvas.best", "https://canvas.htvelumo.com")
        .replaceAll("@basketikun/canvas-agent@latest", "@basketikun/canvas-agent@0.6.0")
        .replace(/\]\(\/docs\/([^)]*)\)/g, (_match, target) => {
            const selected = chapters.find((entry) => target.includes(entry[0]));
            return "](" + (selected ? selected[0] + ".html" : "index.html") + ")";
        });
    const note = '<p><strong>本站说明：</strong>下文复用官方功能手册。本站模型请求使用个人 Velumo Key；网页的 Key 不会自动配置本地 Codex。Windows首次使用 Agent 请先按<a href="index.html">本站启动步骤</a>配置独立凭据。</p>';
    const html = renderToStaticMarkup(createElement(Streamdown, { mode: "static", controls: false }, content));
    await writeFile(resolve(publicDir, "help", slug + ".html"), page(title, note + html));
}
console.log("Velumo assets: five official plugins, full manual chapters, release files and MIT license");
