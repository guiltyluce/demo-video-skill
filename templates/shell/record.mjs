// 方案B录制器：壳页面 + iframe 连续单镜（配 shell.html 使用）
// 标题卡/字幕/光标/镜头层常驻壳层，换页永远被卡片盖住 → 零闪帧
// 慢推与定点特写为 CSS 镜头层实时录制 → 无需 zoompan/4K超采样/marks对位
//
// 定制点：BASE、narration.json（分镜+台词）、底部"动线"区的场景脚本
// 运行: node tts.mjs && node record.mjs && node assemble.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'file://' + resolve('..');              // TODO: 产品地址（file:// 或 http://，需可被 iframe 嵌入）
const SHELL_URL = 'file://' + resolve('shell.html');
const cfg = JSON.parse(readFileSync('narration.json', 'utf8'));
const durs = JSON.parse(readFileSync('tts/durations.json', 'utf8'));
const TEXT = {};
for (const sc of cfg.scenes) for (const ln of sc.lines) TEXT[ln.id] = ln.text;

const timeline = [];
let tStart = 0;
const now = () => (Date.now() - tStart) / 1000;

/* ---------- 标题卡模板（按品牌改两套配色即可） ---------- */
const INK = { t: '#17171B', dim: '#6F6F78', faint: '#A0A0A8', gold: '#A8852C' };
const DUSK = { t: '#EDEDEF', dim: '#9C9CA4', faint: '#5A5A60', gold: '#D4AF5A' };
const heroCard = (title, subtitle, dark = false) => {
  const C = dark ? DUSK : INK;
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:${C.t}">
    <div style="font-size:56px;font-weight:650;letter-spacing:10px;line-height:1.45;white-space:pre-line">${title}</div>
    <div style="width:56px;height:2px;background:linear-gradient(90deg,#2C4E92,#D4AF5A);margin:34px 0 26px"></div>
    <div style="font-size:17px;color:${C.dim};letter-spacing:6px">${subtitle}</div>
  </div>`;
};
const chapterCard = ([no, title, tag], dark = false) => {
  const C = dark ? DUSK : INK;
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${C.t}">
    <div style="font:600 15px 'Geist Mono',monospace;color:${C.gold};letter-spacing:8px;margin-bottom:22px">${no}</div>
    <div style="font-size:52px;font-weight:650;letter-spacing:10px">${title}</div>
    <div style="font-size:16px;color:${C.dim};letter-spacing:5px;margin-top:20px">${tag}</div>
  </div>`;
};

/* ---------- 浏览器 ---------- */
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: 'rec', size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto(SHELL_URL);
tStart = Date.now();

const sh = (expr, ...args) => page.evaluate(expr, ...args);
const fr = () => page.mainFrame().childFrames()[0];
const wait = ms => page.waitForTimeout(ms);

/* ---------- 光标 / 点击（页内 rAF 缓动：单次调用走完全程，负载免疫） ---------- */
let mx = 960, my = 540;
async function glide(x, y, ms = 850) {
  await sh(([a, b, d]) => SHELL.cursor(a, b, d), [x, y, ms]);
  await page.mouse.move(x, y);          // 真实事件进 iframe，驱动 hover
  mx = x; my = y;
}
async function glideTo(sel, ms = 850, click = false) {
  // 坑：locator.boundingBox() 会等"元素稳定"，页面无限CSS动画会让它干等数秒
  const box = await fr().evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!box) { console.warn('miss:', sel); return; }
  await glide(box.x, box.y, ms);
  if (click) {
    await wait(170);
    await sh(() => SHELL.clickFx());
    await page.mouse.down(); await wait(90); await page.mouse.up();
  }
}

/* ---------- 镜头 ---------- */
async function push(fx = 960, fy = 540, ms = 9000) {   // 慢推：仅用于无点击交互的台词段
  await sh(([x, y, d]) => SHELL.cam(1.042, x, y, d, 'linear'), [fx, fy, ms]);
}
async function pushReset(ms = 700) {
  await sh(([d]) => SHELL.cam(1, 960, 540, d), [ms]);
  await wait(ms + 50);
}
async function zoom(x, y, scale, holdMs) {              // 定点特写：期间隐藏光标、不交互
  await sh(() => SHELL.cursorShow(false));
  await sh(([a, b, s]) => SHELL.cam(s, a, b, 950), [x, y, scale]);
  await wait(950 + holdMs);
  await sh(() => SHELL.cam(1, 960, 540, 850));
  await wait(900);
  await sh(() => SHELL.cursorShow(true));
}

/* ---------- 台词（字幕+时间锚点；动作并行，时长对齐音频） ---------- */
async function speak(id, actions = async () => {}) {
  const t0 = Date.now();
  timeline.push({ id, t: +now().toFixed(2) });
  await sh(t => SHELL.sub(t), TEXT[id]);
  await actions();
  const remain = durs[id] * 1000 + 450 - (Date.now() - t0);
  if (remain > 0) await wait(remain);
}

/* ---------- 转场：卡片先盖严，再换页 ---------- */
async function go(url, chapter, { dark = false, holdMs = 1500 } = {}) {
  await sh(() => SHELL.subHide());
  await sh(([html, dk]) => SHELL.card(html, dk),
    [chapter ? chapterCard(chapter, dark) : '<div></div>', dark]);
  await wait(550);
  await sh(() => SHELL.cam(1, 960, 540, 0));
  await sh(u => SHELL.nav(u), url);
  await wait(chapter ? holdMs : 250);
  await sh(() => SHELL.cardHide(620));
  await wait(680);
  mx = 960; my = 540; await page.mouse.move(mx, my);
}

/* ================= 动线（TODO: 按产品重写，以下为骨架示例） ================= */
const S = cfg.scenes;

// 封面：卡片先上，nav 在卡片底下完成，旁白念完再揭开
await sh(([html]) => SHELL.card(html, false), [heroCard(cfg.cover.title, cfg.cover.subtitle)]);
await sh(u => SHELL.nav(u), `${BASE}/index.html`);
await wait(450);
await speak('l01');
await sh(() => SHELL.cardHide(700));
await wait(760);

// 章节示例：扫视(慢推) → 点击 → 特写 → 关闭
await go(`${BASE}/feature-a.html`, S[1].chapter);
await speak('l02', async () => {
  await push(960, 430, 10000);
  await glide(700, 400, 900);
  await glide(1300, 500, 1100);
});
await pushReset();
await speak('l03', async () => {
  await glideTo('.some-card', 900, true);
  await wait(700);
  await zoom(960, 470, 1.45, 1900);
  await glideTo('.modal .close', 650, true);
});

// 片尾落版
await speak('l04', async () => {
  await sh(([html]) => SHELL.card(html, false), [heroCard(cfg.outro.title, cfg.outro.subtitle)]);
});
await sh(() => SHELL.subHide());
await wait(1500);

/* ---------- 收尾 ---------- */
const total = now();
await ctx.close();
const video = await page.video().path();
writeFileSync('timeline.json', JSON.stringify({ total: +total.toFixed(2), video, lines: timeline }, null, 1));
console.log('done. total', total.toFixed(1) + 's, video:', video);
await browser.close();
