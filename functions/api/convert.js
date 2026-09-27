const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store' };

function converterBase(env) {
  return String(env?.CONVERTER_API_BASE || '').trim().replace(/\/$/, '');
}

async function proxyConvert(request, base) {
  try {
    const upstream = await fetch(`${base}/api/convert`, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return jsonError(502, `本机转换服务不可达：${error?.message || 'Tunnel 未连接'}`);
  }
}

function safeFilename(value) {
  const base = String(value || 'input').split(/[\\/]/).pop();
  return base.replace(/[^\w.()\-\u4e00-\u9fff ]+/g, '_').trim().replace(/[ .]+$/, '') || 'input';
}

function extension(name) {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : 'txt';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function markdownToHtml(raw, title) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const output = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('### ')) output.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) output.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith('# ')) output.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (/^[-*] /.test(line)) {
      if (!inList) { output.push('<ul>'); inList = true; }
      output.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else {
      if (inList) { output.push('</ul>'); inList = false; }
      if (line.trim()) output.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (inList) output.push('</ul>');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${output.join('')}</body></html>`;
}

function htmlToText(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function fileResponse(data, filename, contentType, engine) {
  const safe = safeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return new Response(data, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      'X-Output-Filename': ascii,
      'X-Conversion-Engine': engine,
    },
  });
}

export async function onRequestPost({ request, env }) {
  const base = converterBase(env);
  if (base) return proxyConvert(request, base);
  try {
    const form = await request.formData();
    const file = form.get('file');
    const target = String(form.get('target') || 'html').toLowerCase().replace(/^\./, '');
    if (!file || typeof file.arrayBuffer !== 'function') return jsonError(400, '没有收到文件内容');
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, '文件超过 100 MB 限制');

    const sourceName = safeFilename(file.name || 'input.txt');
    const source = extension(sourceName);
    const supportedTargets = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'html', 'txt', 'epub', 'odt', 'odp', 'ods', 'md']);
    if (!supportedTargets.has(target)) return jsonError(400, '不支持的目标格式');

    const bytes = await file.arrayBuffer();
    const raw = new TextDecoder().decode(bytes);
    const stem = sourceName.replace(/\.[^.]+$/, '') || 'input';
    if (['md', 'markdown', 'txt'].includes(source) && target === 'html') {
      return fileResponse(markdownToHtml(raw, stem), `${stem}.html`, 'text/html; charset=utf-8', 'Cloudflare Pages builtin');
    }
    if (['html', 'htm'].includes(source) && target === 'txt') {
      return fileResponse(htmlToText(raw), `${stem}.txt`, 'text/plain; charset=utf-8', 'Cloudflare Pages builtin');
    }
    if (source === target) {
      return fileResponse(bytes, `${stem}.${target}`, file.type || 'application/octet-stream', 'Cloudflare Pages copy');
    }

    return jsonError(422, '当前 Cloudflare Pages 版本只提供文本转换接口。DOCX、PPTX、XLSX、PDF、EPUB 等格式需要 LibreOffice/Pandoc 服务端；请使用 Docker 后端或配置外部转换服务。');
  } catch (error) {
    return jsonError(500, error?.message || 'Cloudflare 转换函数执行失败');
  }
}
