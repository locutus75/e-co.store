import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { locateFragment } from '../src/lib/empco';

async function main() {
  const brand = await prisma.brand.findFirst({
    where: { name: { contains: 'Beautiful Story' } }
  });
  if (!brand) return;

  const products = await prisma.product.findMany({
    where: { brandId: brand.id },
    select: {
      internalArticleNumber: true,
      title: true,
      longDescription: true,
      seoTitle: true
    }
  });

  const p16813 = products.find(p => p.internalArticleNumber === '16813');
  console.log('16813 longDesc:');
  console.log(p16813?.longDescription);

  const fragments = [
    "Een mooi en bewust cadeau voor jezelf of een ander, met aandacht voor eerlijke productie, natuurlijke materialen en een duurzame keuze in dagelijks gebruik.",
    "Er wordt vermeden met plastic te werken.",
    "Door hun duurzaamheid en sociaal maatschappelijke impact is A Beautiful Story een B-corp gecertificeerd bedrijf.",
    "Duurzaam notitieboek met kolibrie design van katoenpapier"
  ];

  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    console.log(`\n=== Fragment ${i + 1}: ${f.slice(0, 50)}... ===`);
    const matches = products.filter(p => {
      const texts = [p.longDescription, p.seoTitle].filter(Boolean) as string[];
      return texts.some(t => locateFragment(t, f) !== null);
    });
    console.log(`Found in ${matches.length} products:`, matches.map(m => `#${m.internalArticleNumber} (${m.title})`));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
