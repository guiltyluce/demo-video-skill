---
name: demo-video
description: 制作"苹果发布会风格"的 Web 产品演示视频：Playwright 驱动真实操作录屏（动画光标）+ Edge-TTS 中文配音 + ffmpeg 合成（标题卡、慢推镜头、定点放大特写、胶囊字幕、BGM 人声闪避）。当用户要求为网页产品制作演示视频、宣传片、带配音解说的功能展示视频时使用。
---

# 产品演示视频制作管线

四件套（模板在本 skill 的 `templates/`，复制到目标项目 `scripts/demo-video/` 后按下方"定制点"修改）：

```
narration.mjs  分镜：章节(卡片/录屏)、旁白文案、分句字幕、音色
tts.mjs        Edge-TTS 配音 + ffprobe 时长 → out/durations.json
record.mjs     Playwright 录屏 + 标题卡渲染 + 时间锚点 → out/raw/*.webm, marks.json
build.mjs      ffmpeg 合成 → out/final.mp4
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
5. **章节时长公式**：`dur = 旁白时长 + lead + 1.1`（lead：卡片 0.6 / 录屏 0.4，即旁白 adelay）。录制 hold = 旁白 + 1.6，保证素材永远够剪。
6. **字幕时间**：按句子字数比例分配章内旁白时长，误差 <0.5s，性价比远高于逐句 TTS。
7. **headless Chrome 桌面模式最小布局宽 500px**：截图验证移动端必须 `--window-size=500` 起，否则右侧被裁产生假 bug。
8. **抽帧自验**：合成后必须 `ffmpeg -ss <t> -i final.mp4 -frames:v 1` 抽关键帧（标题卡/字幕/特写/每章中段）用 Read 查看，不能只看命令成功。特写帧时刻 = 前序章节时长累加 + marks 锚点 + 0.4。

## 风格要素（"苹果感"从哪来）

- **慢推镜头**：每章整段缓慢放大至 1.06（这是质感的最大来源，比任何花哨转场都重要）
- **黑场渐变转场**：每章首尾 fade 0.45s，不用花式 xfade
- **标题卡**：HTML 渲染（深底 + 氛围光斑 + 渐变大字 + 等宽小标），不要用 ffmpeg 画字
- **定点放大特写**：三明治剪辑（正常→裁切放大→正常），每段独立慢推
- **BGM**：纯 ffmpeg 合成无版权风险——和弦 drone（根音+五度+八度正弦）+ 合成底鼓 120BPM（`exp 衰减 × 扫频 sin`）+ 反拍 hi-hat（噪声短包络）+ 脉冲琶音（窄门控+aecho）；终混必须 `sidechaincompress` 让 BGM 给人声闪避
- **配音**：语速 -4%~-6%，旁白与动作对位靠调整 actions 里的 sleep

## 交付

成片复制到 `~/Desktop/<产品名>-产品演示-vN.mp4` 并 `open`。向用户说明：改文案=改 narration.mjs、加章节=加 action 函数、换 BGM=替换 bgm.wav 输入。
