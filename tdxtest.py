from datetime import datetime

import pandas as pd
from mootdx.quotes import Quotes


def _pick_row(df):
    if df is None or getattr(df, "empty", True):
        return {}
    return pd.DataFrame(df).iloc[-1].to_dict()


def _build_snapshot(symbol="000001"):
    # 先用 bestip 追求实时，再回退固定节点，避免某些环境下默认服务器列表异常。
    clients = []
    try:
        clients.append(Quotes.factory(market="std", bestip=True))
    except Exception:
        pass
    fallback_servers = [("119.147.212.81", 7709), ("119.147.212.83", 7709), ("47.92.127.181", 7709)]
    for server in fallback_servers:
        try:
            clients.append(Quotes.factory(market="std", server=server, timeout=6))
        except Exception:
            continue

    last_err = ""
    for client in clients:
        try:
            qdf = client.quotes(symbol=symbol)
            row = _pick_row(qdf)
            if row:
                st = str(row.get("servertime", "")).strip()
                print(
                    f"[RT] {symbol} price={row.get('price')} open={row.get('open')} high={row.get('high')} "
                    f"low={row.get('low')} vol={row.get('vol', row.get('volume'))} amount={row.get('amount')} "
                    f"server_time={st} local_time={datetime.now().strftime('%H:%M:%S')}"
                )
                return
            last_err = "quotes 返回空"
        except Exception as e:
            last_err = str(e)
            continue
    raise RuntimeError(f"实时行情获取失败: {last_err}")


if __name__ == "__main__":
    _build_snapshot("000001")
