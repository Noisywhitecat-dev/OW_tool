import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KeyVault } from '../desktop/vault';
let directory: string;
const key = randomBytes(32), iv = randomBytes(16);
const crypto = { available: () => true,
  encrypt(value: string) { const cipher=createCipheriv('aes-256-cbc',key,iv); return Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); },
  decrypt(value: Buffer) { const cipher=createDecipheriv('aes-256-cbc',key,iv); return Buffer.concat([cipher.update(value),cipher.final()]).toString('utf8'); },
};
beforeEach(async()=>{ directory=await mkdtemp(join(tmpdir(),'ow-vault-test-'));vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('OPENAI_API_KEY',''); });
afterEach(async()=>{vi.unstubAllEnvs();if(!resolve(directory).startsWith(resolve(tmpdir())+ '\\ow-vault-test-')&&!resolve(directory).startsWith(resolve(tmpdir())+'/ow-vault-test-'))throw new Error('Unsafe cleanup');await rm(directory,{recursive:true});});
it('persists only encrypted data, loads both providers, and deletes one without affecting the other',async()=>{
  const file=join(directory,'vault.json'),vault=new KeyVault(file,crypto);
  await vault.set('gemini','fake-gemini-key');await vault.set('openai','fake-openai-key');
  expect(await readFile(file,'utf8')).not.toContain('fake-');
  delete process.env.GEMINI_API_KEY;delete process.env.OPENAI_API_KEY;await new KeyVault(file,crypto).load();
  expect(process.env.GEMINI_API_KEY).toBe('fake-gemini-key');expect(process.env.OPENAI_API_KEY).toBe('fake-openai-key');
  await vault.set('gemini','');expect(process.env.GEMINI_API_KEY).toBeUndefined();expect(process.env.OPENAI_API_KEY).toBe('fake-openai-key');
});
it('does not install a new key if encrypted file persistence fails',async()=>{
  const blocker=join(directory,'file');await writeFile(blocker,'file');const vault=new KeyVault(join(blocker,'vault.json'),crypto);
  await expect(vault.set('gemini','fake-new-key')).rejects.toThrow();expect(process.env.GEMINI_API_KEY).toBe('');
});
it('rejects unknown providers and unavailable encryption without saving plaintext',async()=>{
  const vault=new KeyVault(join(directory,'vault.json'),{...crypto,available:()=>false});
  await expect(vault.set('other','fake-key')).rejects.toThrow();await expect(vault.set('gemini','fake-key')).rejects.toThrow();
  await expect(readFile(join(directory,'vault.json'))).rejects.toThrow();
});
