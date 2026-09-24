from __future__ import annotations

import argparse
import html
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
from email import policy
from email.parser import BytesParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
LIBREOFFICE_EXTENSIONS = {"doc", "docx", "odt", "rtf", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "html", "htm", "txt", "pdf"}
PANDOC_EXTENSIONS = {"md", "markdown", "html", "htm", "epub", "docx", "odt", "rtf", "txt"}
AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "webm"}
MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "html": "text/html; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
    "epub": "application/epub+zip",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
}
AUDIO_CODEC_ARGS = {
    "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
    "wav": ["-c:a", "pcm_s16le"],
    "m4a": ["-c:a", "aac", "-b:a", "192k"],
    "flac": ["-c:a", "flac"],
    "ogg": ["-c:a", "libvorbis", "-q:a", "5"],
}


def find_tool(*names: str) -> str | None:
    for name in names:
        path = shutil.which(name)
        if path:
            return path
        common_paths = {
            "pandoc": [Path(os.environ.get("LOCALAPPDATA", "")) / "Pandoc" / "pandoc.exe"],
            "soffice": [Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "LibreOffice" / "program" / "soffice.exe"],
            "libreoffice": [Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "LibreOffice" / "program" / "soffice.exe"],
        }.get(name, [])
        for candidate in common_paths:
            if candidate.is_file():
                return str(candidate)
    return None


def tool_status() -> dict[str, str | None]:
    return {
        "libreoffice": find_tool("soffice", "libreoffice"),
        "pandoc": find_tool("pandoc"),
        "ffmpeg": find_tool("ffmpeg"),
    }


def safe_extension(value: str) -> str:
    value = value.lower().lstrip(".")
    if not re.fullmatch(r"[a-z0-9]{1,8}", value):
        raise ValueError("不支持的文件扩展名")
    return value


def safe_filename(value: str) -> str:
    value = Path(value or "input").name
    value = re.sub(r"[^\w.()\-\u4e00-\u9fff ]+", "_", value).strip(" .")
    return value or "input"


def markdown_to_html(raw: bytes, title: str) -> bytes:
    text = raw.decode("utf-8", errors="replace")
    lines = []
    in_list = False
    for line in text.splitlines():
        if line.startswith("### "):
            lines.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("## "):
            lines.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("# "):
            lines.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif re.match(r"^[-*] ", line):
            if not in_list:
                lines.append("<ul>")
                in_list = True
            lines.append(f"<li>{html.escape(line[2:])}</li>")
        else:
            if in_list:
                lines.append("</ul>")
                in_list = False
            if line.strip():
                lines.append(f"<p>{html.escape(line)}</p>")
    if in_list:
        lines.append("</ul>")
    document = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>" + html.escape(title) + "</title></head><body>" + "".join(lines) + "</body></html>"
    return document.encode("utf-8")


def html_to_text(raw: bytes) -> bytes:
    value = raw.decode("utf-8", errors="replace")
    value = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", value, flags=re.I)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</(p|div|h[1-6]|li|tr)\s*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()
    return (value + "\n").encode("utf-8")


def output_path_for(workdir: Path, stem: str, target: str) -> Path:
    expected = workdir / f"{stem}.{target}"
    if expected.exists():
        return expected
    candidates = [item for item in workdir.iterdir() if item.is_file() and item.stem == stem]
    if candidates:
        return candidates[0]
    raise RuntimeError("转换引擎没有生成预期的输出文件")


def run_external_converter(input_path: Path, source: str, target: str, workdir: Path) -> tuple[bytes, str, str]:
    tools = tool_status()
    stem = input_path.stem
    output_path = workdir / f"{stem}.{target}"

    if source in {"md", "markdown"} or target in {"md", "markdown", "epub"}:
        if not tools["pandoc"]:
            raise RuntimeError("当前环境未安装 Pandoc，无法完成该文档转换。可使用 Dockerfile 启动完整引擎。")
        command = [tools["pandoc"], str(input_path), "-o", str(output_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Pandoc 转换失败")
        return output_path.read_bytes(), output_path.name, "Pandoc"

    if source in LIBREOFFICE_EXTENSIONS or target in LIBREOFFICE_EXTENSIONS:
        if not tools["libreoffice"]:
            raise RuntimeError("当前环境未安装 LibreOffice，无法完成该文档转换。可使用 Dockerfile 启动完整引擎。")
        command = [tools["libreoffice"], "--headless", "--convert-to", target, "--outdir", str(workdir), str(input_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "LibreOffice 转换失败")
        converted = output_path_for(workdir, stem, target)
        return converted.read_bytes(), f"{stem}.{target}", "LibreOffice"

    raise RuntimeError(f"暂不支持 {source.upper()} → {target.upper()} 的文档转换")


def convert_document(filename: str, data: bytes, target: str) -> tuple[bytes, str, str, str]:
    source_name = safe_filename(filename)
    source = safe_extension(Path(source_name).suffix or "txt")
    target = safe_extension(target)
    stem = Path(source_name).stem

    if target not in {"pdf", "docx", "pptx", "xlsx", "html", "txt", "epub", "odt", "odp", "ods", "md"}:
        raise ValueError("不支持的目标格式")

    if source in {"md", "markdown", "txt"} and target == "html":
        return markdown_to_html(data, stem), f"{stem}.html", "builtin-markdown", "text/html; charset=utf-8"
    if source in {"html", "htm"} and target == "txt":
        return html_to_text(data), f"{stem}.txt", "builtin-html-text", "text/plain; charset=utf-8"
    if source == target:
        return data, f"{stem}.{target}", "copy", MIME_TYPES.get(target, mimetypes.guess_type(f"x.{target}")[0] or "application/octet-stream")

    with tempfile.TemporaryDirectory(prefix="format-lab-") as temp_dir:
        workdir = Path(temp_dir)
        input_path = workdir / source_name
        input_path.write_bytes(data)
        result, output_name, engine = run_external_converter(input_path, source, target, workdir)
        mime = MIME_TYPES.get(target, mimetypes.guess_type(output_name)[0] or "application/octet-stream")
        return result, output_name, engine, mime


def convert_audio(filename: str, data: bytes, target: str) -> tuple[bytes, str, str, str]:
    source_name = safe_filename(filename)
    source = safe_extension(Path(source_name).suffix or "wav")
    target = safe_extension(target)
    if source not in AUDIO_EXTENSIONS:
        raise ValueError("输入文件不是受支持的音频格式")
    if target not in AUDIO_CODEC_ARGS:
        raise ValueError("音频目标格式仅支持 MP3、WAV、M4A、FLAC、OGG")
    ffmpeg = tool_status()["ffmpeg"]
    if not ffmpeg:
        raise RuntimeError("当前环境未安装 FFmpeg，浏览器端引擎加载失败后无法使用本机兜底。")
    stem = Path(source_name).stem
    with tempfile.TemporaryDirectory(prefix="format-lab-audio-") as temp_dir:
        workdir = Path(temp_dir)
        input_path = workdir / source_name
        output_path = workdir / f"{stem}.__converted__.{target}"
        input_path.write_bytes(data)
        command = [ffmpeg, "-y", "-i", str(input_path), "-vn", *AUDIO_CODEC_ARGS[target], str(output_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if result.returncode != 0 or not output_path.exists():
            detail = result.stderr.strip() or result.stdout.strip() or "FFmpeg 音频转换失败"
            raise RuntimeError(detail[-1200:])
        return output_path.read_bytes(), f"{stem}.{target}", "FFmpeg-server", MIME_TYPES[target]


class FormatLabHandler(SimpleHTTPRequestHandler):
    server_version = "FormatLab/0.2"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status: int, payload: dict) -> None:
        import json

        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/health":
            tools = tool_status()
            self.send_json(200, {"ok": True, "engines": {"libreoffice": bool(tools["libreoffice"]), "pandoc": bool(tools["pandoc"]), "ffmpeg": bool(tools["ffmpeg"]), "builtin": True}})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/convert":
            self.send_json(404, {"error": "接口不存在"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            self.send_json(413, {"error": "文件为空或超过 50 MB 限制"})
            return
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.send_json(400, {"error": "请使用 multipart/form-data 上传文件"})
            return
        body = self.rfile.read(length)
        try:
            message = BytesParser(policy=policy.default).parsebytes((f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode() + body)
            fields: dict[str, str] = {}
            filename = "input.txt"
            data = b""
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name == "file":
                    filename = part.get_filename() or filename
                    data = part.get_payload(decode=True) or b""
                elif name:
                    fields[name] = part.get_content()
            if not data:
                raise ValueError("没有收到文件内容")
            source_extension = safe_extension(Path(safe_filename(filename)).suffix or "txt")
            target = fields.get("target", "pdf")
            if source_extension in AUDIO_EXTENSIONS:
                result, output_name, engine, mime = convert_audio(filename, data, target)
            else:
                result, output_name, engine, mime = convert_document(filename, data, target)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            ascii_name = re.sub(r"[^\x20-\x7e]", "_", safe_filename(output_name))
            self.send_header("Content-Disposition", f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(safe_filename(output_name))}")
            if output_name.isascii():
                self.send_header("X-Output-Filename", output_name)
            self.send_header("X-Conversion-Engine", engine)
            self.send_header("Content-Length", str(len(result)))
            self.end_headers()
            self.wfile.write(result)
        except Exception as error:
            self.send_json(422, {"error": str(error)})


def main() -> None:
    parser = argparse.ArgumentParser(description="Format Lab document conversion server")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), FormatLabHandler)
    print(f"Format Lab server running at http://127.0.0.1:{args.port}/")
    print(f"Engines: {tool_status()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
