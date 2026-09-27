# Format Lab · 可视化文件格式转换器

这是课程作业的 B 方案 Web 原型。项目不把格式转换当作不可见的黑盒，而是把一次转换拆成“输入 → 解析 → 转换 → 导出”四个阶段，用奶蛙角色作为流程引导，并在页面中展示活动记录、兼容性提示和结果预览。

## 当前版本

- 已完成响应式页面、拖拽上传、输出格式选择、转换路径动画和活动记录。
- 已加入音频转换类别，支持 MP3、WAV、M4A、FLAC、OGG 输出；检测到本机 FFmpeg 时优先通过本地服务端转换，浏览器端 `ffmpeg.wasm` 作为备用。
- 文档转换已接入本地 `server.py` 服务：Markdown/TXT → HTML、HTML → TXT 使用内置转换器；Office、PDF、EPUB 等由 LibreOffice/Pandoc 接管（引擎存在时）。
- 转换完成后提供“打开转换后的文件”和“重新下载”按钮，并根据结果类型提供 HTML/PDF、文本、音频或格式说明预览。
- 转换前会显示输入格式、输出格式、可用引擎和兼容性提示，避免把演示输出误认为真实转换结果。
- 页面采用奶蛙参考图的黄色暖色调，压缩首屏和模块间距，路径卡片使用露脸的圆形角色图。

## 本地运行

在本目录启动带文档接口的本地服务器：

```bash
python server.py --port 4173
```

Windows 用户也可以双击 `start-format-lab.bat` 启动服务。

然后打开 <http://localhost:4173>。

服务器会通过 `/api/health` 报告可用引擎，并通过 `POST /api/convert` 接收文件和目标格式：

- Markdown/TXT → HTML、HTML → TXT 使用内置转换器；
- DOCX、PPTX、XLSX、PDF、EPUB 等格式由 LibreOffice/Pandoc 接管；
- 当前开发电脑已检测到 Pandoc 3.11 和 LibreOffice 26.8，Office → PDF 转换会调用 LibreOffice；服务会按实际引擎状态给出提示，不会生成伪结果；
- 音频转换优先经过本地 Python 服务调用 FFmpeg，浏览器端 FFmpeg/WASM 作为备用，不上传云端。

当前版本可以直接用于 Markdown/TXT → HTML、HTML → TXT、Markdown → EPUB、DOCX/PPTX/XLSX → PDF 和音频格式转换；PDF 作为输入时仍受 LibreOffice 导入过滤器限制。

## Cloudflare Pages 部署说明

项目新增了 `functions/api/health.js` 和 `functions/api/convert.js`。通过 GitHub 连接部署 Cloudflare Pages 时，Pages Functions 会提供线上 `/api/health` 和 `/api/convert`，TXT/MD/HTML 文本转换可以直接在网址中使用，音频转换由浏览器 FFmpeg/WASM 完成。

Cloudflare Pages/Workers 不会运行本项目的 Python `server.py`，也不能在免费 Functions 中直接启动 LibreOffice 或 Pandoc。因此 DOCX、PPTX、XLSX、PDF、EPUB 等完整文档转换仍需要 Docker 后端或单独的外部转换服务。Cloudflare 控制台的“直接上传”不包含 Pages Functions；需要使用 GitHub 部署，并确保生产分支包含 `functions/` 目录。

## Docker 启动完整文档引擎

当前目录提供 `Dockerfile`。在安装 Docker 的环境中运行：

```bash
docker build -t format-lab .
docker run --rm -p 4173:4173 format-lab
```

容器会安装 LibreOffice、Pandoc 和中文字体，从而可以验证 Office/PDF/EPUB 的真实服务端转换。

## 课程提交材料

- [Project_Requirements_and_Design.md](./Project_Requirements_and_Design.md)：需求分析、设计方案、技术架构、兼容性规则和协作分工。
- [AI_Prompts_Log.md](./AI_Prompts_Log.md)：代表性 AI 提示词、输出摘要和人工修改记录。
- `index.html`、`styles.css`、`app.js`：前端页面与交互逻辑。
- `server.py`、`Dockerfile`：文档转换接口和完整引擎部署方案。
- `assets/`：用户提供的奶蛙角色参考素材。

## 下一步计划

- [x] 增加转换前后文件预览与格式兼容性提示。
- [x] 接入浏览器端 FFmpeg/WASM 音频转换和本地文档转换接口。
- [x] 补充需求设计、AI 提示词记录和 Git 协作说明。
- [x] 在本机验证 Pandoc 真实转换：Markdown → EPUB。
- [x] 接入 LibreOffice，并验证 DOCX/PPTX/XLSX → PDF 的真实转换。
- [ ] 增加 PDF 作为输入的专用文本提取或 OCR 转换路径。
- [x] 修复音频远程 FFmpeg/WASM 加载失败时的本机 FFmpeg 服务端兜底，并验证 WAV → MP3/WAV/M4A/FLAC/OGG。
- [ ] 根据课程小组的实际成员、分支、PR 和冲突记录补充最终提交信息。

## 参考素材

页面中的角色图片来自用户提供的参考图，仅用于本项目原型的视觉设计。
