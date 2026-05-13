import { LlmProviderConfig } from '../src/app/actions/llm';

function parseAndMigrateConfig(value: string): LlmProviderConfig {
  const parsed = JSON.parse(value);
  if (parsed.modules) {
    for (const mod of ['assistant', 'analysis', 'vision'] as const) {
      if (parsed.modules[mod]) {
        const m = parsed.modules[mod].model;
        if (m === 'claude-3-5-sonnet-20241022' || m === 'claude-sonnet-4-6-20260401') {
          parsed.modules[mod].model = 'claude-sonnet-4-6';
        }
      }
    }
  }
  return parsed as LlmProviderConfig;
}

const testVal = '{"provider":"anthropic","apiKey":"sk-ant-123","modules":{"analysis":{"model":"claude-3-5-sonnet-20241022"}}}';
console.log(parseAndMigrateConfig(testVal).modules.analysis.model);
