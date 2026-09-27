const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    deployment: 'cloudflare-pages',
    engines: { builtin: true, libreoffice: false, pandoc: false, ffmpeg: false },
    capabilities: { browserText: true, browserAudio: true, officeDocuments: false },
  }), { status: 200, headers });
}
