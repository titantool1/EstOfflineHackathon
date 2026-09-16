import unittest
from unittest.mock import patch

from search import build_answer, build_scope_filter, generate_answer, infer_doc_types, rrf_merge, safe_source_url


class SearchTests(unittest.TestCase):
    def test_rrf_promotes_results_found_by_both_retrievers(self):
        bm25 = [{"_id": "a"}, {"_id": "b"}, {"_id": "c"}]
        vector = [{"_id": "c"}, {"_id": "d"}, {"_id": "a"}]
        results = rrf_merge([bm25, vector], 4)
        self.assertEqual([item["_id"] for item in results[:2]], ["a", "c"])
        self.assertEqual(results[0]["ranks"], {"bm25": 1, "vector": 3})

    def test_region_filter_includes_region_and_nationwide(self):
        result = build_scope_filter("서울특별시", ["place"])
        self.assertIsNotNone(result)
        text = str(result)
        self.assertIn("서울특별시", text)
        self.assertIn("전국", text)
        self.assertIn("excluded_regions", text)
        self.assertIn("place", text)

    def test_only_http_sources_are_returned(self):
        self.assertIsNone(safe_source_url("javascript:alert(1)"))
        self.assertEqual(
            safe_source_url(["not-a-url", "https://example.com/source"]),
            "https://example.com/source",
        )

    def test_question_intent_selects_document_types(self):
        self.assertEqual(infer_doc_types("내 주변 반납 장소 알려줘"), ["place"])
        self.assertEqual(infer_doc_types("전기차 보조금 신청 자격"), ["policy", "action"])
        self.assertIsNone(infer_doc_types("텀블러 혜택 알려줘"))

    def test_answer_warns_for_place_results(self):
        answer = build_answer(
            "텀블러",
            [{"title": "테스트 카페", "docType": "place", "needsReview": True}],
        )
        self.assertIn("테스트 카페", answer)
        self.assertIn("실제 혜택 지급 여부", answer)

    def test_answer_uses_review_warning_without_place_language(self):
        answer = build_answer(
            "보조금",
            [{"title": "전기차 구매", "docType": "action", "needsReview": True}],
        )
        self.assertIn("최신성 확인", answer)
        self.assertNotIn("장소 등록", answer)

    def test_llm_answer_falls_back_when_api_key_is_missing(self):
        with patch.dict("os.environ", {}, clear=True):
            answer, mode, model = generate_answer(
                "텀블러",
                [{"title": "테스트 카페", "docType": "place", "needsReview": False}],
            )
        self.assertIn("테스트 카페", answer)
        self.assertEqual(mode, "template")
        self.assertIsNone(model)


if __name__ == "__main__":
    unittest.main()
