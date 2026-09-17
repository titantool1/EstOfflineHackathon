import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LocalSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eco-env-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ["scripts/setup-local.py", ".env.example", "frontend/.env.local.example"]:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def run_setup(self, *args):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/setup-local.py"), *map(str, args)],
            capture_output=True, text=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def configs(self):
        return tuple((self.root / name).read_text() for name in [".env", "frontend/.env.local"])

    def test_initialization_is_repeatable_and_keeps_user_settings(self):
        self.assertEqual(self.run_setup().returncode, 0)
        root_config, _ = self.configs()
        self.assertNotIn("__GENERATE_SECRET__", root_config)
        self.assertIn("POSTGRES_PASSWORD=", root_config)
        (self.root / ".env").write_text(root_config.replace("POSTGRES_PORT=55433", "POSTGRES_PORT=55499") + "MY_SETTING=keep\n")
        before = self.configs()
        self.assertEqual(self.run_setup().returncode, 0)
        self.assertEqual(self.configs(), before)

    def test_internal_token_is_generated_once_and_not_printed(self):
        first = self.run_setup()
        token_file = self.root / ".local/ai-internal-token"
        token = token_file.read_text().strip()
        self.assertEqual(len(token), 64)
        self.assertNotIn(token, first.stdout + first.stderr)
        self.assertEqual(self.run_setup().returncode, 0)
        self.assertEqual(token_file.read_text().strip(), token)

    def test_import_bom_crlf_and_preserve_blank_keys_without_echoing_values(self):
        keys = self.root / "keys.txt"
        keys.write_bytes(b'\xef\xbb\xbf# team keys\r\nOPENAI_API_KEY="test-only-openai"\r\nKAKAO_REST_API_KEY=test-only-rest\r\nNEXT_PUBLIC_KAKAO_MAP_KEY=test-only-map\r\nGOV24_API_KEY=test-only-gov\r\n')
        result = self.run_setup("--api-keys", keys)
        self.assertEqual(result.returncode, 0, result.stdout)
        root_config, frontend = self.configs()
        self.assertIn("OPENAI_API_KEY=test-only-openai", root_config)
        self.assertIn("OPENAI_API_KEY=test-only-openai", frontend)
        self.assertIn("NEXT_PUBLIC_KAKAO_MAP_KEY=test-only-map", root_config)
        self.assertIn("NEXT_PUBLIC_KAKAO_MAP_KEY=test-only-map", frontend)
        self.assertNotIn("NEXT_PUBLIC_OPENAI", frontend)
        self.assertIn("GOV24_API_KEY=test-only-gov", root_config)
        self.assertIn("GOV24_API_KEY=test-only-gov", frontend)
        for value in ["test-only-openai", "test-only-rest", "test-only-map", "test-only-gov"]:
            self.assertNotIn(value, result.stdout + result.stderr)
        before = self.configs()
        keys.write_text("OPENAI_API_KEY=\nKAKAO_REST_API_KEY=\n")
        self.assertEqual(self.run_setup("--api-keys", keys).returncode, 0)
        self.assertEqual(self.configs(), before)

    def test_invalid_import_leaves_both_files_unchanged(self):
        self.assertEqual(self.run_setup().returncode, 0)
        before = self.configs()
        invalid = [
            "OPENAI_API_KEY=one\nOPENAI_API_KEY=two\n",
            "NEXT_PUBLIC_OPENAI_API_KEY=private\n",
            "OPENAI_API_KEY=$(touch marker)\n",
            "not an assignment\n",
        ]
        for text in invalid:
            with self.subTest(text=text):
                keys = self.root / "invalid.txt"
                keys.write_text(text)
                result = self.run_setup("--api-keys", keys)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self.configs(), before)
                self.assertNotIn(text.strip(), result.stdout + result.stderr)
        self.assertFalse((self.root / "marker").exists())


if __name__ == "__main__":
    unittest.main()
