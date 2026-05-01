from pathlib import Path
from typing import Dict, List


def _decode_bytes(raw: bytes, encoding: str = "auto") -> str:
    enc = str(encoding or "auto").strip().lower()
    if enc and enc != "auto":
        return raw.decode(enc, errors="ignore")
    for candidate in ("gbk", "utf-8-sig", "utf-8"):
        try:
            return raw.decode(candidate)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="ignore")


def parse_blk_text(content: str) -> Dict[str, List[str]]:
    codes: List[str] = []
    invalid_lines: List[str] = []
    seen = set()
    for line_no, raw_line in enumerate(str(content or "").splitlines(), start=1):
        line = str(raw_line or "").strip()
        if not line:
            continue
        token = ""
        if "|" in line:
            token = line.split("|", 1)[0].strip()
        else:
            token = line.split()[0].strip()
        code = token.replace("\ufeff", "").upper()
        if not code:
            invalid_lines.append(f"{line_no}:{line}")
            continue
        if code not in seen:
            seen.add(code)
            codes.append(code)
    return {"codes": codes, "invalid_lines": invalid_lines}


def parse_blk_file(file_path: str, encoding: str = "auto") -> Dict[str, List[str]]:
    path = Path(str(file_path or "")).expanduser()
    raw = path.read_bytes()
    text = _decode_bytes(raw, encoding=encoding)
    payload = parse_blk_text(text)
    payload["path"] = str(path.resolve())
    return payload
