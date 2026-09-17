from __future__ import annotations

from typing import Any, Iterable


INTEREST_RULES: dict[str, dict[str, Any]] = {
    "green-mobility": {
        "title": "교통비·친환경 이동",
        "description": "대중교통·자전거·친환경차",
        "program_ids": ["G003", "G008", "SDG-ZEV-2026", "G007"],
    },
    "green-shopping": {
        "title": "친환경 쇼핑·장보기",
        "description": "친환경제품·먹거리 할인",
        "program_ids": ["G004", "G034", "G035", "G024", "KR-CNP-GREEN-2026"],
    },
    "energy-saving": {
        "title": "전기·난방비 절약",
        "description": "절약·캐시백·요금 지원",
        "program_ids": [
            "G021", "G031", "G048", "G070", "G075", "G080", "SEOUL-EM-BLDG-2026",
        ],
    },
    "home-upgrade": {
        "title": "집·가전 개선",
        "description": "고효율가전·주택·태양광",
        "program_ids": [
            "G022", "G027", "G047", "G101", "SDG-FOOD-REDUCER-H2-2026",
        ],
    },
    "waste-reduction": {
        "title": "재활용·쓰레기 줄이기",
        "description": "폐가전·빈병·음식물",
        "program_ids": [
            "G038", "G042", "SDG-FOOD-REDUCER-H2-2026", "KR-CNP-GREEN-2026",
            "SEOUL-EM-GREEN-2026",
        ],
    },
    "eco-learning": {
        "title": "환경 체험·배우기",
        "description": "교육·체험·기후행동",
        "program_ids": ["G002", "G039", "G117", "G007", "SEOUL-EM-GREEN-2026"],
    },
}

UNSURE_INTEREST_ID = "unsure"
STARTER_PROGRAM_IDS = ["G007", "G008", "G024", "G035", "G038", "G042", "G117"]

PLACE_TYPE_INTERESTS = {
    "따릉이대여소": ["green-mobility"],
    "프랜차이즈카페": ["green-shopping"],
    "프랜차이즈베이커리": ["green-shopping"],
    "개인컵할인카페": ["green-shopping"],
    "제로웨이스트상점": ["green-shopping", "waste-reduction"],
    "리필판매기": ["green-shopping", "waste-reduction"],
    "제로식당": ["waste-reduction"],
}

ACTION_INTERESTS = {
    "KR-CNP-GREEN-2026-A01": ["green-shopping"],
    "KR-CNP-GREEN-2026-A02": ["green-shopping", "waste-reduction"],
    "KR-CNP-GREEN-2026-A03": ["waste-reduction"],
    "KR-CNP-GREEN-2026-A04": ["green-shopping", "waste-reduction"],
    "KR-CNP-GREEN-2026-A05": ["waste-reduction"],
    "KR-CNP-GREEN-2026-A06": ["green-mobility"],
    "KR-CNP-GREEN-2026-A07": ["green-shopping"],
    "KR-CNP-GREEN-2026-A08": ["waste-reduction"],
    "KR-CNP-GREEN-2026-A09": ["waste-reduction"],
    "KR-CNP-GREEN-2026-A10": ["eco-learning"],
    "KR-CNP-GREEN-2026-A11": ["green-mobility"],
    "KR-CNP-GREEN-2026-A12": ["waste-reduction"],
    "KR-CNP-GREEN-2026-A13": ["eco-learning"],
    "KR-CNP-GREEN-2026-A14": ["home-upgrade"],
    "KR-CNP-GREEN-2026-A15": ["green-shopping"],
    "KR-CNP-GREEN-2026-A16": ["green-shopping", "waste-reduction"],
    "KR-CNP-GREEN-2026-A17": ["waste-reduction"],
    "SEOUL-EM-GREEN-2026-A01": ["waste-reduction"],
    "SEOUL-EM-GREEN-2026-A02": ["waste-reduction"],
    "SEOUL-EM-GREEN-2026-A03": ["waste-reduction"],
    "SEOUL-EM-GREEN-2026-A04": ["waste-reduction"],
    "SEOUL-EM-GREEN-2026-A05": ["green-mobility"],
    "SEOUL-EM-GREEN-2026-A06": ["green-mobility"],
    "SEOUL-EM-GREEN-2026-A07": ["eco-learning"],
    "SEOUL-EM-GREEN-2026-A08": ["eco-learning"],
    "SEOUL-EM-GREEN-2026-A09": ["eco-learning"],
    "SEOUL-EM-GREEN-2026-A10": ["eco-learning"],
}

TEXT_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("green-mobility", ("따릉이", "공유자전거", "대중교통", "무공해차", "친환경교통", "전기차", "수소차", "전기이륜차", "주행거리 감축", "안전운전", "자전거")),
    ("green-shopping", ("전자영수증", "친환경제품", "재생원료", "그린카드", "에코머니", "농축산물", "환경표지", "장바구니", "리필", "개인컵", "텀블러", "카페", "베이커리", "QR 적립", "매장 안내", "매장 찾기")),
    ("energy-saving", ("에너지캐시백", "에너지바우처", "에너지복지", "냉난방비", "전기요금", "도시가스", "지역난방", "에너지 절약", "에코마일리지 - 건물", "탄소중립포인트 에너지", "탄소중립 활동")),
    ("home-upgrade", ("고효율가전", "고효율 인증", "그린리모델링", "미니태양광", "베란다 태양광", "재생에너지 설비", "소형감량기", "음식물류폐기물")),
    ("waste-reduction", ("폐가전", "폐건전지", "폐의약품", "의류수거", "재활용", "자원순환", "빈병", "보증금", "투명페트", "종이팩", "무인회수", "다회용", "제로식당", "잔반", "음식물쓰레기", "폐휴대폰", "일회용컵 반환")),
    ("eco-learning", ("기후행동", "환경교육", "기후교육", "새활용플라자", "체험", "에코 퀴즈", "온라인실천", "환경행사", "나무심기", "미래세대실천")),
)


def _iter_text(values: Iterable[Any]) -> Iterable[str]:
    for value in values:
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            yield from (item for item in value if isinstance(item, str))


def classify_source(source: dict[str, Any]) -> list[str]:
    matched: set[str] = set()
    doc_id = str(source.get("doc_id") or "")
    policy_id = str(source.get("policy_id") or "")
    action_id = str(source.get("action_id") or "")

    for interest_id, rule in INTEREST_RULES.items():
        if policy_id in rule["program_ids"] or doc_id in rule["program_ids"]:
            matched.add(interest_id)

    matched.update(ACTION_INTERESTS.get(action_id, ()))

    place_type = str(source.get("place_type") or "")
    for known_type, interest_ids in PLACE_TYPE_INTERESTS.items():
        if known_type in place_type:
            matched.update(interest_ids)
    if source.get("doc_type") == "place" and not matched:
        matched.add("waste-reduction")

    searchable = " ".join(_iter_text((
        source.get("name"), source.get("policy_name"), source.get("category"),
        source.get("place_type"), source.get("candidate_action_names"),
        source.get("benefit_text"), source.get("search_text"),
    )))
    for interest_id, terms in TEXT_RULES:
        if any(term in searchable for term in terms):
            matched.add(interest_id)

    return [interest_id for interest_id in INTEREST_RULES if interest_id in matched]


def featured_program_ids(interest_ids: Iterable[str]) -> list[str]:
    selected = list(dict.fromkeys(interest_ids))
    if UNSURE_INTEREST_ID in selected or not selected:
        return STARTER_PROGRAM_IDS.copy()
    return list(dict.fromkeys(
        program_id
        for interest_id in selected
        for program_id in INTEREST_RULES.get(interest_id, {}).get("program_ids", [])
    ))
