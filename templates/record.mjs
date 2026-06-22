// 录制各章操作视频 + 渲染标题卡（node record.mjs）
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { chapters } from "./narration.mjs";

const BASE = process.env.DEMO_BASE || "http://localhost:5173"; // 你的产品地址
const durations = JSON.parse(readFileSync("out/durations.json", "utf8"));
mkdirSync("out/raw", { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 注入演示光标（系统光标录不进画面）
async function installCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("vc")) return;
    const c = document.createElement("div");
    c.id = "vc";
    c.style.cssText = `position:fixed;left:960px;top:540px;width:26px;height:26px;z-index:999999;
      pointer-events:none;border-radius:50%;border:2.5px solid rgba(255,255,255,.95);
      background:rgba(45,212,191,.35);box-shadow:0 0 18px rgba(45,212,191,.8),0 2px 6px rgba(0,0,0,.5);
      transform:translate(-50%,-50%)`;
    document.body.appendChild(c);
    // 页面内 rAF 补间：60fps 平滑移动（外部步进会卡顿）
    window.__vcGlide = (x, y, ms) =>
      new Promise(done => {
        const sx = parseFloat(c.style.left), sy = parseFloat(c.style.top);
        const t0 = performance.now();
        const step = now => {
          const t = Math.min(1, (now - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          c.style.left = sx + (x - sx) * e + "px";
          c.style.top = sy + (y - sy) * e + "px";
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    window.__vcRipple = (x, y) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:14px;height:14px;z-index:999998;
        pointer-events:none;border-radius:50%;border:2px solid rgba(45,212,191,.9);
        transform:translate(-50%,-50%);transition:all .55s ease-out`;
      document.body.appendChild(r);
      requestAnimationFrame(() => {
        r.style.width = "74px";
        r.style.height = "74px";
        r.style.opacity = "0";
      });
      setTimeout(() => r.remove(), 600);
    };
  });
}

let cx = 960, cy = 540;
async function glide(page, x, y, ms = 700) {
  // 视觉光标由页面内 rAF 补间（60fps），真实指针仅同步少量步以维持 hover
  const tween = page.evaluate(([a, b, d]) => window.__vcGlide(a, b, d), [x, y, ms]);
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cx + ((x - cx) * i) / steps, cy + ((y - cy) * i) / steps);
    await sleep(ms / steps);
  }
  await tween;
  cx = x; cy = y;
}

async function clickAt(page, x, y, ms = 700) {
  await glide(page, x, y, ms);
  await page.evaluate(([a, b]) => window.__vcRipple(a, b), [x, y]);
  await sleep(120);
  await page.mouse.click(x, y);
}

async function glideToSel(page, selector, ms = 700, click = true) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box: ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (click) await clickAt(page, x, y, ms);
  else await glide(page, x, y, ms);
}

async function smoothScroll(page, to, ms = 1400) {
  await page.evaluate(([t]) => window.scrollTo({ top: t, behavior: "smooth" }), [to]);
  await sleep(ms);
}

// ===== 各章动作（示例：替换为你的产品操作；选择器按你的 DOM 调整）=====
const actions = {
  async overview(page) {
    await sleep(3000); // 等首屏入场动画
    await smoothScroll(page, 700, 1600);
    await sleep(2000);
    await smoothScroll(page, 1400, 1600);
    await sleep(2400);
  },

  async agent(page, mark) {
    await sleep(1500);
    await glideToSel(page, ".btn-open-chat", 900);   // 打开你的对话入口
    await sleep(1000);
    await glideToSel(page, ".prompt-chip", 900);     // 点一个预设问题
    await sleep(3000);
    mark("cuFrom");                                  // 特写锚点：回答就位
    await sleep(4000);
  }
};

const startUrl = {
  // 每个录屏章节的起始地址（深链参数能大幅简化动作脚本）
  overview: `${BASE}/`,
  agent: `${BASE}/`
};

// ===== 标题卡渲染 =====
async function renderCard(browser, ch) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const [l1, l2] = ch.title.split("\n");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1920px;height:1080px;display:grid;place-items:center;background:#05070c;
      font-family:"PingFang SC";overflow:hidden;position:relative}
    .b{position:absolute;border-radius:50%;filter:blur(110px);opacity:.5}
    .b1{width:900px;height:900px;left:-220px;top:-320px;background:radial-gradient(circle,rgba(45,212,191,.5),transparent 65%)}
    .b2{width:780px;height:780px;right:-180px;bottom:-260px;background:radial-gradient(circle,rgba(122,162,255,.42),transparent 65%)}
    .wrap{text-align:center;position:relative}
    .logo{font-weight:900;font-size:30px;letter-spacing:.5em;color:#2dd4bf;margin-bottom:46px;font-family:ui-monospace}
    h1{margin:0;font-size:108px;line-height:1.22;font-weight:850;letter-spacing:.02em;
      background:linear-gradient(120deg,#fff 30%,rgba(255,255,255,.5));-webkit-background-clip:text;
      -webkit-text-fill-color:transparent}
    p{margin:42px 0 0;font-size:30px;color:#74808d;letter-spacing:.14em}
  </style></head><body>
    <i class="b b1"></i><i class="b b2"></i>
    <div class="wrap"><div class="logo">FOTILE · REGION OPS</div>
    <h1>${l1}${l2 ? "<br>" + l2 : ""}</h1><p>${ch.subtitle}</p></div>
  </body></html>`);
  await sleep(400);
  await page.screenshot({ path: `out/card-${ch.id}.png` });
  await page.close();
  console.log(`card-${ch.id}.png`);
}

// ===== 主流程 =====
const browser = await chromium.launch();
const allMarks = {};

for (const ch of chapters.filter(c => c.type === "card")) {
  await renderCard(browser, ch);
}

for (const ch of chapters.filter(c => c.type === "record")) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: "out/raw", size: { width: 1920, height: 1080 } }
  });
  // 如有访问鉴权，在此注入 cookie：
  // await context.addCookies([{ name: "ck", value: "your-code", url: BASE }]);
  const page = await context.newPage();
  const t0 = Date.now(); // ≈ 录像零点
  const chMarks = {};
  const mark = key => (chMarks[key] = +((Date.now() - t0) / 1000).toFixed(2));
  await page.goto(startUrl[ch.id], { waitUntil: "networkidle", timeout: 60000 });
  await installCursor(page);
  cx = 960; cy = 540;
  await sleep(300);
  mark("ready"); // 应用已渲染：build 从这里裁切，去掉开头白屏加载，并对齐旁白
  try {
    await actions[ch.id](page, mark);
  } catch (err) {
    console.error(`${ch.id} action error:`, err.message);
  }
  allMarks[ch.id] = chMarks;
  // 录满：就绪时刻 + 该章成片时长(dur = narr + lead0.4 + 1.1) + 1.0s 缓冲，保证 build 裁切不越界
  const needS = chMarks.ready + durations[ch.id] + 1.5 + 1.0;
  const remain = needS * 1000 - (Date.now() - t0);
  if (remain > 0) await sleep(remain);
  const video = page.video();
  await context.close();
  const path = await video.path();
  renameSync(path, `out/raw/${ch.id}.webm`);
  console.log(`${ch.id}.webm recorded (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

await browser.close();
writeFileSync("out/marks.json", JSON.stringify(allMarks, null, 1));
console.log("marks:", JSON.stringify(allMarks));
console.log("record done:", readdirSync("out/raw").join(", "));
