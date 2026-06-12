// 生成各章旁白音频 + 时长清单（node tts.mjs）
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { chapters, VOICE, RATE } from "./narration.mjs";

mkdirSync("out", { recursive: true });
const durations = {};

for (const ch of chapters) {
  const mp3 = `out/narr-${ch.id}.mp3`;
  execSync(
    `python3 -m edge_tts --voice ${VOICE} --rate="${RATE}" --text ${JSON.stringify(ch.narration)} --write-media ${mp3}`,
    { stdio: "pipe" }
  );
  const dur = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${mp3}`).toString().trim()
  );
  durations[ch.id] = dur;
  console.log(`${ch.id}: ${dur.toFixed(1)}s`);
}

writeFileSync("out/durations.json", JSON.stringify(durations, null, 1));
console.log("TTS done.");
