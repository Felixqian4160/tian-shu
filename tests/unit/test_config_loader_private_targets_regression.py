import json

from src.utils.config_loader import ConfigLoader


def _write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def test_targets_private_preferred_and_empty_fallback(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_PRIVATE_PATH", raising=False)

    config_path = tmp_path / "config.json"
    private_path = tmp_path / "config.private.json"

    _write_json(
        config_path,
        {
            "system": {"private_config_path": str(private_path)},
            "targets": ["600000.SH", "000001.SZ"],
        },
    )

    _write_json(private_path, {"targets": ["300750.SZ"]})
    cfg = ConfigLoader.reload(str(config_path))
    assert cfg.get("targets", []) == ["300750.SZ"]

    _write_json(private_path, {"targets": []})
    cfg = ConfigLoader.reload(str(config_path))
    assert cfg.get("targets", []) == ["600000.SH", "000001.SZ"]
