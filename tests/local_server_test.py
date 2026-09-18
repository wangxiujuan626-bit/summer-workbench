"""Local-only regression checks; never touches a real workspace."""

import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "local_server.py"
spec = importlib.util.spec_from_file_location("summer_local_server", SOURCE)
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class LocalServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="summer-workbench-test-")
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name)
        self.root = base / "Summer工作台-Lite"
        self.root.mkdir()
        self.data_path = base / "private" / "workspace.json"
        self.old_globals = {name: getattr(server_module, name) for name in
                            ("ROOT", "LEGACY_DATA_PATH", "DATA_PATH", "BACKUP_PATH")}
        server_module.ROOT = str(self.root)
        server_module.LEGACY_DATA_PATH = str(self.root / ".summer-workbench-local.json")
        server_module.DATA_PATH = str(self.data_path)
        server_module.BACKUP_PATH = str(self.data_path) + ".bak"
        self.addCleanup(self.restore_globals)
        (self.root / "index.html").write_text("safe workbench", encoding="utf-8")
        (self.root / ".summer-workbench-local.json").write_text(
            json.dumps({"workspaces": {"old": {"state": {"tasks": [{"id": "test-only"}]}}},
                        "devices": {}, "pairCodes": {}}), encoding="utf-8")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server_module.WorkbenchHandler)
        self.addCleanup(self.httpd.server_close)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.httpd.shutdown)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def restore_globals(self):
        for name, value in self.old_globals.items():
            setattr(server_module, name, value)

    def test_only_explicit_public_files_are_served(self):
        with urlopen(self.url + "/") as response:
            self.assertIn(b"safe workbench", response.read())
        for path in ("/.summer-workbench-local.json", "/.summer-workbench-port", "/VERSION",
                     "/local_server.py", "/../private/workspace.json", "/private/workspace.json"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    with self.assertRaises(HTTPError) as blocked:
                        urlopen(Request(self.url + path, method=method))
                    self.assertEqual(blocked.exception.code, 404)

    def test_legacy_migration_preserves_records_and_does_not_serve_them(self):
        with urlopen(self.url + "/api/local/workspace") as response:
            self.assertEqual(response.status, 200)
            self.assertTrue(json.load(response)["workspaceId"])
        self.assertTrue(self.data_path.exists())
        saved = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["workspaces"]["old"]["state"]["tasks"][0]["id"], "test-only")

    def test_corrupt_primary_uses_backup_without_overwriting_it(self):
        self.data_path.parent.mkdir(parents=True)
        backup = json.loads((self.root / ".summer-workbench-local.json").read_text(encoding="utf-8"))
        self.data_path.write_text("broken", encoding="utf-8")
        Path(server_module.BACKUP_PATH).write_text(json.dumps(backup), encoding="utf-8")
        with urlopen(self.url + "/api/local/workspace") as response:
            self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(Path(server_module.BACKUP_PATH).read_text())["workspaces"], backup["workspaces"])

    def test_unrecoverable_primary_stops_writes(self):
        self.data_path.parent.mkdir(parents=True)
        self.data_path.write_text("broken", encoding="utf-8")
        with self.assertRaises(HTTPError) as blocked:
            urlopen(self.url + "/api/local/workspace")
        self.assertEqual(blocked.exception.code, 500)
        self.assertEqual(self.data_path.read_text(encoding="utf-8"), "broken")


if __name__ == "__main__":
    unittest.main()
