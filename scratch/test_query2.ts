import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/ai/query/route';
import { prisma } from '../src/lib/prisma';

// Mock getServerSession
jest.mock('next-auth', () => ({
  getServerSession: async () => ({
    user: { id: 'test-user', roles: ['ADMIN'] }
  })
}));

async function main() {
  const req = new NextRequest('http://localhost/api/ai/query', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'anthropic',
      prompt: 'Test prompt',
      context: 'product-analysis'
    })
  });

  const res = await POST(req);
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
}

main().finally(() => prisma.$disconnect());
