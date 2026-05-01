from pathlib import Path

from src.utils.blk_loader import parse_blk_file, parse_blk_text


def test_parse_blk_text_supports_pipe_and_space():
    content = "\n".join(
        [
            "600000 PingAn",
            "000001|PingAnBank",
            "300750",
            "600000 PingAn",
        ]
    )
    payload = parse_blk_text(content)
    assert payload["codes"] == ["600000", "000001", "300750"]
    assert payload["invalid_lines"] == []


def test_parse_blk_file_auto_encoding(tmp_path: Path):
    blk_path = tmp_path / "demo.blk"
    blk_path.write_text("600036 招商银行\n000001|平安银行\n", encoding="gbk")
    payload = parse_blk_file(str(blk_path), encoding="auto")
    assert payload["codes"] == ["600036", "000001"]
    assert str(payload["path"]).endswith("demo.blk")
