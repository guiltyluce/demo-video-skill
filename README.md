# demo-video-skill

把任意 Web 产品做成**苹果发布会风格演示视频**的 Claude Code skill：真实操作录屏 + AI 中文配音 + 字幕 + 定点放大特写 + 科技感 BGM，全程命令行自动化，零剪辑软件。

> An Agent Skill for Claude Code that turns any web product into an Apple-keynote-style demo video — scripted browser recording, neural TTS narration, burned-in subtitles, punch-in close-ups and synthesized BGM, fully automated via CLI.

## 成片里有什么

- **真实操作录屏**：Playwright 驱动你的产品（点击、滚动、输入），注入平滑动画光标与点击波纹
- **AI 配音**：Edge-TTS 神经语音（晓晓/云扬等），旁白与画面动作对位
- **胶囊字幕**：逐句烧录，毛玻璃胶囊样式
- **慢推镜头**：每章缓慢推近（"苹果感"的最大来源），4K 超采样无抖动
- **定点放大特写**：关键 UI（数据卡、确认框）三明治剪辑放大呈现，时间锚点自动对齐
- **标题卡**：HTML 渲染的开场/结尾卡（深底氛围光 + 渐变大字）
- **BGM**：ffmpeg 纯合成（120BPM 科技氛围，无版权风险），人声出现自动闪避

## 依赖

```bash
brew install ffmpeg
pip3 install --user edge-tts
npm i -D playwright && npx playwright install chromium
```

## 作为 Claude Code skill 安装

```bash
git clone https://github.com/guiltyluce/demo-video-skill
cp -r demo-video-skill ~/.claude/skills/demo-video
```

之后在任何项目里对 Claude 说"给这个产品做一个演示视频"，它会按 SKILL.md 的流程：和你对分镜文案 → 三连出片 → 抽帧自验 → 交付桌面。

## 不用 Claude 也能跑

把 `templates/` 拷进项目，改三处后执行：

```bash
node tts.mjs && node record.mjs && node build.mjs   # → out/final.mp4
```

| 文件 | 改什么 |
|---|---|
| `narration.mjs` | 章节、旁白文案、分句字幕、音色 |
| `record.mjs` | 产品地址、各章操作脚本（选择器）、特写锚点 `mark()` |
| `build.mjs` | 特写裁切区域坐标 |

## 两套架构

- **方案A · 分章节段落式**（`templates/`）：每章独立录制，ffmpeg 拼接。通用，章节可独立重录。
- **方案B · 壳+iframe 连续单镜**（`templates/shell/`）：标题卡/字幕/光标/镜头层常驻录制壳，产品页在 iframe 里换——**转场零闪帧**（换页永远发生在卡片底下），慢推/特写是 CSS 镜头层实时录制（无 zoompan、无 4K 超采样、无对位），胶囊字幕直接录进画面。要求产品页可被 iframe 嵌入。标题卡多、特写多、转场要求严丝合缝时优先选 B。

## 坑库（本 skill 最值钱的部分，详见 SKILL.md）

1. `zoompan` 直接在 1080p 推镜会**持续抖动** → 必须先 4K 超采样（或用方案B根除）
2. 外部步进移动光标有阶梯感 → 页面内 `requestAnimationFrame` 补间
3. 页面加载耗时波动会让特写时间窗裁偏 → 录制时打时间锚点（marks.json）
4. Homebrew ffmpeg 常缺 libass/drawtext → 字幕用透明 PNG `overlay` 烧录
5. `locator.boundingBox()` 会等"元素稳定"——页面有无限 CSS 动画时定位静止按钮也干等数秒 → `getBoundingClientRect` 即时取值
6. 协议往返开销在高 CPU 负载下失控（实测同脚本 217s→339s 漂移）→ 连续动画单次 evaluate 进页面 rAF 走完，node 侧只做台词粒度 wall-clock 等待
7. `addInitScript` 在 document-start 注入的 DOM 会被解析器**静默丢弃**（documentElement 是占位节点）→ 等 DOMContentLoaded 再挂
8. 录制路径必须确定性：真模型/真网络双轨逻辑录前切 mock；闪帧检查要用转场窗口 `fps=8` 连拍 contact sheet，单点抽帧抓不到
9. 章节时长公式、字幕按字数配时、抽帧自验流程……

## 配音与闪避（v2 实测沉淀）

- 音色升级档：MiniMax `t2a_v2`（speech-02-hd · female-chengshu · speed 0.95），自然度高于 Edge-TTS 一档，hex 音频解码落盘
- BGM 闪避落地参数：人声作 sidechain key，BGM 预增益 +25%，`threshold .012 / ratio 20 / attack 25ms / release 420ms`，总线 limiter 0.9

## License

MIT
