/** Pricing per 1M tokens (USD) — approximate, update as needed */
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o':                     { input: 2.50,  output: 10.0  },
  'gpt-4o-mini':                { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':                { input: 10.0,  output: 30.0  },
  'gpt-3.5-turbo':              { input: 0.50,  output: 1.50  },
  // Anthropic
  'claude-3-5-sonnet-20241022': { input: 3.0,   output: 15.0  },
  'claude-3-5-haiku-20241022':  { input: 0.80,  output: 4.0   },
  'claude-3-opus-20240229':     { input: 15.0,  output: 75.0  },
  // Google
  'gemini-2.0-flash':           { input: 0.10,  output: 0.40  },
  'gemini-1.5-pro':             { input: 1.25,  output: 5.0   },
  'gemini-1.5-flash':           { input: 0.075, output: 0.30  },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
