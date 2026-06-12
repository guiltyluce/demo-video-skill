#!/usr/bin/env python3
"""合成发布会风格 BGM：暖和弦垫 + 柔和四拍脉冲 + 轻拨弦琶音，100 BPM。
自合成 → 完全自有版权。输出 bgm.wav（48k 立体声）。
用法: python3 make_bgm.py <时长秒>
"""
import sys
import numpy as np
import wave

SR = 48000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 135.0
BPM = 100.0
BEAT = 60.0 / BPM                      # 0.6s
BAR = BEAT * 4

N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N)
R = np.zeros(N)

def note(freq):                        # 等比音名计算用
    return freq

# 和弦进行（C 大调，温暖上行）：Cmaj9 → G/B → Am9 → Fmaj9，每和弦 2 小节
A4 = 440.0
def f(semi_from_a4): return A4 * 2 ** (semi_from_a4 / 12)
# 以 MIDI 半音相对 A4 表示
CH = [
    [f(-21), f(-17), f(-14), f(-10), f(-7)],   # C3 E3 G3 B3 D4
    [f(-22), f(-15), f(-10), f(-5)],            # B2 D3(G/B) G3 D4 → B2 F#3? 用 G/B: B2 D3 G3 B3
    [f(-24), f(-17), f(-12), f(-7), f(-5)],     # A2 E3 A3 D4? Am9: A2 E3 G3 B3 D4
    [f(-28), f(-19), f(-16), f(-12), f(-7)],    # F2 C3 E3 A3 B3? Fmaj9: F2 C3 E3 G3 A3
]
CHORD_LEN = BAR * 2

# ---- 1. 和弦垫（慢起音、微失谐双振荡、轻微颤动） ----
pos = 0.0
while pos < DUR:
    ci = int(pos / CHORD_LEN) % len(CH)
    seg_len = min(CHORD_LEN, DUR - pos)
    n0, n1 = int(pos * SR), int((pos + seg_len) * SR)
    seg_t = t[n0:n1] - pos
    env = np.minimum(seg_t / 1.6, 1.0) * np.minimum((seg_len - seg_t) / 1.2, 1.0)
    env = np.clip(env, 0, 1) ** 1.2
    for k, fr in enumerate(CH[ci]):
        vib = 1 + 0.0015 * np.sin(2 * np.pi * 0.21 * seg_t + k)
        wL = np.sin(2 * np.pi * fr * 0.9985 * vib * seg_t) + 0.35 * np.sin(2 * np.pi * fr * 2 * seg_t)
        wR = np.sin(2 * np.pi * fr * 1.0015 * vib * seg_t) + 0.35 * np.sin(2 * np.pi * fr * 2 * seg_t)
        amp = 0.055 / (k + 1) ** 0.4
        L[n0:n1] += amp * env * wL
        R[n0:n1] += amp * env * wR
    pos += CHORD_LEN

# ---- 2. 琶音拨弦（八分音，根音上行五声） ----
rng = np.random.default_rng(20260612)
step = BEAT / 2
i = 0
pos = 4 * BEAT                          # 第二小节进
while pos < DUR - 1:
    ci = int(pos / CHORD_LEN) % len(CH)
    notes = CH[ci]
    fr = notes[(i * 2 + (i // 3)) % len(notes)] * 2   # 高八度
    dur_n = 0.5
    n0 = int(pos * SR); n1 = min(int((pos + dur_n) * SR), N)
    seg_t = t[n0:n1] - pos
    env = np.exp(-seg_t * 7.5)
    w = np.sin(2 * np.pi * fr * seg_t) + 0.4 * np.sin(2 * np.pi * fr * 2 * seg_t) * np.exp(-seg_t * 12)
    pan = 0.5 + 0.32 * np.sin(i * 0.9)
    amp = 0.045 * (0.8 + 0.2 * rng.random())
    L[n0:n1] += amp * (1 - pan) * 2 * env * w
    R[n0:n1] += amp * pan * 2 * env * w
    pos += step; i += 1

# ---- 3. 柔和低频脉冲（从第 4 小节起，每拍，圆润不砸） ----
pos = 4 * BAR
while pos < DUR - 0.5:
    n0 = int(pos * SR); n1 = min(int((pos + 0.32) * SR), N)
    seg_t = t[n0:n1] - pos
    env = np.exp(-seg_t * 17)
    sweep = 72 * np.exp(-seg_t * 9) + 46
    w = np.sin(2 * np.pi * np.cumsum(sweep) / SR)
    L[n0:n1] += 0.16 * env * w
    R[n0:n1] += 0.16 * env * w
    pos += BEAT

# ---- 4. 气声节拍（噪声 tick，反拍，极轻） ----
pos = 4 * BAR + BEAT / 2
while pos < DUR - 0.5:
    n0 = int(pos * SR); n1 = min(int((pos + 0.07) * SR), N)
    ln = n1 - n0
    nz = rng.standard_normal(ln)
    nz = np.diff(nz, prepend=0)        # 简易高通
    env = np.exp(-np.arange(ln) / SR * 90)
    L[n0:n1] += 0.018 * env * nz
    R[n0:n1] += 0.022 * env * nz
    pos += BEAT

# ---- 5. 侧链呼吸感（每拍轻微下压垫层整体） ----
duck = 1 - 0.22 * np.clip(1 - (t % BEAT) / (BEAT * 0.45), 0, 1) ** 2
mask = t > 4 * BAR                      # 节拍进来后才呼吸
duck = np.where(mask, duck, 1.0)
L *= duck; R *= duck

# ---- 6. 总线：淡入淡出 + 软限幅 ----
fade_in = np.clip(t / 2.5, 0, 1)
fade_out = np.clip((DUR - t) / 4.0, 0, 1)
L *= fade_in * fade_out; R *= fade_in * fade_out
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.4) * 0.62        # 软饱和 + 留 headroom

pcm = (mix * 32767).astype(np.int16)
with wave.open('bgm.wav', 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"bgm.wav: {DUR}s, peak {np.abs(mix).max():.2f}")
