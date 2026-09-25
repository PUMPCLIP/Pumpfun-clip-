#!/usr/bin/env python3
"""Self-hosted video ingest and clipping primitives backed by FFmpeg/ffprobe."""
from __future__ import annotations

import argparse
import json
import ipaddress
import re
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

MAX_SOURCE_BYTES = 512 * 1024 * 1024
MAX_SOURCE_SECONDS = 4 * 60 * 60
ASPECTS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}
ALLOWED_DOMAINS = (
    "youtube.com", "youtu.be", "tiktok.com", "instagram.com", "x.com", "twitter.com",
)


def allowed_video_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().rstrip(".")
        return (
            parsed.scheme == "https"
            and bool(host)
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
            and any(host == domain or host.endswith("." + domain) for domain in ALLOWED_DOMAINS)
        )
    except ValueError:
        return False


def parse_time(value: str) -> float:
    value = value.strip()
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        return float(value)
    parts = value.split(":")
    if len(parts) not in (2, 3) or any(not re.fullmatch(r"\d+(?:\.\d+)?", p) for p in parts):
        raise ValueError(f"Invalid timestamp: {value}")
    nums = [float(p) for p in parts]
    if any(n >= 60 for n in nums[1:]):
        raise ValueError(f"Invalid timestamp: {value}")
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    return nums[0] * 3600 + nums[1] * 60 + nums[2]


def parse_range(instructions: str) -> tuple[float, float] | None:
    """Parse '00:12-00:42', 'from 1:10 to 2:05', or numeric seconds."""
    atom = r"(?:\d{1,3}:\d{2}(?::\d{2}(?:\.\d+)?)?|\d+(?:\.\d+)?)"
    match = re.search(rf"(?<![\w:])({atom})\s*(?:-|–|—|\bto\b|\bthrough\b)\s*({atom})(?![\w:])", instructions, re.I)
    if not match:
        return None
    start, end = parse_time(match.group(1)), parse_time(match.group(2))
    if end <= start or end - start > 180:
        raise ValueError("Select a segment longer than zero and no longer than 180 seconds")
    return start, end


def _run(args: list[str], timeout: int = 3600) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "FFmpeg command failed")[-4000:]
        raise RuntimeError(detail) from exc


def probe_video(path: str | Path) -> dict:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=codec_type,width,height", "-of", "json", str(path),
    ], timeout=60)
    data = json.loads(result.stdout)
    duration = float(data.get("format", {}).get("duration", 0))
    streams = data.get("streams", [])
    if not any(stream.get("codec_type") == "video" for stream in streams):
        raise ValueError("The input does not contain a video stream")
    if duration <= 0 or duration > MAX_SOURCE_SECONDS:
        raise ValueError("Video duration must be at most four hours")
    size = Path(path).stat().st_size
    if size <= 0 or size > MAX_SOURCE_BYTES:
        raise ValueError("Video file must be no larger than 512 MiB")
    return {"duration": duration, "size": size, "streams": streams}


def download_video(url: str, output: str | Path) -> Path:
    if not allowed_video_url(url):
        raise ValueError("Use an HTTPS video URL from YouTube, TikTok, Instagram, or X")
    host = urlparse(url).hostname
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise ValueError("The video host could not be resolved") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("The video URL must resolve only to public internet addresses")
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("Install the pinned packages from requirements-video.txt") from exc

    target = Path(output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    options = {
        "format": "best[ext=mp4]/best",
        "outtmpl": str(target) + ".%(ext)s",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 2,
        "fragment_retries": 2,
        "max_filesize": MAX_SOURCE_BYTES,
        "allowed_extractors": ["Youtube", "TikTok", "Instagram", "Twitter"],
        "cachedir": False,
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        candidates = list(target.parent.glob(target.name + ".*"))
        candidates = [p for p in candidates if p.is_file() and p.suffix.lower() not in (".part", ".ytdl")]
        if not candidates:
            prepared = Path(downloader.prepare_filename(info))
            candidates = [prepared] if prepared.is_file() else []
        if not candidates:
            raise RuntimeError("The video downloader did not produce a source file")
        actual = max(candidates, key=lambda p: p.stat().st_size)
        if actual.stat().st_size > MAX_SOURCE_BYTES:
            actual.unlink(missing_ok=True)
            raise ValueError("Video file must be no larger than 512 MiB")
        actual.replace(target)
    probe_video(target)
    return target


def extract_audio(source: str | Path, output: str | Path, start: float = 0,
                  duration: float | None = None, sample_rate: int = 16000) -> Path:
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if start > 0:
        args += ["-ss", f"{start:.3f}"]
    args += ["-i", str(source)]
    if duration is not None:
        args += ["-t", f"{duration:.3f}"]
    args += ["-vn", "-ac", "1", "-ar", str(sample_rate), "-c:a", "libmp3lame", "-b:a", "64k", str(target)]
    _run(args)
    return target


def chunk_audio(source: str | Path, output_dir: str | Path, chunk_seconds: int = 600,
                sample_rate: int = 16000) -> list[Path]:
    if chunk_seconds < 1 or chunk_seconds > 3600:
        raise ValueError("Chunk length must be between 1 and 3600 seconds")
    duration = probe_video(source)["duration"]
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    offset = 0.0
    index = 0
    while offset < duration:
        target = directory / f"audio-{index:04d}.mp3"
        extract_audio(source, target, offset, min(chunk_seconds, duration - offset), sample_rate)
        if target.stat().st_size:
            chunks.append(target)
        offset += chunk_seconds
        index += 1
    return chunks


def chunk_video(source: str | Path, output_dir: str | Path,
                chunk_seconds: int = 600) -> list[Path]:
    """Split a source into independently playable MP4 time chunks."""
    if chunk_seconds < 1 or chunk_seconds > 3600:
        raise ValueError("Chunk length must be between 1 and 3600 seconds")
    duration = probe_video(source)["duration"]
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    offset = 0.0
    index = 0
    while offset < duration:
        target = directory / f"video-{index:04d}.mp4"
        _run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{offset:.3f}",
            "-i", str(source), "-t", f"{min(chunk_seconds, duration-offset):.3f}",
            "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(target),
        ])
        if target.stat().st_size:
            chunks.append(target)
        offset += chunk_seconds
        index += 1
    return chunks


def _srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    return f"{ms // 3600000:02}:{(ms // 60000) % 60:02}:{(ms // 1000) % 60:02},{ms % 1000:03}"


def _filter_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace(",", "\\,")


def extract_clip(source: str | Path, output: str | Path, start: float, end: float,
                 aspect_ratio: str = "9:16", caption: str = "",
                 caption_style: str = "classic") -> Path:
    if aspect_ratio not in ASPECTS:
        raise ValueError("Aspect ratio must be 9:16, 1:1, or 16:9")
    if not (0 <= start < end) or end - start > 180:
        raise ValueError("Select a segment longer than zero and no longer than 180 seconds")
    metadata = probe_video(source)
    if end > metadata["duration"] + 0.1:
        raise ValueError("Clip end time is beyond the source video duration")

    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    width, height = ASPECTS[aspect_ratio]
    vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"
    if caption.strip():
        safe_caption = re.sub(r"[\r\n<>]", " ", caption)[:200]
        subtitle = target.with_suffix(".srt")
        subtitle.write_text(f"1\n00:00:00,000 --> {_srt_time(end - start)}\n{safe_caption}\n", encoding="utf-8")
        styles = {
            "classic": "FontSize=25,Outline=2,Shadow=1,Alignment=2,MarginV=140",
            "bold": "FontSize=29,Bold=1,Outline=4,Shadow=1,Alignment=2,MarginV=140",
            "signal": "FontSize=27,Bold=1,PrimaryColour=&H0000EFFF,Outline=3,Shadow=1,Alignment=2,MarginV=140",
        }
        style = styles.get(caption_style, styles["classic"]).replace(",", r"\,")
        vf += f",subtitles='{_filter_path(subtitle)}':force_style='{style}'"

    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-ss", f"{start:.3f}", "-t", f"{end - start:.3f}", "-map", "0:v:0", "-map", "0:a?",
        "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(target),
    ])
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    download = sub.add_parser("download")
    download.add_argument("--url", required=True)
    download.add_argument("--output", required=True)
    probe = sub.add_parser("probe")
    probe.add_argument("--input", required=True)
    chunks = sub.add_parser("chunk-video")
    chunks.add_argument("--input", required=True)
    chunks.add_argument("--output-dir", required=True)
    chunks.add_argument("--seconds", type=int, default=600)
    render = sub.add_parser("render")
    render.add_argument("--input", required=True)
    render.add_argument("--output", required=True)
    render.add_argument("--start", type=float)
    render.add_argument("--end", type=float)
    render.add_argument("--instructions", default="")
    render.add_argument("--aspect-ratio", default="9:16", choices=ASPECTS)
    render.add_argument("--caption", default="")
    render.add_argument("--caption-style", default="classic", choices=("classic", "bold", "signal"))
    args = parser.parse_args()
    try:
        if args.command == "download":
            result = download_video(args.url, args.output)
            payload = {"path": str(result), **probe_video(result)}
        elif args.command == "probe":
            payload = probe_video(args.input)
        elif args.command == "chunk-video":
            paths = chunk_video(args.input, args.output_dir, args.seconds)
            payload = {"chunks": [str(item) for item in paths]}
        else:
            metadata = probe_video(args.input)
            start, end = args.start, args.end
            if start is None and end is None:
                parsed = parse_range(args.instructions)
                start, end = parsed if parsed else (0.0, min(30.0, metadata["duration"]))
            elif start is None or end is None:
                raise ValueError("Both clip start and end times are required")
            result = extract_clip(args.input, args.output, start, end,
                                 args.aspect_ratio, args.caption, args.caption_style)
            payload = {"path": str(result), "start": start, "end": end,
                       "duration": end - start, "aspect_ratio": args.aspect_ratio,
                       "source_duration": metadata["duration"]}
        print(json.dumps(payload))
    except Exception as exc:  # CLI boundary: return machine-readable errors for the worker.
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
