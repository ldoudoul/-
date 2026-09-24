const fileInput = document.querySelector('#fileInput');
const dropzone = document.querySelector('#dropzone');
const selectedFile = document.querySelector('#selectedFile');
const fileName = document.querySelector('#fileName');
const fileSize = document.querySelector('#fileSize');
const fileType = document.querySelector('#fileType');
const removeFile = document.querySelector('#removeFile');
const convertButton = document.querySelector('#convertButton');
const formatSelect = document.querySelector('#formatSelect');
const categorySelect = document.querySelector('#categorySelect');
const activityLog = document.querySelector('#activityLog');
const toast = document.querySelector('#toast');
const structureValue = document.querySelector('#structureValue');
const timeValue = document.querySelector('#timeValue');
const privacyValue = document.querySelector('#privacyValue');
const quickFormats = document.querySelector('.quick-formats');
const resultActions = document.querySelector('#resultActions');
const openOutputButton = document.querySelector('#openOutputButton');
const downloadOutputLink = document.querySelector('#downloadOutputLink');
const engineHint = document.querySelector('#engineHint');
const compatibilityHint = document.querySelector('#compatibilityHint');
const resultPreview = document.querySelector('#resultPreview');
const previewBody = document.querySelector('#previewBody');
const previewMeta = document.querySelector('#previewMeta');
let currentFile = null;
let outputObjectUrl = '';
let toastTimer;
let ffmpegRuntimePromise = null;
let documentEngineState = 'checking';
let serverAudioAvailable = false;
let serverEngines = { libreoffice:false, pandoc:false };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000); };
const formatBytes = (bytes) => { if (!bytes) return '0 KB'; const units = ['B','KB','MB','GB']; const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`; };
const extension = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : 'file';
const audioExtensions = ['mp3','wav','m4a','aac','flac','ogg','opus','webm'];
const isAudioFile = (file) => file.type.startsWith('audio/') || audioExtensions.includes(extension(file.name));

function clearOutput() {
  if (outputObjectUrl) URL.revokeObjectURL(outputObjectUrl);
  outputObjectUrl = '';
  resultActions.hidden = true;
  downloadOutputLink.removeAttribute('href');
  resultPreview.hidden = true;
  previewBody.replaceChildren();
  previewMeta.textContent = '等待结果';
}

function renderPreview(blob, name) {
  resultPreview.hidden = false;
  previewMeta.textContent = `${name} · ${formatBytes(blob.size)}`;
  previewBody.replaceChildren();
  const ext = extension(name);
  if (blob.type.startsWith('audio/')) {
    const audio = document.createElement('audio');
    audio.className = 'preview-audio';
    audio.controls = true;
    audio.src = outputObjectUrl;
    audio.setAttribute('aria-label', `${name} 音频预览`);
    previewBody.append(audio);
    return;
  }
  if (blob.type.startsWith('image/')) {
    const image = document.createElement('img');
    image.className = 'preview-image';
    image.src = outputObjectUrl;
    image.alt = `${name} 图片预览`;
    previewBody.append(image);
    return;
  }
  if (['html', 'htm', 'txt', 'md', 'json', 'csv'].includes(ext)) {
    const pre = document.createElement('pre');
    pre.className = 'preview-text';
    pre.textContent = '正在读取预览…';
    previewBody.append(pre);
    blob.text().then((text) => { pre.textContent = ext === 'html' || ext === 'htm' ? `HTML 源码预览\n\n${text.slice(0, 5000)}` : text.slice(0, 5000) || '文件内容为空'; }).catch(() => { pre.textContent = '该文件暂时无法预览，请打开或下载查看。'; });
    return;
  }
  if (ext === 'pdf') {
    const note = document.createElement('div');
    note.className = 'preview-note';
    note.textContent = 'PDF 已生成。当前内嵌浏览器不直接嵌入 PDF，请点击“打开转换后的文件”或“重新下载”。';
    previewBody.append(note);
    return;
  }
  const note = document.createElement('div');
  note.className = 'preview-note';
  note.textContent = `${ext.toUpperCase()} 已生成。浏览器不直接渲染此格式，请点击“打开转换后的文件”或“重新下载”。`;
  previewBody.append(note);
}

function publishOutput(blob, name) {
  clearOutput();
  outputObjectUrl = URL.createObjectURL(blob);
  downloadOutputLink.href = outputObjectUrl;
  downloadOutputLink.download = name;
  resultActions.hidden = false;
  renderPreview(blob, name);
}

function setFile(file) {
  if (!file) return;
  clearOutput();
  currentFile = file;
  const ext = extension(file.name);
  fileName.textContent = file.name;
  fileSize.textContent = `${formatBytes(file.size)} · ${file.type || `.${ext}`}`;
  fileType.textContent = ext.slice(0, 5).toUpperCase();
  selectedFile.hidden = false;
  dropzone.style.display = 'none';
  const audio = isAudioFile(file);
  if (audio) { categorySelect.value = 'audio'; categorySelect.dispatchEvent(new Event('change')); }
  structureValue.textContent = audio ? '音频流 / 采样结构' : ['json','csv'].includes(ext) ? '表格 / 键值结构' : '文档 / 页面结构';
  timeValue.textContent = file.size > 5_000_000 ? '约 10–20 秒' : audio ? '约 5–30 秒' : '约 3–8 秒';
  privacyValue.textContent = '浏览器本地';
  updateCompatibility();
  addLog('file', `已载入 ${file.name}`, `${formatBytes(file.size)} · 等待转换`);
  showToast(audio ? '已识别音频文件，可开始转换' : '文件已加入转换台');
}

fileInput.addEventListener('change', (event) => setFile(event.target.files[0]));
removeFile.addEventListener('click', () => { currentFile = null; fileInput.value = ''; selectedFile.hidden = true; dropzone.style.display = ''; structureValue.textContent = '等待文件输入'; timeValue.textContent = '—'; clearOutput(); updateCompatibility(); showToast('已移除文件'); });
['dragenter','dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));

function formatLabel(value) { const labels = { pdf:'Portable Document', docx:'Word 文档', html:'网页文件', epub:'电子书', json:'数据对象', mp3:'音频压缩', wav:'无损波形', m4a:'AAC 音频', flac:'无损音频', ogg:'开放音频' }; return labels[value] || '输出文件'; }
function updateCompatibility() {
  if (!currentFile) {
    compatibilityHint.className = 'compatibility-hint';
    compatibilityHint.textContent = '选择文件后显示输入格式、目标格式与转换引擎提示';
    return;
  }
  const source = extension(currentFile.name);
  const target = formatSelect.value;
  if (categorySelect.value === 'audio') {
    compatibilityHint.className = 'compatibility-hint compatible';
    compatibilityHint.textContent = `音频：${source.toUpperCase()} → ${target.toUpperCase()} · ${serverAudioAvailable ? '本机 FFmpeg 服务端优先，浏览器 FFmpeg/WASM 备用' : 'FFmpeg/WASM 浏览器本地转换'}`;
    return;
  }
  if (categorySelect.value === 'data') {
    compatibilityHint.className = 'compatibility-hint warning';
    compatibilityHint.textContent = `数据：${source.toUpperCase()} → ${target.toUpperCase()} · 当前为结构化演示转换`;
    return;
  }
  const builtInPair = (['txt', 'md'].includes(source) && target === 'html') || (['html', 'htm'].includes(source) && target === 'txt') || source === target;
  if (builtInPair) {
    compatibilityHint.className = 'compatibility-hint compatible';
    compatibilityHint.textContent = `文档：${source.toUpperCase()} → ${target.toUpperCase()} · 内置文档服务可直接处理`;
    return;
  }
  const pandocPair = ['md', 'markdown'].includes(source) || ['md', 'markdown', 'epub'].includes(target);
  const libreOfficePair = ['doc', 'docx', 'odt', 'rtf', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'ods', 'html', 'htm', 'txt', 'pdf'].includes(source) || ['pdf', 'docx', 'pptx', 'xlsx', 'html', 'txt', 'odt', 'odp', 'ods'].includes(target);
  if ((pandocPair && serverEngines.pandoc) || (!pandocPair && libreOfficePair && serverEngines.libreoffice)) {
    compatibilityHint.className = 'compatibility-hint compatible';
    compatibilityHint.textContent = `文档：${source.toUpperCase()} → ${target.toUpperCase()} · 服务端引擎可尝试真实转换`;
  } else if (pandocPair && !serverEngines.pandoc) {
    compatibilityHint.className = 'compatibility-hint warning';
    compatibilityHint.textContent = `文档：${source.toUpperCase()} → ${target.toUpperCase()} · 需要 Pandoc，当前环境未连接`;
  } else if (libreOfficePair && !serverEngines.libreoffice) {
    compatibilityHint.className = 'compatibility-hint warning';
    compatibilityHint.textContent = `文档：${source.toUpperCase()} → ${target.toUpperCase()} · 需要 LibreOffice，当前环境未连接`;
  } else {
    compatibilityHint.className = 'compatibility-hint warning';
    compatibilityHint.textContent = `文档：${source.toUpperCase()} → ${target.toUpperCase()} · 当前转换组合暂未配置引擎`;
  }
}

function updateFormatOptions() {
  const map = { document:['pdf','docx','html'], office:['pdf','docx'], ebook:['epub','pdf'], data:['html','json'], audio:['mp3','wav','m4a','flac','ogg'] };
  const choices = map[categorySelect.value] || map.document;
  formatSelect.innerHTML = choices.map((value) => `<option value="${value}">${value.toUpperCase()} · ${formatLabel(value)}</option>`).join('');
  const quick = choices.slice(0, 4);
  quickFormats.querySelectorAll('button').forEach((button, index) => { button.dataset.format = quick[index] || choices[0]; button.textContent = (quick[index] || choices[0]).toUpperCase(); button.hidden = index >= quick.length; button.classList.remove('active'); });
  updateCompatibility();
}
document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => { formatSelect.value = button.dataset.format; document.querySelectorAll('[data-format]').forEach((item) => item.classList.toggle('active', item === button)); updateCompatibility(); }));
formatSelect.addEventListener('change', updateCompatibility);
categorySelect.addEventListener('change', updateFormatOptions);
updateFormatOptions();

function updatePath(step) { document.querySelectorAll('.path-node').forEach((node, index) => node.classList.toggle('active', index === step)); document.querySelectorAll('.path-node').forEach((node, index) => node.classList.toggle('done', index < step)); document.querySelector('#pathProgress').style.width = `${Math.max(0, Math.min(100, step / 3 * 100))}%`; }
function addLog(kind, title, detail) { const empty = activityLog.querySelector('.empty-log'); if (empty) empty.remove(); const item = document.createElement('div'); item.className = 'log-item'; const icon = kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'file' ? '↥' : '…'; item.innerHTML = `<div class="log-mark">${icon}</div><div class="log-copy"><strong>${title}</strong><small>${detail}</small></div><span class="log-time">${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span>`; activityLog.prepend(item); }

async function checkDocumentEngine() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('服务未响应');
    const { engines } = await response.json();
    serverAudioAvailable = Boolean(engines.ffmpeg);
    serverEngines = { libreoffice:Boolean(engines.libreoffice), pandoc:Boolean(engines.pandoc) };
    if (engines.libreoffice || engines.pandoc) {
      documentEngineState = 'full';
      engineHint.textContent = `文档引擎已连接 · ${[engines.libreoffice && 'LibreOffice', engines.pandoc && 'Pandoc'].filter(Boolean).join(' + ')}${engines.libreoffice ? '' : '；Office/PDF 仍需 LibreOffice'}；音频${serverAudioAvailable ? '使用本机 FFmpeg，浏览器 FFmpeg/WASM 备用' : '使用 FFmpeg/WASM'}`;
    } else {
      documentEngineState = 'builtin';
      engineHint.textContent = `文档服务已连接 · 当前仅启用内置文本转换，Office/PDF 请用 Docker 启动完整引擎；音频${serverAudioAvailable ? '使用本机 FFmpeg，浏览器 FFmpeg/WASM 备用' : '使用 FFmpeg/WASM'}`;
    }
    updateCompatibility();
  } catch {
    documentEngineState = 'offline';
    serverAudioAvailable = false;
    serverEngines = { libreoffice:false, pandoc:false };
    engineHint.textContent = '文档服务未启动 · 请运行 python server.py 或使用 Docker；音频使用 FFmpeg/WASM';
    updateCompatibility();
  }
}
checkDocumentEngine();

async function loadFFmpeg() {
  if (ffmpegRuntimePromise) return ffmpegRuntimePromise;
  ffmpegRuntimePromise = (async () => {
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await withTimeout(Promise.all([
      withTimeout(import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js'), 8000, 'FFmpeg 模块加载超时'),
      withTimeout(import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js'), 8000, 'FFmpeg 工具模块加载超时'),
    ]), 9000, 'FFmpeg/WASM 远程资源加载超时');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => console.debug('[FFmpeg]', message));
    ffmpeg.on('progress', ({ progress }) => { if (convertButton.disabled) convertButton.querySelector('span').textContent = `音频处理中 ${Math.round(progress * 100)}%`; });
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    const coreURL = await withTimeout(toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'), 10000, 'FFmpeg 核心脚本加载超时');
    const wasmURL = await withTimeout(toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'), 10000, 'FFmpeg WASM 文件加载超时');
    const classWorkerURL = await withTimeout(toBlobURL('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js', 'text/javascript'), 10000, 'FFmpeg Worker 加载超时');
    await withTimeout(ffmpeg.load({ coreURL, wasmURL, classWorkerURL }), 12000, 'FFmpeg/WASM 引擎启动超时');
    return { ffmpeg, fetchFile };
  })().catch((error) => { ffmpegRuntimePromise = null; throw error; });
  return ffmpegRuntimePromise;
}

async function convertAudioWithFFmpeg() {
  const { ffmpeg, fetchFile } = await loadFFmpeg();
  const sourceExtension = extension(currentFile.name);
  const target = formatSelect.value;
  const inputName = `input.${sourceExtension}`;
  const outputName = `output.${target}`;
  const codecArgs = { mp3:['-c:a','libmp3lame','-b:a','192k'], wav:['-c:a','pcm_s16le'], m4a:['-c:a','aac','-b:a','192k'], flac:['-c:a','flac'], ogg:['-c:a','libvorbis','-q:a','5'] };
  await ffmpeg.writeFile(inputName, await fetchFile(currentFile));
  await ffmpeg.exec(['-i', inputName, '-vn', ...(codecArgs[target] || []), outputName]);
  const data = await ffmpeg.readFile(outputName);
  const mime = { mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', flac:'audio/flac', ogg:'audio/ogg' }[target] || 'application/octet-stream';
  const blob = new Blob([data.buffer], { type:mime });
  const outputFileName = `${currentFile.name.replace(/\.[^.]+$/,'')}.${target}`;
  publishOutput(blob, outputFileName);
  try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); } catch { /* 清理失败不影响已生成结果 */ }
  return { real:true, outputFileName };
}

async function convertAudioWithServer() {
  const form = new FormData();
  form.append('file', currentFile, currentFile.name);
  form.append('target', formatSelect.value);
  const response = await fetch('/api/convert', { method:'POST', body:form });
  if (!response.ok) {
    let message = '本机 FFmpeg 音频服务返回错误';
    try { message = (await response.json()).error || message; } catch { /* 保留默认错误 */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const outputFileName = response.headers.get('X-Output-Filename') || `${currentFile.name.replace(/\.[^.]+$/,'')}.${formatSelect.value}`;
  const engineHeader = response.headers.get('X-Conversion-Engine');
  const engine = engineHeader === 'FFmpeg-server' ? 'FFmpeg 服务端' : (engineHeader || 'FFmpeg 服务端');
  publishOutput(blob, outputFileName);
  return { real:true, outputFileName, engine };
}

async function convertAudio() {
  if (serverAudioAvailable) {
    addLog('process', '使用本机音频引擎', '检测到本机 FFmpeg，优先使用本地服务端转换');
    try {
      return await convertAudioWithServer();
    } catch (serverError) {
      addLog('process', '切换浏览器音频引擎', '本机 FFmpeg 转换失败，尝试 FFmpeg/WASM');
      console.warn('本机 FFmpeg 转换失败，尝试 FFmpeg/WASM', serverError);
    }
  }
  try {
    return await convertAudioWithFFmpeg();
  } catch (error) {
    throw error;
  }
}

async function makeDemoOutput() {
  const target = formatSelect.value;
  if (currentFile && ['txt','md'].includes(extension(currentFile.name)) && target === 'html') {
    const text = await currentFile.text();
    const safe = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','<br>');
    const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>Format Lab 输出</title><main>${safe}</main>`], { type:'text/html' });
    const outputFileName = `${currentFile.name.replace(/\.[^.]+$/,'')}.html`;
    publishOutput(blob, outputFileName);
    return { real:true, outputFileName };
  }
  const sourceName = currentFile?.name || 'demo-file';
  const content = `Format Lab 初版体验输出\n\n输入文件：${sourceName}\n目标格式：${target.toUpperCase()}\n转换链路：识别 → 解析 → 转换 → 导出\n说明：文档转换引擎仍在接入中。`;
  const outputFileName = `${sourceName.replace(/\.[^.]+$/,'')}-format-lab-demo.txt`;
  publishOutput(new Blob([content], { type:'text/plain;charset=utf-8' }), outputFileName);
  return { real:false, outputFileName };
}

async function convertDocumentWithServer() {
  const form = new FormData();
  form.append('file', currentFile, currentFile.name);
  form.append('target', formatSelect.value);
  const response = await fetch('/api/convert', { method:'POST', body:form });
  if (!response.ok) {
    let message = '文档转换服务返回错误';
    try { message = (await response.json()).error || message; } catch { /* 保留默认错误 */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const outputFileName = response.headers.get('X-Output-Filename') || `${currentFile.name.replace(/\.[^.]+$/,'')}.${formatSelect.value}`;
  const engine = response.headers.get('X-Conversion-Engine') || '文档转换服务';
  publishOutput(blob, outputFileName);
  return { real:true, outputFileName, engine };
}

openOutputButton.addEventListener('click', () => { if (outputObjectUrl) window.open(outputObjectUrl, '_blank', 'noopener,noreferrer'); });

convertButton.addEventListener('click', async () => {
  if (!currentFile) { showToast('请先选择一个文件'); dropzone.animate([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:250}); return; }
  convertButton.disabled = true; clearOutput(); const original = convertButton.innerHTML; const labels = ['识别文件…','解析结构…','重组数据…','准备引擎…'];
  addLog('process', '转换任务已开始', `${currentFile.name} → ${formatSelect.value.toUpperCase()}`);
  try {
    for (let step = 0; step < labels.length; step += 1) { updatePath(step); convertButton.querySelector('span').textContent = labels[step]; await sleep(520); }
    const result = categorySelect.value === 'audio' ? await convertAudio() : categorySelect.value === 'data' ? await makeDemoOutput() : await convertDocumentWithServer();
    updatePath(3); convertButton.querySelector('span').textContent = '转换完成';
    addLog('success', '转换任务完成', `${result.outputFileName} 已生成 · ${result.engine || '内置转换'} · 可打开或下载`);
    showToast(result.real ? '转换完成，可打开结果文件' : '演示结果已生成，可打开结果文件');
  } catch (error) {
    updatePath(0); addLog('error', '转换失败', error.message || 'FFmpeg/WASM 引擎加载失败'); showToast('转换失败，请检查网络或文件格式'); console.error(error);
  } finally {
    await sleep(500); convertButton.innerHTML = original; convertButton.disabled = false;
  }
});

document.querySelector('#clearLog').addEventListener('click', () => { activityLog.innerHTML = '<div class="empty-log"><span>✦</span><p>每一次转换都会在这里留下足迹。</p><small>选择文件后开始体验</small></div>'; showToast('记录已清空'); });
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior:'smooth' })));
