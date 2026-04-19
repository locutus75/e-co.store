import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getSession(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session;
}

/** GET /api/ai/analysis?article=8985 — load saved analysis */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const article = request.nextUrl.searchParams.get('article');
  if (!article) return NextResponse.json({ analysis: null });

  const analysis = await prisma.productAiAnalysis.findUnique({
    where: { articleNumber: article },
  });

  return NextResponse.json({ analysis });
}

/** POST /api/ai/analysis — upsert saved analysis for a product */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json() as {
    articleNumber: string;
    provider: string;
    model: string;
    response: string;
    structuredData?: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };

  if (!body.articleNumber || !body.response) {
    return NextResponse.json({ error: 'articleNumber en response zijn verplicht' }, { status: 400 });
  }

  const analysis = await prisma.productAiAnalysis.upsert({
    where:  { articleNumber: body.articleNumber },
    update: { provider: body.provider, model: body.model, response: body.response, structuredData: body.structuredData ?? null, inputTokens: body.inputTokens, outputTokens: body.outputTokens, costUsd: body.costUsd },
    create: { articleNumber: body.articleNumber, provider: body.provider, model: body.model, response: body.response, structuredData: body.structuredData ?? null, inputTokens: body.inputTokens, outputTokens: body.outputTokens, costUsd: body.costUsd },
  });

  return NextResponse.json({ analysis });
}
