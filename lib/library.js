// The lecture library: the newest saved wall for each saved lecture, with what the home page needs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function library(root) {
  const wallsDir = join(root, 'data/walls');
  const walls = existsSync(wallsDir) ? readdirSync(wallsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  return readdirSync(join(root, 'data/lectures')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).map((id) => {
    const lec = JSON.parse(readFileSync(join(root, 'data/lectures', `${id}.json`), 'utf8'));
    const wid = walls.filter((w) => w.startsWith(`${id}-`)).sort().at(-1);
    const w = wid ? JSON.parse(readFileSync(join(wallsDir, `${wid}.json`), 'utf8')) : null;
    return { lecture: id, title: lec.title, credit: lec.source.credit, url: lec.source.url, minutes: Math.round((lec.duration || 0) / 60),
      wall: wid ?? null, tiles: w?.tiles.length ?? 0, wallSeconds: w?.timings.wallSeconds ?? null, firstTile: w?.timings.firstTile ?? null,
      startedAt: w?.startedAt ?? null };
  });
}
