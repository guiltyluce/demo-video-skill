// 方案B合成器：连续单镜 webm + 时间轴人声 + BGM 闪避 → final.mp4
// 闪避参数为实测落地版（人声进 BGM 干脆让位，停顿半秒内浮回）
// 前置: python3 make_bgm.py <时长=timeline.total+1.5>
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tl = JSON.parse(readFileSync('timeline.json', 'utf8'));
const lines = tl.lines;

const inputs = ['-i', tl.video];
const fc = [];
const vmix = [];
lines.forEach((ln, n) => {
  inputs.push('-i', `tts/${ln.id}.mp3`);
  const ms = Math.round(ln.t * 1000);
  fc.push(`[${n + 1}:a]aresample=48000,adelay=${ms}|${ms}[v${n}]`);
  vmix.push(`[v${n}]`);
});
inputs.push('-i', 'bgm.wav');

fc.push(vmix.join('') + `amix=inputs=${lines.length}:normalize=0,volume=1.7[voice]`);
fc.push('[voice]asplit=2[vk][vmixv]');
fc.push(`[${lines.length + 1}:a]volume=1.25[bg]`);
// 闪避实测参数：threshold .012 / ratio 20 / attack 25ms / release 420ms
fc.push('[bg][vk]sidechaincompress=threshold=0.012:ratio=20:attack=25:release=420:makeup=1[bgmd]');
fc.push('[vmixv][bgmd]amix=inputs=2:normalize=0,alimiter=limit=0.9[aout]');

const cmd = ['ffmpeg', '-y', '-loglevel', 'error', ...inputs,
  '-filter_complex', `"${fc.join(';')}"`,
  '-map', '0:v', '-map', '[aout]',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  '-t', String(tl.total + 1.2), 'final.mp4'].join(' ');
execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
console.log('final.mp4 ready,', tl.total + 's');
