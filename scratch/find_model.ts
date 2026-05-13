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
  if (!res.ok) {
    console.log('Error:', data);
  } else {
    console.log('Models containing 4.6 or sonnet:');
    for (const m of data.data) {
      if (m.id.includes('4-6') || m.id.includes('sonnet') || m.display_name.includes('4.6')) {
        console.log(`- ${m.id} (${m.display_name})`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
