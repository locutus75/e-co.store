import { prisma } from '../src/lib/prisma';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_config_anthropic' } });
  if (!row) return console.log('No anthropic config');
  const config = JSON.parse(row.value);
  if (!config.apiKey) return console.log('No apiKey');

  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  const data = await res.json();
  console.log('Status:', res.status);
  if (!res.ok) {
    console.log('Error:', data);
  } else {
    console.log('Models found:', data.data.length);
    console.log('First 5 models:', data.data.slice(0, 5));
  }
}

main().finally(() => prisma.$disconnect());
