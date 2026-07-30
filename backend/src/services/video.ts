<<<<<<< Updated upstream
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config.js';
import { describeFrame } from './ollama.js';
import { logEvent } from './events.js';
import type { PageText } from './chunker.js';
import type { ExtractedImage } from './docx.js';

const run = promisify(execFile);
const bundledFfmpegPath = ffmpegStatic ?? 'ffmpeg';
const ffmpegExecutable = config.FFMPEG_PATH === 'ffmpeg' ? bundledFfmpegPath : config.FFMPEG_PATH;

/** Formatează secunde ca m:ss (ex. 155 → "2:35"). */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Alege cel mult `max` elemente distribuite uniform, păstrând primul și ultimul. */
export function pickEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const picked: T[] = [];
  for (let i = 0; i < max; i++) {
    picked.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  }
  return [...new Set(picked)];
}

/**
 * Extrage cadrele-cheie dintr-un video (primul cadru + schimbările de scenă),
 * le descrie cu modelul vision și le întoarce ca "pagini" în care numărul
 * paginii este secunda din video — citările devin fișier + minutul sursă.
 *
 * Necesită `ffmpeg`; folosim mai întâi binarul inclus prin `ffmpeg-static`,
 * iar `FFMPEG_PATH` poate suprascrie executabilul folosit.
 */
export async function extractVideoPages(
  absPath: string,
  relPath: string
): Promise<{ pages: PageText[]; images: ExtractedImage[] }> {
  const workDir = await mkdtemp(join(tmpdir(), 'rag-video-'));
  try {
    // Un singur pas: selectează cadrele, scalează la 1280px, scrie JPEG-uri;
    // timestamp-urile ies din filtrul showinfo (pe stderr).
    let stderr: string;
    try {
      ({ stderr } = await run(ffmpegExecutable, [
        '-i', absPath,
        '-vf', `select='eq(n,0)+gt(scene,${config.VIDEO_SCENE_THRESHOLD})',showinfo,scale=1280:-2`,
        '-fps_mode', 'vfr',
        '-q:v', '3',
        join(workDir, 'f_%04d.jpg'),
      ], { maxBuffer: 64 * 1024 * 1024 }));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('ENOENT')) {
        throw new Error(
          `Nu găsesc executabilul ffmpeg (${ffmpegExecutable}). Setează FFMPEG_PATH în .env cu path-ul complet sau verifică instalarea ffmpeg-static.`
        );
      }
      throw err;
    }

    const timestamps = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
    const files = (await readdir(workDir)).filter((f) => f.endsWith('.jpg')).sort();

    let frames = files.map((file, i) => ({ file, ts: timestamps[i] ?? 0 }));
    if (frames.length > config.VIDEO_MAX_FRAMES) {
      await logEvent(
        'info',
        'video',
        `${frames.length} cadre detectate — păstrez ${config.VIDEO_MAX_FRAMES} distribuite uniform`,
        relPath
      );
      frames = pickEvenly(frames, config.VIDEO_MAX_FRAMES);
    }

    const pages: PageText[] = [];
    const images: ExtractedImage[] = [];
    for (const frame of frames) {
      const image = await readFile(join(workDir, frame.file));
      try {
        const description = (await describeFrame(image.toString('base64'))).trim();
        if (!description) {
          await logEvent('warn', 'video', `Cadrul de la ${formatTimestamp(frame.ts)}: modelul a returnat descriere goală`, relPath);
        }
        if (description) {
          const seq = images.length;
          images.push({ seq, buffer: image, mime: 'image/jpeg' });
          pages.push({
            page: Math.max(0, Math.floor(frame.ts)),
            text: `[Cadru la min. ${formatTimestamp(frame.ts)}]\n${description}\n[IMG:${seq}]`,
            source: 'video',
          });
        }
      } catch (err) {
        await logEvent(
          'warn',
          'video',
          `Cadrul de la ${formatTimestamp(frame.ts)}: descriere eșuată (${(err as Error).message})`,
          relPath
        );
      }
    }
    return { pages, images };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
=======
// Modulul de indexare video a fost eliminat din aplicație.
// Acest fișier este păstrat doar ca punct istoric; nu mai este importat de nimeni.
export {};
>>>>>>> Stashed changes
