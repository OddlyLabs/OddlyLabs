// Generates the self-hosted SVGs used by the profile README:
//   assets/header.svg                 animated banner (no network needed)
//   assets/cards/<repo>[.zh].svg      featured project cards
//   assets/overview[.zh].svg          stats + language breakdown
// Usage: GITHUB_TOKEN=... node scripts/build.mjs   (token is required for GraphQL)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Follows the account automatically in Actions, so a future rename needs no edit here.
const LOGIN = process.env.GITHUB_REPOSITORY_OWNER || "OddlyLabs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");

// Keep in sync with the card grid in README.md / README.en.md.
const FEATURED = [
  { group: "ai", repo: "FreeBuff2API", zh: "本地优先的 OpenAI / Anthropic 兼容 FreeBuff 网关，附 Windows 一键启动器。", en: "Local-first OpenAI & Anthropic compatible FreeBuff gateway with a one-click Windows launcher." },
  { group: "ai", repo: "codex-longwatch", zh: "原生桌面守护程序，在过载、断线、重启和长时间等待中让 Codex 任务持续推进。", en: "Native desktop companion that keeps Codex tasks moving through overloads, disconnects and long waits." },
  { group: "ai", repo: "CodexPanel", zh: "Codex 本地 Tauri 桌面控制面板，附远程浏览器桥接。", en: "Local Tauri control panel for Codex, with a remote browser bridge." },
  { group: "ai", repo: "Codex-Desktop-Linux", zh: "全自动构建 Codex Desktop 的 Linux Debian 安装包。", en: "Automation-only builder for Codex Desktop Linux Debian packages." },
  { group: "desktop", repo: "CF-BEST", zh: "Cloudflare 优选 IP 桌面工作台：扫描、测速、可用性验证与每日自动优选。", en: "Cloudflare IP desktop workbench: scan, speed-test, verify and auto-pick the best IPs daily." },
  { group: "desktop", repo: "TDesign-GPUI", zh: "用 Rust 在 GPUI 上原生实现的 TDesign React PC 组件库。", en: "Native TDesign React PC components for GPUI, written in Rust." },
  { group: "desktop", repo: "QoderDesign", zh: "零构建 UI 设计系统：设计令牌、9 套主题、30+ 组件、125 个图标。", en: "Zero-build UI design system: tokens, 9 themes, 30+ components and 125 icons." },
  { group: "desktop", repo: "lightpaper", zh: "安全轻量的 Tauri 壁纸管理器，支持本地图库与可扩展图源。", en: "Secure, lightweight Tauri wallpaper manager with local libraries and extensible sources." },
  { group: "device", repo: "FullCharge", zh: "Android 满电 / 目标电量提醒，支持通知、全屏提醒、夜间勿扰和自动更新。", en: "Android full-charge reminder with notifications, full-screen alerts, quiet hours and auto-update." },
  { group: "device", repo: "Teambox", zh: "怪团建：可扩展的开源团建工具箱，首个功能是腾讯视频举手 +1 自动识别点击。", en: "Open-source team-building toolbox for Android; starts with auto-detecting raise-hand +1 taps." },
  { group: "device", repo: "ClearFrame", zh: "优雅的 GNOME 透明度控制：Dock、顶栏与窗口。", en: "Elegant GNOME transparency controls for the Dock, top bar and windows." },
  { group: "device", repo: "gnome-topline", zh: "紧凑、模块化的 GNOME 顶栏系统状态条。", en: "A compact, modular system status line for the GNOME top bar." },
  { group: "web", repo: "DOUYIN_EMOJI", zh: "抖音表情批量下载。", en: "Bulk downloader for Douyin emoji stickers." },
  { group: "web", repo: "Feishu_Downloader", zh: "一键把飞书文档离线保存到本地。", en: "Save Feishu (Lark) docs for offline use in one click." },
  { group: "web", repo: "PixelSign", zh: "个性化签名生成工具。", en: "Generate personalised signature images." },
  { group: "web", repo: "CozyDo", zh: "LINUX DO 论坛主题管理插件。", en: "Theme manager extension for the LINUX DO forum." },
];

const GROUP_ACCENT = { ai: "#ffd166", desktop: "#5eead4", device: "#a78bfa", web: "#f9a8d4" };

const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC','PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif`;
const MONO = `'JetBrains Mono','Cascadia Code','SFMono-Regular',Consolas,Menlo,monospace`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rough glyph widths in em, good enough to wrap descriptions without a font engine.
function charWidth(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x2e80) return 1;
  if (ch === " ") return 0.28;
  if (/[A-Z0-9@#%&mwMW]/.test(ch)) return 0.64;
  if (/[il.,:;'!|]/.test(ch)) return 0.28;
  return 0.53;
}
const textWidth = (s, size) => [...s].reduce((w, ch) => w + charWidth(ch), 0) * size;

function wrap(text, size, maxWidth, maxLines) {
  // Break CJK anywhere, latin on spaces.
  const tokens = text.match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) ?? [];
  const lines = [];
  let line = "";
  for (const tok of tokens) {
    const next = line + tok;
    if (textWidth(next.trimEnd(), size) <= maxWidth || line === "") line = next;
    else {
      lines.push(line.trim());
      line = tok.trimStart();
    }
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    let last = lines[maxLines - 1];
    while (textWidth(last + "…", size) > maxWidth) last = [...last].slice(0, -1).join("");
    lines.splice(maxLines - 1, Infinity, last.trimEnd() + "…");
  }
  return lines;
}

// Deterministic PRNG so regenerating the header does not churn git diffs.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function headerSvg() {
  const W = 1200, H = 340;
  const rand = rng(42);
  const stars = Array.from({ length: 90 }, (_, i) => {
    const x = (rand() * W).toFixed(1), y = (rand() * H).toFixed(1);
    const r = (rand() * 1.2 + 0.3).toFixed(2);
    const d = (rand() * 6).toFixed(2), t = (rand() * 3 + 3).toFixed(2);
    return `<circle class="tw" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${d}s;animation-duration:${t}s"/>`;
  }).join("");

  const cx = 945, cy = 170;
  const orbits = [
    { rx: 92, ry: 30, dur: 9, r: 5, fill: "#5eead4" },
    { rx: 150, ry: 50, dur: 16, r: 7, fill: "#a78bfa" },
    { rx: 212, ry: 72, dur: 26, r: 9, fill: "#f9a8d4", ring: true },
  ];
  const ellipse = (o) => `M ${cx - o.rx} ${cy} a ${o.rx} ${o.ry} 0 1 0 ${o.rx * 2} 0 a ${o.rx} ${o.ry} 0 1 0 ${-o.rx * 2} 0`;
  const orbitSvg = orbits.map((o, i) => `
    <path d="${ellipse(o)}" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-dasharray="2 6"/>
    <g>
      <circle r="${o.r}" fill="${o.fill}" filter="url(#soft)"/>
      ${o.ring ? `<ellipse rx="${o.r + 7}" ry="3" fill="none" stroke="${o.fill}" stroke-opacity=".7" transform="rotate(-14)"/>` : ""}
      <animateMotion dur="${o.dur}s" repeatCount="indefinite" begin="-${(o.dur * (0.15 + i * 0.3)).toFixed(1)}s" path="${ellipse(o)}"/>
    </g>`).join("");

  const typed = "> local-first tools for AI agents, native desktops & the edge";
  const charW = 16 * 0.6;
  const typedW = Math.ceil(typed.length * charW);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="OddlyLabs — local-first tools for AI agents, native desktops and the edge">
  <style>
    .tw { fill: #fff; animation: tw 4s ease-in-out infinite; }
    @keyframes tw { 0%,100% { opacity: .15 } 50% { opacity: .9 } }
    .cursor { animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0 } }
    .glow { animation: pulse 5s ease-in-out infinite; transform-origin: ${cx}px ${cy}px; }
    @keyframes pulse { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.12); opacity: .85 } }
    @media (prefers-reduced-motion: reduce) { .tw, .cursor, .glow { animation: none } }
  </style>
  <defs>
    <radialGradient id="bg" cx="78%" cy="50%" r="85%">
      <stop offset="0%" stop-color="#141b33"/>
      <stop offset="55%" stop-color="#0a0f1f"/>
      <stop offset="100%" stop-color="#05070d"/>
    </radialGradient>
    <radialGradient id="sun" cx="40%" cy="36%" r="70%">
      <stop offset="0%" stop-color="#fff8d6"/>
      <stop offset="35%" stop-color="#ffd166"/>
      <stop offset="75%" stop-color="#f77f00"/>
      <stop offset="100%" stop-color="#7a2a05"/>
    </radialGradient>
    <radialGradient id="halo">
      <stop offset="0%" stop-color="#ffd166" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#ffd166" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="name" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff3c4"/>
      <stop offset="55%" stop-color="#ffd166"/>
      <stop offset="100%" stop-color="#f9a8d4"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation=".6"/></filter>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="22"/></clipPath>
    <clipPath id="type">
      <rect x="80" y="232" height="30" width="0">
        <animate attributeName="width" values="0;${typedW};${typedW};0" keyTimes="0;.45;.92;1" dur="9s" repeatCount="indefinite"/>
      </rect>
    </clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${stars}
    <circle class="glow" cx="${cx}" cy="${cy}" r="110" fill="url(#halo)"/>
    ${orbitSvg}
    <circle cx="${cx}" cy="${cy}" r="34" fill="url(#sun)"/>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".08"/>

  <text x="80" y="104" font-family="${MONO}" font-size="16" fill="#5eead4">~/oddlylabs <tspan fill="#7c86a2">$</tspan> <tspan fill="#c9d1e3">whoami</tspan></text>
  <text x="76" y="178" font-family="${SANS}" font-size="72" font-weight="800" letter-spacing="-1.5" fill="url(#name)">OddlyLabs</text>
  <text x="80" y="214" font-family="${SANS}" font-size="20" fill="#c9d1e3">做本地优先的小工具 · AI 智能体 · 原生桌面 · 边缘网络</text>
  <g clip-path="url(#type)">
    <text x="80" y="254" font-family="${MONO}" font-size="16" fill="#ffd166">${esc(typed)}</text>
  </g>
  <rect class="cursor" x="80" y="240" width="9" height="18" fill="#ffd166">
    <animate attributeName="x" values="80;${80 + typedW};${80 + typedW};80" keyTimes="0;.45;.92;1" dur="9s" repeatCount="indefinite"/>
  </rect>
</svg>
`;
}

const BOOK = "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z";
const STAR = "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z";

function cardSvg(item, repo, lang) {
  const W = 420, H = 132, accent = GROUP_ACCENT[item.group];
  const desc = wrap(item[lang], 13.5, W - 48, 2);
  const language = repo.primaryLanguage ?? { name: "Markdown", color: "#8b949e" };
  const langX = 24, starX = langX + 20 + textWidth(language.name, 12.5) + 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(item.repo)}: ${esc(item[lang])}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10172b"/>
      <stop offset="100%" stop-color="#090d18"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#bg)" stroke="#232c45"/>
  <rect x="24" y="0" width="${W * 0.55}" height="2" fill="url(#edge)"/>
  <path d="${BOOK}" transform="translate(24 22)" fill="${accent}"/>
  <text x="48" y="35" font-family="${SANS}" font-size="16.5" font-weight="700" fill="#eef2ff">${esc(item.repo)}</text>
  ${desc.map((l, i) => `<text x="24" y="${66 + i * 21}" font-family="${SANS}" font-size="13.5" fill="#9aa4bd">${esc(l)}</text>`).join("\n  ")}
  <circle cx="${langX + 6}" cy="${H - 22}" r="6" fill="${language.color ?? "#8b949e"}"/>
  <text x="${langX + 18}" y="${H - 18}" font-family="${SANS}" font-size="12.5" fill="#7c86a2">${esc(language.name)}</text>
  <path d="${STAR}" transform="translate(${starX} ${H - 30}) scale(.85)" fill="#7c86a2"/>
  <text x="${starX + 18}" y="${H - 18}" font-family="${SANS}" font-size="12.5" fill="#7c86a2">${repo.stargazerCount}</text>
</svg>
`;
}

function overviewSvg(stats, langs, lang) {
  const W = 860, H = 196;
  const L = lang === "zh"
    ? { title: "概览", repos: "原创仓库", stars: "获得 Star", followers: "关注者", contrib: "近一年贡献", langs: "常用语言 · 按代码量" }
    : { title: "Overview", repos: "Original repos", stars: "Stars earned", followers: "Followers", contrib: "Contributions (1y)", langs: "Languages by code size" };
  const items = [
    [L.repos, stats.repos, "#ffd166"],
    [L.stars, stats.stars, "#5eead4"],
    [L.followers, stats.followers, "#a78bfa"],
    [L.contrib, stats.contributions, "#f9a8d4"],
  ];
  const statSvg = items.map(([label, value, color], i) => {
    const x = 32 + (i % 2) * 170, y = 76 + Math.floor(i / 2) * 72;
    return `<text x="${x}" y="${y}" font-family="${SANS}" font-size="30" font-weight="800" fill="${color}">${value.toLocaleString("en-US")}</text>
  <text x="${x}" y="${y + 22}" font-family="${SANS}" font-size="13" fill="#7c86a2">${esc(label)}</text>`;
  }).join("\n  ");

  const barX = 400, barW = W - barX - 32, barY = 64;
  let x = barX;
  const segments = langs.map((l) => {
    const w = Math.max(l.share * barW, 2);
    const s = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="10" fill="${l.color}"/>`;
    x += w;
    return s;
  }).join("");
  const legend = langs.map((l, i) => {
    const lx = barX + (i % 3) * (barW / 3), ly = barY + 44 + Math.floor(i / 3) * 30;
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>
  <text x="${lx + 16}" y="${ly}" font-family="${SANS}" font-size="13" fill="#c9d1e3">${esc(l.name)} <tspan fill="#7c86a2">${(l.share * 100).toFixed(1)}%</tspan></text>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10172b"/>
      <stop offset="100%" stop-color="#090d18"/>
    </linearGradient>
    <clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="10" rx="5"/></clipPath>
  </defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="16" fill="url(#bg)" stroke="#232c45"/>
  <text x="32" y="36" font-family="${MONO}" font-size="13" fill="#5eead4">// ${esc(L.title.toLowerCase())}</text>
  <text x="${barX}" y="36" font-family="${MONO}" font-size="13" fill="#5eead4">// ${esc(L.langs)}</text>
  <line x1="368" y1="28" x2="368" y2="${H - 28}" stroke="#232c45"/>
  ${statSvg}
  <g clip-path="url(#bar)">${segments}</g>
  ${legend}
</svg>
`;
}

async function fetchProfile(token) {
  const query = `query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      contributionsCollection { contributionCalendar { totalContributions } }
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
        nodes {
          name stargazerCount
          primaryLanguage { name color }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": LOGIN },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user;
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function main() {
  await write(join(ASSETS, "header.svg"), headerSvg());

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("GITHUB_TOKEN not set: only the header was rebuilt.");
    return;
  }
  const user = await fetchProfile(token);
  const repos = new Map(user.repositories.nodes.map((r) => [r.name, r]));

  for (const item of FEATURED) {
    const repo = repos.get(item.repo);
    if (!repo) throw new Error(`Featured repo not found or not public: ${item.repo}`);
    await write(join(ASSETS, "cards", `${item.repo}.svg`), cardSvg(item, repo, "en"));
    await write(join(ASSETS, "cards", `${item.repo}.zh.svg`), cardSvg(item, repo, "zh"));
  }

  const bytes = new Map();
  for (const r of user.repositories.nodes) {
    for (const { size, node } of r.languages.edges) {
      const prev = bytes.get(node.name) ?? { name: node.name, color: node.color ?? "#8b949e", size: 0 };
      prev.size += size;
      bytes.set(node.name, prev);
    }
  }
  const total = [...bytes.values()].reduce((s, l) => s + l.size, 0) || 1;
  const sorted = [...bytes.values()].sort((a, b) => b.size - a.size);
  const top = sorted.slice(0, 5).map((l) => ({ ...l, share: l.size / total }));
  const rest = sorted.slice(5).reduce((s, l) => s + l.size, 0);
  if (rest) top.push({ name: "Other", color: "#4b5571", share: rest / total });

  const stats = {
    repos: user.repositories.nodes.length,
    stars: user.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    followers: user.followers.totalCount,
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
  };
  await write(join(ASSETS, "overview.svg"), overviewSvg(stats, top, "en"));
  await write(join(ASSETS, "overview.zh.svg"), overviewSvg(stats, top, "zh"));
  console.log(`Built header, ${FEATURED.length} cards x2 and overview`, stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
