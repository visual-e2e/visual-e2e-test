import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Video } from "playwright";

export function runVideoFilename(runId: string): string {
  return `${runId}.webm`;
}

export function runVideoPath(videoDir: string, runId: string): string {
  return join(videoDir, runVideoFilename(runId));
}

export function resolveRunVideoPath(
  runDir: string,
  runId: string,
  explicitPath?: string,
): string | undefined {
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }
  return findExistingRunVideo(join(runDir, "videos"), runId);
}

function findExistingRunVideo(videoDir: string, runId: string): string | undefined {
  const destPath = runVideoPath(videoDir, runId);
  if (existsSync(destPath)) {
    return destPath;
  }
  if (!existsSync(videoDir)) {
    return undefined;
  }

  const files = readdirSync(videoDir)
    .filter((f) => f.endsWith(".webm"))
    .sort();

  const named = files.find((f) => f === runVideoFilename(runId));
  if (named) {
    return join(videoDir, named);
  }

  const tempFiles = files.filter((f) => f.startsWith("page@"));
  if (tempFiles.length === 1) {
    return join(videoDir, tempFiles[0]);
  }

  return files.length === 1 ? join(videoDir, files[0]) : undefined;
}

/** 保存整次运行的录屏；须在 page.close() 之后调用 */
export async function saveRunVideo(
  video: Video | null | undefined,
  videoDir: string,
  runId: string,
): Promise<string | undefined> {
  if (!video) {
    return findExistingRunVideo(videoDir, runId);
  }

  mkdirSync(videoDir, { recursive: true });
  const destPath = runVideoPath(videoDir, runId);

  const cleanupAuto = (autoPath: string) => {
    if (autoPath !== destPath && existsSync(autoPath)) {
      unlinkSync(autoPath);
    }
  };

  try {
    await video.saveAs(destPath);
    try {
      cleanupAuto(await video.path());
    } catch {
      /* ignore temp cleanup */
    }
    if (existsSync(destPath)) {
      return destPath;
    }
  } catch {
    /* fallback below */
  }

  try {
    const autoPath = await video.path();
    if (autoPath && existsSync(autoPath)) {
      copyFileSync(autoPath, destPath);
      cleanupAuto(autoPath);
      if (existsSync(destPath)) {
        return destPath;
      }
    }
  } catch {
    /* ignore */
  }

  return findExistingRunVideo(videoDir, runId);
}
