import { Gemini, GeminiError } from './gemini';
import { rerank, safeError } from './openai';
import type { Settings } from '../shared/schema';
const gemini = new Gemini();
export const keyAvailable = (provider: Settings['provider']) => Boolean(provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);
export const rank: typeof rerank = (meta, input, candidates, settings) => settings.provider === 'gemini' ? gemini.rerank(meta, input, candidates, settings) : rerank(meta, input, candidates, settings);
export const aiError = (error: unknown) => error instanceof GeminiError ? error.message : safeError(error);
