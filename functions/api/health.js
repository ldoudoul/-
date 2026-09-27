const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function converterBase(env) {
  return String(env?.CONVERTER_API_BASE || '').trim().replace(/\/$/, '');
}

async function proxyHealth(request, base) {
  try {
    const upstream = await fetch(`${base}/api/health`, { method: 'GET', headers: request.headers });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: `本机转换服务不可达：${error?.message || 'Tunnel 未连接'}` }), { status: 502, headers });
  }
}

export async function onRequestGet({ request, env }) {
  const base = converterBase(env);
  if (base) return proxyHealth(request, base);
  return new Response(JSON.stringify({
    ok: true,
    deployment: 'cloudflare-pages',
    engines: { builtin: true, libreoffice: false, pandoc: false, ffmpeg: false },
    capabilities: { browserText: true, browserAudio: true, officeDocuments: false },
  }), { status: 200, headers });
}
