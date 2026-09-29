import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OverFast } from '../server/overfast';
import { rankSchema } from '../shared/statistics';
const rank = rankSchema.parse(process.argv[2] ?? 'all');
const output = resolve(process.argv[3] ?? `artifacts/statistics-${rank}.json`);
const data = await new OverFast(resolve('artifacts/overfast-cache')).collect(rank, message => console.log(message));
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(data, null, 2), 'utf8');
console.log(JSON.stringify({ output, heroes: data.heroes.data.length, maps: data.byMap.length, excluded: data.unavailableMaps.length, region: data.region, rank: data.actualRank }));
