#!/usr/bin/env python3
"""Serve the local workbench and provide same-Wi-Fi pairing/sync APIs."""

import json
import os
import secrets
import shutil
import socket
import sys
import time
import threading
import uuid
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


ROOT = os.path.dirname(os.path.abspath(__file__))
LEGACY_DATA_PATH = os.path.join(ROOT, ".summer-workbench-local.json")


def default_data_path():
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "SummerWorkbench", "workspace.json")


DATA_PATH = os.environ.get("SUMMER_WORKBENCH_DATA_PATH", default_data_path())
BACKUP_PATH = f"{DATA_PATH}.bak"
DEVICE_COOKIE = "summer_local_device"
MAX_BODY = 2_000_000
PORT = int(os.environ.get("SUMMER_WORKBENCH_PORT", "8765"))
ACTIVE_PORT = PORT
PORT_FILE = os.path.join(ROOT, ".summer-workbench-port")
PAIR_TTL_MS = 10 * 60 * 1000
PUBLIC_FILES = {
    "/index.html", "/app.js", "/ai-connector.js", "/avatar-default.svg",
    "/cola.js", "/day-rollover.js", "/favicon.svg", "/file.svg",
    "/globe.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest",
    "/qr.js", "/styles.css", "/sw.js", "/sync.js", "/update.json",
    "/window.svg",
}


def clean_name(value):
    return str(value or "").strip().replace("<", "").replace(">", "")[:16]


def clean_state(value):
    if not isinstance(value, dict):
        return {}
    encoded = json.dumps(value, ensure_ascii=False)
    if len(encoded) > 250_000:
        raise ValueError("工作台记录太大，已拒绝本次同步")
    return value


def empty_data():
    return {"workspaces": {}, "devices": {}, "pairCodes": {}}


def read_valid_data(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not all(isinstance(data.get(key), dict) for key in ("workspaces", "devices", "pairCodes")):
        raise ValueError("工作台数据格式不正确")
    return data


def legacy_data_paths():
    paths = [LEGACY_DATA_PATH]
    parent = os.path.dirname(ROOT)
    try:
        for entry in os.scandir(parent):
            candidate = os.path.join(entry.path, ".summer-workbench-local.json")
            if entry.is_dir() and candidate not in paths and os.path.exists(candidate):
                paths.append(candidate)
    except OSError:
        pass
    return paths


def load_data():
    if os.path.exists(DATA_PATH):
        try:
            return read_valid_data(DATA_PATH)
        except (OSError, ValueError):
            try:
                return read_valid_data(BACKUP_PATH)
            except (OSError, ValueError):
                raise ValueError("本地记录无法读取，已停止写入以保护原文件；请先备份并检查数据文件")
    for candidate in [*legacy_data_paths(), BACKUP_PATH]:
        try:
            return read_valid_data(candidate)
        except (OSError, ValueError):
            continue
    return empty_data()


def save_data(data):
    temporary = f"{DATA_PATH}.tmp"
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    if os.path.exists(DATA_PATH):
        try:
            read_valid_data(DATA_PATH)
            shutil.copyfile(DATA_PATH, BACKUP_PATH)
        except (OSError, ValueError):
            pass
    os.replace(temporary, DATA_PATH)


def now_ms():
    return int(time.time() * 1000)


def prune_pair_codes(data):
    current = now_ms()
    for code, pair in list(data["pairCodes"].items()):
        if not isinstance(pair, dict) or int(pair.get("expiresAt", 0)) < current:
            del data["pairCodes"][code]


def new_workspace():
    timestamp = now_ms()
    return {
        "displayName": "",
        "avatarUrl": "/avatar-default.svg",
        "state": {},
        "revision": 1,
        "updatedAt": timestamp,
    }


def ensure_device(data, token=None):
    if token and token in data["devices"]:
        device = data["devices"][token]
        device["lastSeenAt"] = now_ms()
        return token, device, False
    token = secrets.token_urlsafe(24)
    workspace_id = str(uuid.uuid4())
    data["devices"][token] = {
        "workspaceId": workspace_id,
        "lastSeenAt": now_ms(),
    }
    data["workspaces"][workspace_id] = new_workspace()
    return token, data["devices"][token], True


def workspace_payload(data, workspace_id):
    workspace = data["workspaces"].get(workspace_id) or new_workspace()
    return {
        "workspaceId": workspace_id,
        "displayName": workspace.get("displayName", ""),
        "avatarUrl": workspace.get("avatarUrl") or "/avatar-default.svg",
        "state": workspace.get("state") or {},
        "revision": int(workspace.get("revision", 1)),
        "updatedAt": int(workspace.get("updatedAt", now_ms())),
    }


def local_ip():
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.0.2.1", 80))
        address = probe.getsockname()[0]
        probe.close()
        return address
    except OSError:
        return "127.0.0.1"


def lan_url():
    return f"http://{local_ip()}:{ACTIVE_PORT}/"


class WorkbenchHandler(SimpleHTTPRequestHandler):
    server_version = "SummerWorkbenchLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format_string, *args):
        if self.path.startswith("/api/local/"):
            return
        super().log_message(format_string, *args)

    def send_json(self, status, payload, token=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if token:
            self.send_header("Set-Cookie", f"{DEVICE_COOKIE}={token}; Path=/; Max-Age=31536000; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("工作台数据太大，已拒绝本次同步")
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def device_token(self):
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        return cookies.get(DEVICE_COOKIE).value if cookies.get(DEVICE_COOKIE) else None

    def api(self):
        parsed = urlparse(self.path)
        return parsed.path if parsed.path.startswith("/api/local/") else None

    def serve_public_file(self, head=False):
        path = urlparse(self.path).path
        if path == "/":
            path = "/index.html"
        if path not in PUBLIC_FILES:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.path = path
        if head:
            super().do_HEAD()
        else:
            super().do_GET()

    def do_HEAD(self):
        self.serve_public_file(head=True)

    def do_OPTIONS(self):
        if self.api():
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.end_headers()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_GET(self):
        path = self.api()
        if not path:
            return self.serve_public_file()
        with open_lock():
            try:
                data = load_data()
            except ValueError as error:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
                return
            token, device, is_new = ensure_device(data, self.device_token())
            if path == "/api/local/health":
                save_data(data)
                self.send_json(HTTPStatus.OK, {"ok": True, "mode": "local-lan", "lanUrl": lan_url()}, token if is_new else None)
                return
            if path == "/api/local/workspace":
                save_data(data)
                self.send_json(HTTPStatus.OK, workspace_payload(data, device["workspaceId"]), token if is_new else None)
                return
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "本地同步地址不存在"})

    def do_POST(self):
        path = self.api()
        if not path:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            body = self.read_json()
            with open_lock():
                data = load_data()
                prune_pair_codes(data)
                token, device, is_new = ensure_device(data, self.device_token())
                if path == "/api/local/pair/start":
                    code = f"{secrets.randbelow(1_000_000):06d}"
                    expires_at = now_ms() + PAIR_TTL_MS
                    data["pairCodes"][code] = {
                        "workspaceId": device["workspaceId"],
                        "creatorToken": token,
                        "expiresAt": expires_at,
                        "joinedTokens": [],
                    }
                    save_data(data)
                    self.send_json(HTTPStatus.OK, {
                        "code": code,
                        "expiresAt": expires_at,
                        "lanUrl": lan_url(),
                        "pairUrl": f"{lan_url()}?pair={code}",
                    }, token if is_new else None)
                    return
                if path == "/api/local/pair/join":
                    code = str(body.get("code", "")).replace(" ", "")
                    pair = data["pairCodes"].get(code)
                    if not pair or pair["expiresAt"] < now_ms():
                        self.send_json(HTTPStatus.BAD_REQUEST, {"error": "同步码无效或已过期"}, token if is_new else None)
                        return
                    if pair["creatorToken"] == token:
                        self.send_json(HTTPStatus.BAD_REQUEST, {"error": "不能连接当前这台设备"}, token if is_new else None)
                        return
                    device["workspaceId"] = pair["workspaceId"]
                    # Keep the short-lived handoff code alive so a QR opened
                    # inside WeChat can be continued in Safari/Chrome before
                    # the user adds the page to the home screen. Reusing the
                    # code from the same browser is harmless and avoids a
                    # second blank workspace during the handoff.
                    joined_tokens = pair.setdefault("joinedTokens", [])
                    if token not in joined_tokens:
                        joined_tokens.append(token)
                    save_data(data)
                    self.send_json(HTTPStatus.OK, {"workspace": workspace_payload(data, device["workspaceId"])}, token if is_new else None)
                    return
                if path == "/api/local/reset":
                    data["workspaces"][device["workspaceId"]] = new_workspace()
                    save_data(data)
                    self.send_json(HTTPStatus.OK, workspace_payload(data, device["workspaceId"]), token if is_new else None)
                    return
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "本地同步地址不存在"})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "请求格式不正确"})

    def do_PUT(self):
        path = self.api()
        if path != "/api/local/workspace":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            body = self.read_json()
            with open_lock():
                data = load_data()
                token, device, is_new = ensure_device(data, self.device_token())
                current = workspace_payload(data, device["workspaceId"])
                requested_revision = int(body.get("revision", 0))
                if requested_revision != current["revision"]:
                    self.send_json(HTTPStatus.CONFLICT, {"error": "另一台设备已有更新", "workspace": current}, token if is_new else None)
                    return
                avatar_url = str(body.get("avatarUrl") or current["avatarUrl"])
                if len(avatar_url) > 1_500_000:
                    raise ValueError("头像文件太大，请换一张小一点的图片")
                workspace = data["workspaces"][device["workspaceId"]]
                workspace.update({
                    "displayName": clean_name(body.get("displayName")),
                    "avatarUrl": avatar_url,
                    "state": clean_state(body.get("state")),
                    "revision": current["revision"] + 1,
                    "updatedAt": now_ms(),
                })
                save_data(data)
                self.send_json(HTTPStatus.OK, workspace_payload(data, device["workspaceId"]), token if is_new else None)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "请求格式不正确"})


_lock = threading.Lock()


def open_lock():
    return _lock


if __name__ == "__main__":
    ACTIVE_PORT = PORT
    os.makedirs(ROOT, exist_ok=True)
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), WorkbenchHandler)
    except OSError as error:
        print(f"工作台端口 {PORT} 已被占用或无法使用。请先关闭旧版工作台，保护同一份记录不被两个程序同时写入：{error}", file=sys.stderr, flush=True)
        sys.exit(1)
    ACTIVE_PORT = server.server_address[1]
    with open(PORT_FILE, "w", encoding="utf-8") as handle:
        handle.write(str(ACTIVE_PORT))
    print(f"Summer 工作台已启动: http://127.0.0.1:{ACTIVE_PORT}/", flush=True)
    print(f"同一 Wi-Fi 的手机打开: {lan_url()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        try:
            os.remove(PORT_FILE)
        except OSError:
            pass
