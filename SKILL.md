---
name: demo-video
description: 制作"苹果发布会风格"的 Web 产品演示视频：Playwright 驱动真实操作录屏（动画光标）+ Edge-TTS 中文配音 + ffmpeg 合成（标题卡、慢推镜头、定点放大特写、胶囊字幕、BGM 人声闪避）。当用户要求为网页产品制作演示视频、宣传片、带配音解说的功能展示视频时使用。
---

# 产品演示视频制作管线

## 先选架构（两套模板，二选一）

| | 方案A · 分章节段落式（`templates/`） | 方案B · 壳+iframe 连续单镜（`templates/shell/`） |
|---|---|---|
| 原理 | 每章独立录 webm，ffmpeg 拼接+zoompan特写+PNG字幕 | 录制壳持有标题卡/字幕/光标/镜头层，产品页在 iframe 里换 |
| 转场闪帧 | 黑场 fade 规避 | **物理上不可能闪**（换页永远发生在卡片底下） |
| 慢推/特写 | zoompan（要 4K 超采样，见坑#1） | CSS transform 镜头层**实时录进画面**，GPU 合成零抖动，免对位 |
| 字幕 | 透明 PNG overlay 烧录（见坑#4） | 壳层胶囊字幕直接录进画面，不依赖 libass |
| 适用限制 | 通用 | 产品页须可被 iframe 嵌入（file:// / 同源 / 无 X-Frame-Options） |
| 选型 | 章节需独立重录、页面禁 iframe | 标题卡多、特写多、要求转场严丝合缝 → **优先选B** |

方案B把方案A的坑 #1/#3/#4 在架构层面直接消灭，代价是 iframe 嵌入限制。

四件套（方案A在 `templates/`，方案B在 `templates/shell/`，复制到目标项目 `scripts/demo-video/` 后按下方"定制点"修改）：

```
narration.mjs  分镜：章节(卡片/录屏)、旁白文案、分句字幕、音色
tts.mjs        Edge-TTS 配音 + ffprobe 时长 → out/durations.json
record.mjs     Playwright 录屏 + 标题卡渲染 + 时间锚点 → out/raw/*.webm, marks.json
build.mjs      ffmpeg 合成 → out/final.mp4
（方案B: shell.html + record.mjs + assemble.mjs + make_bgm.py，时间锚点为 timeline.json）
```

执行顺序：`node tts.mjs && node record.mjs && node build.mjs`（顺序不可换：录制时长依赖旁白时长，合成依赖锚点）。

## 依赖检查（开工前必查）

```bash
which ffmpeg                              # 无则 brew install ffmpeg
pip3 show edge-tts || pip3 install --user edge-tts
npm ls playwright || npm i -D playwright && npx playwright install chromium
ffmpeg -hide_banner -filters | grep -E "drawtext|subtitles"   # 见坑#4
```

## 每个项目的定制点

1. **narration.mjs**：全部重写——章节结构（开场卡 → 3~4 个功能章 → 结尾卡）、旁白（苹果体：短句、讲价值不讲功能名、"每一个/即刻/尽收"句式）、subs 手工分句。音色：`zh-CN-XiaoxiaoNeural` 女声温暖 / `zh-CN-YunyangNeural` 男声新闻。旁白先和用户对稿再生产。
2. **record.mjs**：改 `BASE`、`startUrl`、`actions`（每章的操作脚本）。鉴权用 `context.addCookies`；深链参数（如 `?tab=x&q=问题`）能大幅简化动作脚本，必要时先给产品加深链。动作设计时长可略短于旁白——尾部 hold 机制自动兜底。需要特写的时刻调用 `mark("cuFrom")`。
3. **build.mjs**：改 `closeupZone`（特写裁切区域，源 1920×1080 坐标，裁切框保持 16:9 如 960×540）。其余通用。

## 坑库（每条都真实踩过，违反必翻车）

1. **zoompan 亚像素抖动**：直接在 1080p 上 zoompan 画面会持续抖。必须先 `scale=3840:2160` 超采样再 zoompan 输出 1080p（模板已含）。
2. **光标卡顿**：不要用 node 侧循环步进移动光标（25fps 阶梯感）。视觉光标用页面内 `requestAnimationFrame` 补间（`window.__vcGlide`），真实 mouse.move 只需 5 步维持 hover。
3. **页面加载漂移**：录像从 context 创建即开始，`goto` 的网络耗时（2~4s 且波动）会让所有动作时刻后移。**特写/对位时间窗绝不能写死**，必须用录制时的 `mark()` 锚点（写入 marks.json，build 读取）。
4. **ffmpeg 可能没有 subtitles/drawtext 滤镜**（homebrew 版常缺 libass）。字幕方案：Playwright 把每句渲染成 1920×120 透明 PNG（胶囊样式，`omitBackground: true`），ffmpeg 多输入 `overlay=...:enable='between(t,a,b)'` 链式烧录。效果比 libass 更可控。
5. **章节时长公式**：`dur = 旁白时长 + lead + 1.1`（lead：卡片 0.6 / 录屏 0.4，即旁白 adelay）。录制 hold 从 `mark("ready")` 起算：`ready + dur + 1.0s` 缓冲（见坑#14），保证 build 裁切不越界、素材永远够剪。
6. **字幕时间**：按句子字数比例分配章内旁白时长，误差 <0.5s，性价比远高于逐句 TTS。
7. **headless Chrome 桌面模式最小布局宽 500px**：截图验证移动端必须 `--window-size=500` 起，否则右侧被裁产生假 bug。
8. **抽帧自验**：合成后必须 `ffmpeg -ss <t> -i final.mp4 -frames:v 1` 抽关键帧（标题卡/字幕/特写/每章中段）用 Read 查看，不能只看命令成功。特写帧时刻 = 前序章节时长累加 + marks 锚点 + 0.4。**转场专项**：对每个转场窗口 `fps=8` 连抽 3 秒拼成 contact sheet（PIL 拼图）逐帧查闪帧——闪帧只存在 1-2 帧，单点抽帧根本抓不到。
9. **`locator.boundingBox()` 会等"元素稳定"**（连续两帧位置不变）：页面上有无限 CSS 动画（流光/脉冲/滚动列表）时，定位一个静止按钮也会干等 5~9 秒。元素定位一律 `frame.evaluate(s => el.getBoundingClientRect())` 即时取值。
10. **协议往返在高 CPU 负载下失控**：node 侧每帧一次 `mouse.move`+`waitForTimeout` 的循环，单次往返开销在负载高时从几 ms 涨到几十 ms，实测同一脚本录制总长 217s→339s 随机漂移。所有连续动画（光标缓动）必须**单次 evaluate 进页面用 rAF 走完**，node 侧只在台词粒度上做 wall-clock 等待——wall-clock 等待是负载免疫的。
11. **`addInitScript` 在 document-start 注入 DOM 会被静默丢弃**：那一刻的 documentElement 是占位节点，解析器随后整个替换它——挂上去的幕布/覆盖层"看起来注入成功"但从未显示。必须等 `DOMContentLoaded` 再 append（或直接用方案B，壳层元素不随导航销毁）。
12. **录制路径必须确定性**：产品里有"真模型/真网络 + 超时回落"的双轨逻辑时，录前把本地 AI 服务关掉走 mock 路径（或 deep-link 固定状态），否则结果时长/文案每次都不同，且可能录进"服务未就绪"提示。同理，所有页面要支持 `?theme=`/`?view=` 等 deep-link 参数——发现哪个页面不支持就先给产品补上再录。
13. **字幕只显示前几句、后面全无**：链式 overlay 的字幕图用单帧 `-i sub.png`（不循环）时，只有最前面几张能显示——这是"字幕中途消失"的根因。每张必须 `-loop 1 -i sub.png`（作连续流），终混加 `-shortest` 由 `full.mp4` 决定总长。另：字幕时间要**铺满整章** `[offset, offset+dur]`（首末贴合章节边界、句间无空档），否则每章尾部 1s 无字幕。
14. **每段开头白屏 + 旁白比画面早 2~3s**：录像从 `context` 创建即开始，含 `goto` 的页面加载（白屏 4~8s 且波动），直接 `-t dur` 会把白屏剪进段首，且旁白（adelay 固定）相对画面整体提前。修复：`installCursor` 后打 `mark("ready")`，build 对每个录屏段用 `trim=ready:ready+dur` 从就绪处裁切（特写锚点 `cuFrom` 也要减去 `ready`）。顺带把旁白和画面对齐了。

## 风格要素（"苹果感"从哪来）

- **慢推镜头**：每章整段缓慢放大至 1.06（这是质感的最大来源，比任何花哨转场都重要）
- **黑场渐变转场**：每章首尾 fade 0.45s，不用花式 xfade
- **标题卡**：HTML 渲染（深底 + 氛围光斑 + 渐变大字 + 等宽小标），不要用 ffmpeg 画字
- **定点放大特写**：三明治剪辑（正常→裁切放大→正常），每段独立慢推
- **BGM**：纯合成无版权风险。两档：① ffmpeg 滤镜合成——和弦 drone（根音+五度+八度正弦）+ 合成底鼓 120BPM（`exp 衰减 × 扫频 sin`）+ 反拍 hi-hat（噪声短包络）+ 脉冲琶音（窄门控+aecho）；② numpy 合成（`templates/shell/make_bgm.py`）——和弦进行垫层（如 Cmaj9→G/B→Am9→Fmaj9）+ 高八度拨弦琶音 + 柔和低频脉冲 + 每拍侧链呼吸，音乐性更好。**终混闪避实测参数**（落地"扎实"的版本）：人声 asplit 作 key，BGM 预增益 +25%，`sidechaincompress=threshold=0.012:ratio=20:attack=25:release=420`，总线 `alimiter=limit=0.9`
- **配音**：语速 -4%~-6%，旁白与动作对位靠调整 actions 里的 sleep。音色两档：免费默认 Edge-TTS（晓晓/云扬）；**升级档 MiniMax `t2a_v2`**（`model: speech-02-hd`，`voice_id: female-chengshu` 成熟女声，`speed: 0.95`，返回 hex 音频需 `bytes.fromhex` 落盘）——自然度明显高一档，按 token 计费，需 API key。两档接口都封装在 tts 一层，换音色只动一个函数

## 交付

成片复制到 `~/Desktop/<产品名>-产品演示-vN.mp4` 并 `open`。向用户说明：改文案=改 narration.mjs、加章节=加 action 函数、换 BGM=替换 bgm.wav 输入。
