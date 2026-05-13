import { prisma } from '../src/lib/prisma';
import { getLlmProviderConfigInternal } from '../src/app/actions/llm';

async function main() {
  const provider = 'anthropic';
  const moduleId = 'analysis';
  
  const config = await getLlmProviderConfigInternal(provider);
  if (!config) throw new Error('No config');
  
  const moduleCfg = config.modules[moduleId] || config.modules.assistant;
  const modelToUse = moduleCfg.model;
  
  console.log('Model to use:', modelToUse);
  
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelToUse,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hello' }],
    }),
  });
  
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().finally(() => prisma.$disconnect());
