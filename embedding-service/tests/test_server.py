import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from server import create_server


class EmbeddingHttpTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        def encode(texts):
            self.calls.append(texts)
            return [[1.0] + [0.0] * 1023 for _ in texts]
        self.server = create_server(("127.0.0.1", 0), "test-token", encode)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, payload=None, token="test-token"):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(f"http://127.0.0.1:{self.server.server_port}{path}", data=data,
                          headers={"X-Eco-Internal-Token": token})
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_health_and_embedding_contract(self):
        status, body = self.request('/health')
        self.assertEqual(status, 200)
        self.assertEqual(body['dimension'], 1024)
        self.assertTrue(body['normalized'])
        status, body = self.request('/embed', {'texts': ['텀블러']})
        self.assertEqual(status, 200)
        self.assertEqual(len(body['vectors'][0]), 1024)
        self.assertEqual(self.calls, [['텀블러']])

    def test_authentication_precedes_inference(self):
        status, _ = self.request('/embed', {'texts': ['질문']}, token='wrong')
        self.assertEqual(status, 401)
        self.assertEqual(self.calls, [])

    def test_invalid_requests_do_not_infer(self):
        for payload in [{}, {'texts': []}, {'texts': ['']}, {'texts': ['a' * 2001]}, {'texts': [1]}]:
            self.assertEqual(self.request('/embed', payload)[0], 400)
        self.assertEqual(self.request('/embed', {'texts': ['a' * 19000]})[0], 413)
        self.assertEqual(self.calls, [])

    def test_unknown_route(self):
        self.assertEqual(self.request('/missing')[0], 404)


if __name__ == '__main__':
    unittest.main()
