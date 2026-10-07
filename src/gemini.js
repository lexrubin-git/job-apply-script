// Google Gemini (free tier) for writing cover letters. Your key is stored in me/secrets.json and only sent to Google.
// Free-tier models change often, so this asks Google which models your key can use and falls back if one is at its limit.
import { paths, readJson, writeJson } from './config.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let workingModel = null;

export function geminiKey() {
  return String(readJson(paths.secrets, {}).geminiApiKey || '').trim();
}

export function saveGeminiKey(key) {
  const secrets = readJson(paths.secrets, {});
  secrets.geminiApiKey = String(key || '').trim();
  writeJson(paths.secrets, secrets);
  workingModel = null;
}

async function call(path, key, body) {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000), // a model that's this slow is skipped for the next one
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data, message: data?.error?.message || res.statusText };
  } catch (e) {
    return { status: 0, ok: false, data: {}, message: e.name === 'TimeoutError' ? 'Gemini took too long to answer.' : e.message };
  }
}

// Newer Flash models "think" before answering, which can take minutes; a little thinking is plenty for a letter.
function thinkingFor(model) {
  if (/gemini-[3-9]|flash-latest/.test(model)) return { thinkingLevel: 'low' };
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: 512 };
  return null;
}

// Newest Flash models first; "lite" and preview versions after the regular ones.
function rankModels(models) {
  const version = (n) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name)
    .filter((n) => /gemini-\d+(\.\d+)?-flash/.test(n) && !/image|tts|audio|live|embedding|vision/.test(n))
    .sort((a, b) => {
      const lite = (n) => (/lite/.test(n) ? 1 : 0);
      const pre = (n) => (/preview|exp/.test(n) ? 1 : 0);
      return lite(a) - lite(b) || version(b) - version(a) || pre(a) - pre(b);
    });
}

/** Ask Gemini for JSON matching `schema` (Gemini's schema format). */
export async function generateJson({ system, prompt, schema, temperature = 0.8 }) {
  const key = geminiKey();
  if (!key) throw new Error('Add your free Gemini API key first (My info → Settings).');

  let candidates = workingModel ? [workingModel] : [];
  if (!candidates.length) {
    const list = await call('models?pageSize=200', key);
    if (list.status === 400 || list.status === 403) throw new Error("That Gemini API key doesn't work. Check it in My info → Settings.");
    candidates = list.ok ? rankModels(list.data.models || []) : [];
    if (!candidates.length) candidates = ['models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite'];
  }

  let lastError = 'Gemini had a problem.';
  for (const model of candidates.slice(0, 4)) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    };
    const thinking = thinkingFor(model);
    if (thinking) body.generationConfig.thinkingConfig = thinking;
    let r = await call(`${model}:generateContent`, key, body);
    if (r.status === 400 && thinking && /think/i.test(r.message)) {
      delete body.generationConfig.thinkingConfig; // this model doesn't take that setting
      r = await call(`${model}:generateContent`, key, body);
    }
    if (r.status === 400 && /api key/i.test(r.message)) throw new Error("That Gemini API key doesn't work. Check it in My info → Settings.");
    if (!r.ok) {
      lastError =
        r.status === 429 ? "Gemini's free limit is used up for now. Try again in a minute, or tomorrow if it says so."
        : r.status === 503 ? 'Gemini is very busy right now. Try again in a minute.'
        : r.message;
      if (workingModel === model) workingModel = null;
      continue; // try the next model
    }
    const text = (r.data.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || '')
      .join('');
    try {
      const out = JSON.parse(text);
      workingModel = model;
      return { ...out, model: model.replace('models/', '') };
    } catch {
      lastError = `Gemini's answer was cut off (${r.data.candidates?.[0]?.finishReason || 'unknown reason'}).`;
    }
  }
  throw new Error(lastError);
}
