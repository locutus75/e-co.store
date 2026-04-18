import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getLlmProviderConfigInternal, LlmProvider } from '@/app/actions/llm';

/**
 * GET /api/ai/models?provider=openai|anthropic|gemini
 * Fetches available models from the provider's API using the stored key.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const roles: string[] = (session.user as any)?.roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (!isAdmin) return NextResponse.json({ error: 'Alleen admins' }, { status: 403 });

  const provider = request.nextUrl.searchParams.get('provider') as LlmProvider | null;
  if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
    return NextResponse.json({ error: 'Ongeldige provider' }, { status: 400 });
  }

  const config = await getLlmProviderConfigInternal(provider);
  if (!config?.apiKey) {
    return NextResponse.json({ error: `Geen API key geconfigureerd voor ${provider}. Sla eerst een key op.` }, { status: 400 });
  }

  try {
    let models: { id: string; label: string }[] = [];

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI fout');
      // Only keep chat-capable models (gpt-*, o1-*, o3-*)
      models = (data.data as any[])
        .filter((m: any) => /^(gpt-|o\d)/.test(m.id) && !m.id.includes('instruct') && !m.id.includes('audio') && !m.id.includes('realtime'))
        .sort((a: any, b: any) => b.id.localeCompare(a.id))
        .map((m: any) => ({ id: m.id, label: m.id }));

    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic fout');
      models = (data.data as any[])
        .sort((a: any, b: any) => b.id.localeCompare(a.id))
        .map((m: any) => ({ id: m.id, label: m.display_name ?? m.id }));

    } else if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Gemini fout');
      models = (data.models as any[])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .sort((a: any, b: any) => b.name.localeCompare(a.name))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),   // e.g. "gemini-1.5-pro"
          label: m.displayName ?? m.name.replace('models/', ''),
        }));
    }

    return NextResponse.json({ provider, models });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
