// 合成成片 v2（node build.mjs）
// 防抖：4K 超采样后 zoompan；特写：三明治剪辑；字幕：ASS 烧录；BGM：120BPM 科技氛围
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { chapters } from "./narration.mjs";

const durations = JSON.parse(readFileSync("out/durations.json", "utf8"));
const run = cmd => execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });

const FPS = 30;
// 慢推（4K 超采样消除亚像素抖动）
const PUSH = `scale=3840:2160,zoompan=z='min(1+0.00050*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=${FPS}:s=1920x1080`;

// 定点放大特写：时间锚点来自录制时的 marks.json（消除页面加载时长漂移）
const marks = JSON.parse(readFileSync("out/marks.json", "utf8"));
const closeupZone = {
  agent: { x: 950, y: 240, w: 960, h: 540 },   // 智能体数据卡
  ingest: { x: 470, y: 110, w: 960, h: 540 }   // 解析卡口径提问
};
const readyAt = (id) => marks[id]?.ready || 0; // 每章应用就绪时刻（裁掉开头白屏加载）
const closeups = {};
for (const [id, zone] of Object.entries(closeupZone)) {
  const at = marks[id]?.cuFrom;
  const rd = readyAt(id);
  if (at) closeups[id] = { from: +(at - rd + 0.4).toFixed(2), to: +(at - rd + 4.0).toFixed(2), ...zone };
}

const segs = [];
const subEvents = [];
let offset = 0;


for (const ch of chapters) {
  const narr = durations[ch.id];
  const lead = ch.type === "card" ? 0.6 : 0.4; // 旁白起始偏移（adelay）
  const dur = +(narr + lead + 1.1).toFixed(2);
  const outSeg = `out/seg-${ch.id}.mp4`;
  const vfade = `fade=t=in:st=0:d=0.45,fade=t=out:st=${(dur - 0.45).toFixed(2)}:d=0.45`;
  const aud = `[1:a]adelay=${lead * 1000}|${lead * 1000},apad,aresample=48000,pan=stereo|c0=c0|c1=c0[a]`;

  if (ch.type === "card") {
    run(
      `ffmpeg -y -v error -loop 1 -t ${dur} -i out/card-${ch.id}.png -i out/narr-${ch.id}.mp3 ` +
      `-filter_complex "[0:v]fps=${FPS},${PUSH},${vfade},format=yuv420p[v];${aud}" ` +
      `-map "[v]" -map "[a]" -t ${dur} -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 192k ${outSeg}`
    );
  } else {
    const cu = closeups[ch.id];
    const rd = readyAt(ch.id); // 从应用就绪处裁切，去掉开头白屏加载（并对齐旁白）
    const trimHead = `trim=${rd.toFixed(2)}:${(rd + dur).toFixed(2)},setpts=PTS-STARTPTS`;
    let vchain;
    if (cu) {
      // 三明治：正常 → 定点放大 → 正常（各段独立慢推）；先裁掉白屏
      vchain =
        `[0:v]${trimHead},fps=${FPS},scale=1920:1080,split=3[s0][s1][s2];` +
        `[s0]trim=0:${cu.from},setpts=PTS-STARTPTS,${PUSH}[p0];` +
        `[s1]trim=${cu.from}:${cu.to},setpts=PTS-STARTPTS,crop=${cu.w}:${cu.h}:${cu.x}:${cu.y},${PUSH}[p1];` +
        `[s2]trim=${cu.to},setpts=PTS-STARTPTS,${PUSH}[p2];` +
        `[p0][p1][p2]concat=n=3:v=1:a=0,${vfade},format=yuv420p[v]`;
    } else {
      vchain = `[0:v]${trimHead},fps=${FPS},${PUSH},${vfade},format=yuv420p[v]`;
    }
    run(
      `ffmpeg -y -v error -i out/raw/${ch.id}.webm -i out/narr-${ch.id}.mp3 ` +
      `-filter_complex "${vchain};${aud}" ` +
      `-map "[v]" -map "[a]" -t ${dur} -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 192k ${outSeg}`
    );
  }

  // 字幕：全程覆盖本章（按字数比例铺满 [offset, offset+dur]，首末贴合章节边界，句间无空档）
  const totalChars = ch.subs.reduce((s, x) => s + x.length, 0);
  let acc = offset;
  ch.subs.forEach((line, idx) => {
    const d = (dur * line.length) / totalChars;
    const start = acc;
    acc += d;
    const end = idx === ch.subs.length - 1 ? offset + dur : acc;
    subEvents.push({ text: line, start: +start.toFixed(2), end: +end.toFixed(2) });
  });

  segs.push(outSeg);
  offset += dur;
  console.log(`seg-${ch.id}.mp4  ${dur}s${closeups[ch.id] ? "  [特写]" : ""}`);
}

// 字幕渲染为透明 PNG（本机 ffmpeg 无 libass/drawtext，用 overlay 烧录，样式反而更精致）
mkdirSync("out/subs", { recursive: true });
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 120 } });
  for (let i = 0; i < subEvents.length; i++) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;width:1920px;height:120px;display:grid;place-items:center;background:transparent;overflow:hidden}
      .cap{font:600 40px/1 "PingFang SC";color:rgba(255,255,255,.96);letter-spacing:.06em;
        background:rgba(5,9,14,.55);border:1px solid rgba(255,255,255,.10);
        padding:20px 44px;border-radius:999px;backdrop-filter:blur(6px);
        text-shadow:0 2px 10px rgba(0,0,0,.6)}
    </style></head><body><div class="cap">${subEvents[i].text}</div></body></html>`);
    await page.screenshot({ path: `out/subs/sub-${i}.png`, omitBackground: true });
  }
  await browser.close();
  console.log(`subs: ${subEvents.length} 句字幕已渲染`);
}

writeFileSync("out/concat.txt", segs.map(s => `file '${s.replace("out/", "")}'`).join("\n"));
run(`ffmpeg -y -v error -f concat -safe 0 -i out/concat.txt -c copy out/full.mp4`);
console.log(`full.mp4  ${offset.toFixed(1)}s`);

// BGM v2：A 调 drone + 合成底鼓(120BPM) + 反拍 hi-hat + 高音脉冲
const T = Math.ceil(offset + 1);
run(
  `ffmpeg -y -v error ` +
  `-f lavfi -i "sine=f=110:d=${T}" -f lavfi -i "sine=f=164.81:d=${T}" -f lavfi -i "sine=f=220:d=${T}" ` +
  `-f lavfi -i "aevalsrc='0.85*exp(-16*mod(t,0.5))*sin(2*PI*(48+120*exp(-30*mod(t,0.5)))*mod(t,0.5))':s=48000:d=${T}" ` +
  `-f lavfi -i "aevalsrc='0.09*exp(-90*mod(t+0.25,0.5))*(random(0)*2-1)':s=48000:d=${T}" ` +
  `-f lavfi -i "aevalsrc='0.15*pow(0.5+0.5*sin(2*PI*4*t-PI/2),14)*sin(2*PI*880*t)':s=48000:d=${T}" ` +
  `-filter_complex "` +
  `[0]volume=0.5[d1];[1]volume=0.26[d2];[2]volume=0.3[d3];` +
  `[d1][d2][d3]amix=inputs=3:normalize=0,tremolo=f=0.12:d=0.4,lowpass=f=900[pad];` +
  `[3]lowpass=f=160,volume=0.9[kick];` +
  `[4]highpass=f=6000,volume=0.8[hat];` +
  `[5]aecho=0.6:0.45:250:0.35,highpass=f=500,volume=0.7[plk];` +
  `[pad][kick][hat][plk]amix=inputs=4:normalize=0,volume=0.55,` +
  `afade=t=in:d=2.5,afade=t=out:st=${T - 5}:d=5" out/bgm.wav`
);
console.log("bgm.wav (120BPM tech ambient)");

// 终混：字幕 overlay 烧录 + BGM 人声闪避
{
  // -loop 1：每张字幕图作为连续流。单帧图（不循环）在链式 overlay 下只有前几张能显示 →
  // 字幕中途消失的根因。配合终混的 -shortest 由 full.mp4 决定总长。
  const subInputs = subEvents.map((_, i) => `-loop 1 -i out/subs/sub-${i}.png`).join(" ");
  let chain = "";
  let prev = "0:v";
  subEvents.forEach((e, i) => {
    const out = i === subEvents.length - 1 ? "v" : `t${i}`;
    chain += `[${prev}][${i + 2}:v]overlay=(W-w)/2:H-h-46:enable='between(t,${e.start},${e.end})'[${out}];`;
    prev = out;
  });
  run(
    `ffmpeg -y -v error -i out/full.mp4 -i out/bgm.wav ${subInputs} ` +
    `-filter_complex "${chain}` +
    `[1:a][0:a]sidechaincompress=threshold=0.02:ratio=10:attack=60:release=800:makeup=1[duck];` +
    `[0:a][duck]amix=inputs=2:normalize=0:weights='1 0.45',alimiter=limit=0.95[mix]" ` +
    `-map "[v]" -map "[mix]" -shortest -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 192k out/final.mp4`
  );
}
console.log(`✓ out/final.mp4 (${offset.toFixed(1)}s, 字幕+特写+节奏BGM)`);
