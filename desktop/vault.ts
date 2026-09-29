import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

type Provider = 'gemini' | 'openai';
type Crypto = { available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string };
const names = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };
export class KeyVault {
  private values: Partial<Record<Provider, string>> = {};
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string, private crypto: Crypto) {}
  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      if (!this.crypto.available()) throw new Error('Encryption unavailable');
      for (const provider of ['gemini', 'openai'] as const) {
        if (parsed[provider] === undefined) continue;
        if (typeof parsed[provider] !== 'string') throw new Error('Invalid vault');
        process.env[names[provider]] = this.crypto.decrypt(Buffer.from(parsed[provider], 'base64'));
        this.values[provider] = parsed[provider];
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  set(provider: unknown, value: unknown): Promise<void> {
    if ((provider !== 'gemini' && provider !== 'openai') || typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) return Promise.reject(new Error('Invalid key input'));
    const key = value.trim();
    const task = this.queue.then(async () => {
      if (!this.crypto.available()) throw new Error('Encryption unavailable');
      const next = { ...this.values };
      if (key) next[provider] = this.crypto.encrypt(key).toString('base64'); else delete next[provider];
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(next), 'utf8'); await rename(temporary, this.file);
      this.values = next;
      if (key) process.env[names[provider]] = key; else delete process.env[names[provider]];
    });
    this.queue = task.catch(() => {}); return task;
  }
}
