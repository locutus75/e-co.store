/**
 * Pricing per 1M tokens in USD.
 * Updated with current rates for OpenAI, Anthropic, Google Gemini and custom local models.
 */

export interface ModelPricing {
  input: number;  // USD per 1M tokens
  output: number; // USD per 1M tokens
  description?: string;
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-5':                      { input: 2.50,  output: 10.0,  description: 'OpenAI GPT-5 flagship' },
  'gpt-5.6-terra':              { input: 2.50,  output: 10.0,  description: 'OpenAI GPT-5.6 Terra' },
  'gpt-5.5':                    { input: 2.50,  output: 10.0,  description: 'OpenAI GPT-5.5' },
  'gpt-5.4':                    { input: 2.50,  output: 10.0,  description: 'OpenAI GPT-5.4' },
  'gpt-4o':                     { input: 2.50,  output: 10.0,  description: 'OpenAI GPT-4o' },
  'gpt-4o-mini':                { input: 0.15,  output: 0.60,  description: 'OpenAI GPT-4o Mini (efficiënt)' },
  'o1':                         { input: 15.0,  output: 60.0,  description: 'OpenAI o1 reasoning model' },
  'o1-preview':                 { input: 15.0,  output: 60.0,  description: 'OpenAI o1 Preview' },
  'o1-mini':                    { input: 3.00,  output: 12.0,  description: 'OpenAI o1 Mini reasoning' },
  'o3':                         { input: 10.0,  output: 40.0,  description: 'OpenAI o3 reasoning model' },
  'o3-mini':                    { input: 1.10,  output: 4.40,  description: 'OpenAI o3 Mini reasoning' },
  'gpt-4-turbo':                { input: 10.0,  output: 30.0,  description: 'OpenAI GPT-4 Turbo' },
  'gpt-4':                      { input: 30.0,  output: 60.0,  description: 'OpenAI GPT-4 Legacy' },
  'gpt-3.5-turbo':              { input: 0.50,  output: 1.50,  description: 'OpenAI GPT-3.5 Turbo' },
  'gpt-image-1':                { input: 5.00,  output: 20.0,  description: 'OpenAI Image / Vision model' },

  // ── Anthropic ───────────────────────────────────────────────────────────────
  'claude-sonnet-4-6':          { input: 3.00,  output: 15.0,  description: 'Anthropic Claude Sonnet 4.6' },
  'claude-3-7-sonnet':          { input: 3.00,  output: 15.0,  description: 'Anthropic Claude 3.7 Sonnet' },
  'claude-3-7-sonnet-20250219': { input: 3.00,  output: 15.0,  description: 'Anthropic Claude 3.7 Sonnet' },
  'claude-3-5-sonnet':          { input: 3.00,  output: 15.0,  description: 'Anthropic Claude 3.5 Sonnet' },
  'claude-3-5-sonnet-20241022': { input: 3.00,  output: 15.0,  description: 'Anthropic Claude 3.5 Sonnet' },
  'claude-3-5-haiku':           { input: 0.80,  output: 4.00,  description: 'Anthropic Claude 3.5 Haiku' },
  'claude-3-5-haiku-20241022':  { input: 0.80,  output: 4.00,  description: 'Anthropic Claude 3.5 Haiku' },
  'claude-3-opus':              { input: 15.0,  output: 75.0,  description: 'Anthropic Claude 3 Opus' },
  'claude-3-opus-20240229':     { input: 15.0,  output: 75.0,  description: 'Anthropic Claude 3 Opus' },

  // ── Google Gemini ───────────────────────────────────────────────────────────
  'gemini-2.0-flash':           { input: 0.10,  output: 0.40,  description: 'Google Gemini 2.0 Flash' },
  'gemini-2.0-flash-exp':       { input: 0.10,  output: 0.40,  description: 'Google Gemini 2.0 Flash Exp' },
  'gemini-1.5-pro':             { input: 1.25,  output: 5.00,  description: 'Google Gemini 1.5 Pro' },
  'gemini-1.5-flash':           { input: 0.075, output: 0.30,  description: 'Google Gemini 1.5 Flash' },
  'gemini-1.5-flash-8b':        { input: 0.0375, output: 0.15, description: 'Google Gemini 1.5 Flash-8B' },

  // ── Local / Self-Hosted ─────────────────────────────────────────────────────
  'local-model':                { input: 0.0,   output: 0.0,   description: 'Lokale LM Studio / Self-hosted LLM (gratis)' },
  'lm-studio':                  { input: 0.0,   output: 0.0,   description: 'LM Studio lokaal' },
};

/**
 * Resolves pricing for any model name via exact or intelligent prefix matching.
 */
export function getModelPricing(model: string = ''): ModelPricing {
  const norm = model.trim().toLowerCase();
  if (!norm) return { input: 1.0, output: 4.0, description: 'Standaard model' };

  // 1. Exact match (case insensitive)
  for (const [key, p] of Object.entries(PRICING_TABLE)) {
    if (key.toLowerCase() === norm) return p;
  }

  // 2. Pattern matching based on model family
  if (norm.startsWith('gpt-5')) {
    return { input: 2.50, output: 10.0, description: 'OpenAI GPT-5 familie' };
  }
  if (norm.startsWith('gpt-4o-mini')) {
    return { input: 0.15, output: 0.60, description: 'OpenAI GPT-4o Mini familie' };
  }
  if (norm.startsWith('gpt-4o')) {
    return { input: 2.50, output: 10.0, description: 'OpenAI GPT-4o familie' };
  }
  if (norm.startsWith('o1-mini')) {
    return { input: 3.00, output: 12.0, description: 'OpenAI o1 Mini familie' };
  }
  if (norm.startsWith('o1')) {
    return { input: 15.0, output: 60.0, description: 'OpenAI o1 familie' };
  }
  if (norm.startsWith('o3-mini')) {
    return { input: 1.10, output: 4.40, description: 'OpenAI o3 Mini familie' };
  }
  if (norm.startsWith('o3')) {
    return { input: 10.0, output: 40.0, description: 'OpenAI o3 familie' };
  }
  if (norm.startsWith('gpt-4-turbo')) {
    return { input: 10.0, output: 30.0, description: 'OpenAI GPT-4 Turbo familie' };
  }
  if (norm.startsWith('gpt-4')) {
    return { input: 10.0, output: 30.0, description: 'OpenAI GPT-4 familie' };
  }
  if (norm.startsWith('gpt-3.5')) {
    return { input: 0.50, output: 1.50, description: 'OpenAI GPT-3.5 familie' };
  }
  if (norm.includes('image') || norm.includes('dall-e')) {
    return { input: 5.00, output: 20.0, description: 'Vision / Afbeeldingen model' };
  }
  if (norm.includes('sonnet')) {
    return { input: 3.00, output: 15.0, description: 'Anthropic Claude Sonnet familie' };
  }
  if (norm.includes('haiku')) {
    return { input: 0.80, output: 4.00, description: 'Anthropic Claude Haiku familie' };
  }
  if (norm.includes('opus')) {
    return { input: 15.0, output: 75.0, description: 'Anthropic Claude Opus familie' };
  }
  if (norm.includes('claude')) {
    return { input: 3.00, output: 15.0, description: 'Anthropic Claude familie' };
  }
  if (norm.includes('gemini-2') && norm.includes('flash')) {
    return { input: 0.10, output: 0.40, description: 'Google Gemini 2.0 Flash familie' };
  }
  if (norm.includes('gemini') && norm.includes('pro')) {
    return { input: 1.25, output: 5.00, description: 'Google Gemini Pro familie' };
  }
  if (norm.includes('gemini') && norm.includes('flash')) {
    return { input: 0.075, output: 0.30, description: 'Google Gemini Flash familie' };
  }
  if (norm.includes('gemini')) {
    return { input: 0.10, output: 0.40, description: 'Google Gemini familie' };
  }
  if (norm.includes('local') || norm.includes('localhost') || norm.includes('offline') || norm.includes('custom')) {
    return { input: 0.0, output: 0.0, description: 'Lokaal model (geen API kosten)' };
  }

  // Default fallback for unknown cloud LLMs
  return { input: 2.00, output: 8.00, description: 'Standaard modeltarief' };
}

/**
 * Estimates the cost of an LLM query in USD based on input & output token counts.
 */
export function estimateCost(model: string = '', inputTokens: number = 0, outputTokens: number = 0): number {
  const p = getModelPricing(model);
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000; // avoid floating point inaccuracy
}

/**
 * Returns the effective cost in USD: uses stored cost if > 0, otherwise calculates from tokens.
 */
export function getEffectiveCostUsd(
  storedCostUsd: number | undefined | null,
  model: string = '',
  inputTokens: number = 0,
  outputTokens: number = 0
): number {
  if (typeof storedCostUsd === 'number' && storedCostUsd > 0) {
    return storedCostUsd;
  }
  if ((inputTokens || 0) > 0 || (outputTokens || 0) > 0) {
    return estimateCost(model, inputTokens || 0, outputTokens || 0);
  }
  return 0;
}
