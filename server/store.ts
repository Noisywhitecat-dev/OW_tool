import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import bundledSnapshot from '../meta/current.json';
import { defaultSettings } from '../shared/prompts';
import { settingsSchema, validateSnapshot, type Settings, type Snapshot } from '../shared/schema';

export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  private settings: Settings = structuredClone(defaultSettings);
  private snapshot: Snapshot;
  constructor(private directory = resolve(process.env.DATA_DIR || './data'), initialSnapshot?: Snapshot) {
    this.snapshot = validateSnapshot(structuredClone(initialSnapshot ?? bundledSnapshot));
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true });
    const read = async (name: string) => {
      try { return JSON.parse(await readFile(join(this.directory, name), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error(`${name} 읽기 실패: 저장 파일을 확인해 주세요.`); }
    };
    const settings = await read('settings.json');
    const snapshot = await read('meta.json');
    if (settings) this.settings = settingsSchema.parse(settings);
    if (snapshot) this.snapshot = validateSnapshot(snapshot);
  }
  getSettings() { return structuredClone(this.settings); }
  getSnapshot() { return structuredClone(this.snapshot); }

  private save(name: string, data: unknown, commit: () => void) {
    const work = this.queue.then(async () => {
      const temporary = join(this.directory, `${name}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
      await rename(temporary, join(this.directory, name));
      commit();
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  saveSettings(value: unknown) {
    const parsed = settingsSchema.parse(value);
    return this.save('settings.json', parsed, () => { this.settings = parsed; });
  }
  saveSnapshot(value: unknown) {
    const parsed = validateSnapshot(value);
    return this.save('meta.json', parsed, () => { this.snapshot = parsed; });
  }
}
