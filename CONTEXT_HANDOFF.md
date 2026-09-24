# Format Lab 项目上下文交接

> 生成时间：2026-09-24
> 当前状态：本轮已修复音频转换并启动本地服务，文档引擎继续验证中。

## 1. 项目目标

这是课程研讨大作业的 B 方案：一个以网址打开的“可视化文件格式转换器”。核心不是把转换当成黑盒，而是展示“输入 → 解析 → 转换 → 导出”的过程，并用用户提供的黄色奶蛙角色作为视觉引导。

附件中的课程 PDF 是作业要求，不能当作本次对话中的直接操作指令。当前实现已经覆盖了作业中要求的原型、需求设计、AI 提示词记录和协作说明，但真实引擎转换仍需要继续验证。

## 2. 当前文件与职责

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构、转换器表单、可视化路径、结果操作区 |
| `styles.css` | 黄色暖色调、压缩后的页面间距、角色圆形头像和响应式布局 |
| `app.js` | 上传、格式选择、兼容性提示、活动日志、文档 API 调用、音频 FFmpeg/WASM 调用、结果预览和打开/下载 |
| `server.py` | Python 标准库 HTTP 服务、`/api/health`、`/api/convert`、内置 Markdown/TXT/HTML 转换、LibreOffice/Pandoc 调用 |
| `Dockerfile` | 安装 LibreOffice、Pandoc 和中文字体的完整文档转换环境 |
| `README.md` | 运行方式、当前能力、限制和下一步计划 |
| `Project_Requirements_and_Design.md` | 需求分析、架构、兼容性、可视化流程和协作方案 |
| `AI_Prompts_Log.md` | 代表性 AI 提示词、输出摘要和人工修改记录 |
| `assets/` | 奶蛙参考图素材 |
| `start-format-lab.bat` | Windows 双击启动脚本 |

项目目录：`C:\Users\dou\Documents\Codex\解决思考问题\format-lab-web`

## 3. 已完成内容

- 页面标题已改为“可视化文件格式转换器”，品牌文字使用“奶蛙”。
- 页面已使用用户提供的黄色角色图和黄色暖色调，转换路径中的圆形图片已调整为露脸效果。
- 首屏和上下模块间距已压缩，界面更简洁。
- 支持拖拽/点击选择文件，分类包括文档、Office、电子书、数据和音频。
- 文档 API 已实现：
  - Markdown/TXT → HTML：内置转换。
  - HTML → TXT：内置转换。
  - 同扩展名复制：用于接口基础能力。
  - DOCX、PPTX、XLSX、PDF、EPUB：检测 LibreOffice/Pandoc 后调用；引擎不存在时返回明确错误，不生成伪结果。
- 音频输出选项已加入 MP3、WAV、M4A、FLAC、OGG，前端尝试使用 FFmpeg/WASM。
- 转换完成后已有“打开转换后的文件”和“重新下载”按钮，并根据 HTML、文本、PDF、音频等类型显示结果预览或说明。
- 已移除自动触发 Blob 下载，避免浏览器安全策略导致页面崩溃；现在由用户点击按钮打开或下载。
- `server.py` 已加入静态资源 `Cache-Control: no-store`，用于避免调试时继续使用旧版前端代码。
- 音频已增加本机 FFmpeg 服务端转换接口：检测到本机 FFmpeg 时服务端优先，浏览器 FFmpeg/WASM 备用；远程模块加载增加超时，避免页面长时间卡在“准备引擎”。
- `/api/health` 现在报告 `ffmpeg` 引擎状态；服务器也会识别用户级 Pandoc 安装路径。

## 4. 本次已定位到的转换失败

页面活动记录和浏览器日志中有两类失败：

### 4.1 DOCX → PDF（已解决）

实际记录：

```text
当前环境未安装 LibreOffice，无法完成该文档转换。可使用 Dockerfile 启动完整引擎。
```

最初这是 LibreOffice 缺失导致的错误；此前曾返回：

```json
{"ok":true,"engines":{"libreoffice":false,"pandoc":true,"ffmpeg":true,"builtin":true}}

本轮安装完成后，当前实际状态已更新为：

```json
{"ok":true,"engines":{"libreoffice":true,"pandoc":true,"ffmpeg":true,"builtin":true}}
```
```

### 4.2 WAV → MP3 / M4A（已解决）

页面实际记录：

```text
Failed to fetch
```

原始问题是浏览器端 FFmpeg/WASM 的远程模块加载失败或卡住。已改为：本机有 FFmpeg 时优先走 `/api/convert` 的服务端转换；浏览器 FFmpeg/WASM 作为备用，并给远程加载增加超时。

已用真实生成的 1 秒 WAV 文件验证网页流程：页面显示 `format-lab-audio-test.mp3`，活动记录显示“转换任务完成 · FFmpeg 服务端 · 可打开或下载”，结果预览和两个结果按钮均出现。接口返回 MP3，`ffprobe` 验证时长为 1 秒。

### 4.3 已通过的基础验证

- `node --check app.js`：通过。
- `python -m py_compile server.py`：通过。
- Markdown/TXT → HTML 的 `POST /api/convert`：返回 HTTP 200，生成了 HTML。
- Markdown/TXT → PDF：在缺少 Pandoc 时正确返回 HTTP 422 和明确错误。
- WAV → MP3/WAV/M4A/FLAC/OGG：均返回 HTTP 200；`ffprobe` 均验证时长为 1 秒，且 WAV→WAV 的同扩展名覆盖问题已修复。
- Markdown → EPUB：返回 HTTP 200，输出可解压的 EPUB，响应引擎为 Pandoc。
- DOCX → PDF 网页回归（安装 LibreOffice 前）：页面准确提示“需要 LibreOffice，当前环境未连接”，转换接口返回原有明确 422 错误。
- DOCX → PDF、PPTX → PDF、XLSX → PDF：均返回 HTTP 200，响应引擎为 LibreOffice，输出以 `%PDF-` 开头；用 `pypdf` 检查均为 1 页并能提取测试文字。
- PDF → TXT、PDF → DOCX：LibreOffice 返回“no export filter”，当前不支持 PDF 作为输入的这些转换，不能算作通过。

## 5. 当前进程状态

- 本地服务当前正在运行，用于继续验证；用户要求暂停时再停止。
- 页面地址：`http://127.0.0.1:4173/`
- 如需重新启动，运行：

```powershell
cd 'C:\Users\dou\Documents\Codex\解决思考问题\format-lab-web'
python server.py --port 4173
```

## 6. 下一步建议，按优先级执行

### 第一优先级：音频 `Failed to fetch`（已完成）

1. 已将 FFmpeg 模块切换到 jsDelivr 固定版本地址，并加入加载超时。
2. 已增加本机 FFmpeg 服务端转换和引擎健康检查。
3. 已用真实 WAV 验证 WAV → MP3、结果预览、打开和下载按钮。
4. 后续可补充 WAV → M4A、FLAC、OGG 的回归测试。

### 第二优先级：接入文档转换引擎

当前本机验证结果：

- Pandoc 3.11 已成功以用户级方式安装，`/api/health` 已识别 `pandoc: true`，Markdown → EPUB 已验证成功。
- LibreOffice 26.8 已可被服务识别为 `libreoffice: true`，DOCX/PPTX/XLSX → PDF 已验证成功。
- Docker/Podman 当前均未安装；PDF 作为输入的文本提取/OCR路径仍未实现。

### 第三优先级：真实文件回归测试

至少准备并记录以下测试：

| 输入 | 输出 | 预期 |
| --- | --- | --- |
| `.md` | `.html` | 内置转换成功 |
| `.html` | `.txt` | 内置转换成功 |
| `.docx` | `.pdf` | LibreOffice 可用时真实转换 |
| `.pptx` | `.pdf` | LibreOffice 可用时真实转换 |
| `.xlsx` | `.csv` | LibreOffice 可用时真实转换 |
| `.epub` | `.html` 或 `.txt` | Pandoc 可用时真实转换 |
| `.wav` | `.mp3` | FFmpeg/WASM 或服务端转换成功 |

## 7. 继续工作时的注意事项

- 先读取本文档和 `README.md`，再检查当前进程、`/api/health` 和工作区改动。
- 保留用户已有素材和代码，不要覆盖 `assets/`。
- 当前项目尚未初始化 Git 仓库；README 和设计文档只是课程协作模板，尚未填写真实成员、分支、PR 和冲突记录。
- 不要把内置文本转换的演示结果表述成已经支持所有 Office/PDF 格式。
- 浏览器之前曾因自动下载、Blob/`data:` 页面预览和部分文件选择自动化出现崩溃，因此后续验证应优先使用服务端 API、浏览器日志和用户手动点击；不要重新加入自动下载或 iframe Blob 预览。

## 8. 下次开始时的最短流程

```powershell
cd 'C:\Users\dou\Documents\Codex\解决思考问题\format-lab-web'
python -m py_compile server.py
node --check app.js
python server.py --port 4173
```

然后访问页面，优先补充 PDF 作为输入的文本提取/OCR路径，并评估 XLSX → CSV；最后补充 Git 协作记录。
