export type InterestId =
  | "green-mobility"
  | "green-shopping"
  | "energy-saving"
  | "home-upgrade"
  | "waste-reduction"
  | "eco-learning"
  | "unsure";

export type VerificationStatus = "verified" | "needs-review";

export interface Interest {
  id: InterestId;
  icon: string;
  title: string;
  description: string;
  programIds: string[];
  exclusive?: boolean;
}

export interface Mission {
  id: string;
  icon: string;
  title: string;
  summary: string;
  howTo: string[];
  benefit: string;
  duration: string;
  interestIds: InterestId[];
  sourceProgramId?: string;
  sourceDocId?: string;
  sourceUrl?: string;
  sourceType?: "policy" | "action" | "place";
  requiresPhotoProof?: boolean;
  verificationStatus: VerificationStatus;
}

export const interests: Interest[] = [
  {
    id: "green-mobility",
    icon: "🚲",
    title: "교통비·친환경 이동",
    description: "대중교통·자전거·친환경차",
    programIds: ["G003", "G008", "SDG-ZEV-2026", "G007"],
  },
  {
    id: "green-shopping",
    icon: "🛍️",
    title: "친환경 쇼핑·장보기",
    description: "친환경제품·먹거리 할인",
    programIds: ["G004", "G034", "G035", "G024", "KR-CNP-GREEN-2026"],
  },
  {
    id: "energy-saving",
    icon: "💡",
    title: "전기·난방비 절약",
    description: "절약·캐시백·요금 지원",
    programIds: ["G021", "G031", "G048", "G070", "G075", "G080", "SEOUL-EM-BLDG-2026"],
  },
  {
    id: "home-upgrade",
    icon: "🏠",
    title: "집·가전 개선",
    description: "고효율가전·주택·태양광",
    programIds: ["G022", "G027", "G047", "G101", "SDG-FOOD-REDUCER-H2-2026"],
  },
  {
    id: "waste-reduction",
    icon: "♻️",
    title: "재활용·쓰레기 줄이기",
    description: "폐가전·빈병·음식물",
    programIds: ["G038", "G042", "SDG-FOOD-REDUCER-H2-2026", "KR-CNP-GREEN-2026", "SEOUL-EM-GREEN-2026"],
  },
  {
    id: "eco-learning",
    icon: "🌳",
    title: "환경 체험·배우기",
    description: "교육·체험·기후행동",
    programIds: ["G002", "G039", "G117", "G007", "SEOUL-EM-GREEN-2026"],
  },
  {
    id: "unsure",
    icon: "🌿",
    title: "아직 잘 모르겠어요",
    description: "자격조건이 적은 제도부터 가볍게 추천",
    programIds: ["G007", "G008", "G024", "G035", "G038", "G042", "G117"],
    exclusive: true,
  },
];

// sourceProgramId는 팀의 혜택 원본 데이터와 연결할 임시 키입니다.
// 혜택 조건이 확정되지 않은 항목은 needs-review로 표시해 화면에서도 구분합니다.
export const missions: Mission[] = [
  {
    id: "recycle-clear-pet",
    icon: "🧴",
    title: "투명 페트병을 따로 모아 배출하기",
    summary: "라벨과 뚜껑을 분리하고 찌그러뜨린 투명 페트병을 전용 수거함에 배출해요.",
    howTo: ["내용물을 비우고 헹구기", "라벨과 뚜껑 분리하기", "가까운 전용 수거함에 배출하기"],
    benefit: "고품질 재활용품 배출 관련 탄소중립포인트 혜택과 연결 예정",
    duration: "약 10분",
    interestIds: ["waste-reduction"],
    sourceProgramId: "C09",
    requiresPhotoProof: true,
    verificationStatus: "needs-review",
  },
  {
    id: "recycle-battery",
    icon: "🔋",
    title: "폐건전지를 전용 수거함에 반납하기",
    summary: "일반쓰레기에 섞이지 않도록 폐건전지를 모아 주민센터나 수거함에 반납해요.",
    howTo: ["사용한 건전지 모으기", "가까운 주민센터·수거함 확인하기", "전용함에 안전하게 배출하기"],
    benefit: "지역별 교환·보상 혜택은 위치 데이터와 연결 예정",
    duration: "약 15분",
    interestIds: ["waste-reduction"],
    verificationStatus: "needs-review",
  },
  {
    id: "recycle-bottle-deposit",
    icon: "🍾",
    title: "빈 용기 보증금 돌려받기",
    summary: "보증금 대상 유리병을 가까운 반환처에 가져가 자원순환에 참여해요.",
    howTo: ["보증금 대상 표시 확인하기", "병을 깨끗하게 보관하기", "판매점 또는 반환처에 반납하기"],
    benefit: "빈용기 보증금 환급 가능",
    duration: "약 15분",
    interestIds: ["waste-reduction"],
    sourceProgramId: "G042",
    verificationStatus: "verified",
  },
  {
    id: "zero-tumbler",
    icon: "🥤",
    title: "개인컵으로 음료 주문하기",
    summary: "카페 방문 전 텀블러를 챙기고 개인컵 사용 가능 매장에서 주문해요.",
    howTo: ["깨끗한 개인컵 준비하기", "주문할 때 개인컵 사용 요청하기", "참여 매장의 적립 여부 확인하기"],
    benefit: "참여 매장에서 탄소중립포인트 또는 자체 할인 가능",
    duration: "약 5분",
    interestIds: ["green-shopping", "waste-reduction"],
    sourceProgramId: "C03",
    verificationStatus: "verified",
  },
  {
    id: "zero-refill",
    icon: "🧼",
    title: "리필스테이션에서 한 제품 채워오기",
    summary: "빈 용기를 가져가 세제나 화장품을 필요한 만큼만 리필해요.",
    howTo: ["세척한 빈 용기 준비하기", "가까운 리필스테이션 찾기", "필요한 양만 리필하기"],
    benefit: "참여처에 따라 탄소중립포인트 적립 가능",
    duration: "약 30분",
    interestIds: ["green-shopping", "waste-reduction"],
    sourceProgramId: "C05",
    verificationStatus: "needs-review",
  },
  {
    id: "zero-reusable-delivery",
    icon: "🍱",
    title: "다회용기 배달을 한 번 선택하기",
    summary: "배달 주문 시 다회용기 옵션이 있는 매장을 골라 일회용 포장을 줄여요.",
    howTo: ["다회용기 가능 매장 찾기", "주문 옵션에서 다회용기 선택하기", "사용 후 안내에 따라 반납하기"],
    benefit: "참여 서비스에서 탄소중립포인트 적립 가능",
    duration: "약 20분",
    interestIds: ["waste-reduction"],
    sourceProgramId: "C06",
    requiresPhotoProof: true,
    verificationStatus: "needs-review",
  },
  {
    id: "move-public-transit",
    icon: "🚌",
    title: "오늘 한 구간은 대중교통으로 이동하기",
    summary: "자가용 대신 버스나 지하철을 이용할 수 있는 이동 한 구간을 골라 실천해요.",
    howTo: ["오늘 이동 경로 하나 고르기", "대중교통 경로 확인하기", "탑승 후 실천 완료 기록하기"],
    benefit: "K-패스 등 교통비 지원 제도와 연결 예정",
    duration: "이동 시간",
    interestIds: ["green-mobility"],
    sourceProgramId: "G003",
    verificationStatus: "needs-review",
  },
  {
    id: "move-bike",
    icon: "🚲",
    title: "가까운 거리는 공유자전거로 이동하기",
    summary: "걷기엔 조금 먼 거리를 따릉이 같은 공유자전거로 이동해요.",
    howTo: ["주변 대여소 확인하기", "안전한 자전거 경로 고르기", "헬멧과 교통법규 지키기"],
    benefit: "친환경 이동 실적 또는 탄소중립포인트 연계 가능",
    duration: "약 20분",
    interestIds: ["green-mobility"],
    sourceProgramId: "C12",
    verificationStatus: "needs-review",
  },
  {
    id: "move-zero-car",
    icon: "🚙",
    title: "차량이 필요할 땐 무공해차 찾아보기",
    summary: "공유차나 렌터카를 이용해야 한다면 전기차·수소차 옵션을 먼저 확인해요.",
    howTo: ["이동 거리와 인원 확인하기", "무공해차 대여 가능 여부 확인하기", "일반 차량과 비용 비교하기"],
    benefit: "무공해차 대여 관련 탄소중립포인트 연계 가능",
    duration: "약 10분",
    interestIds: ["green-mobility"],
    sourceProgramId: "C07",
    verificationStatus: "needs-review",
  },
  {
    id: "food-no-leftovers",
    icon: "🍽️",
    title: "먹을 만큼만 주문하고 잔반 남기지 않기",
    summary: "양을 미리 확인해 필요한 만큼만 주문하고 남은 음식은 포장해요.",
    howTo: ["주문 전 양 확인하기", "먹을 만큼만 덜기", "남은 음식은 다회용기에 포장하기"],
    benefit: "잔반 감량 실천에 따른 포인트 제도와 연결 예정",
    duration: "식사 한 끼",
    interestIds: ["waste-reduction"],
    sourceProgramId: "C13",
    verificationStatus: "needs-review",
  },
  {
    id: "food-own-container",
    icon: "🥡",
    title: "개인 용기에 음식 포장하기",
    summary: "포장 가능한 식당에 깨끗한 다회용기를 가져가 일회용 용기 사용을 줄여요.",
    howTo: ["식당에 개인 용기 사용 가능 여부 묻기", "세척한 용기 준비하기", "포장 후 실천 기록하기"],
    benefit: "참여 매장에서 탄소중립포인트 적립 가능",
    duration: "약 15분",
    interestIds: ["waste-reduction"],
    sourceProgramId: "C18",
    verificationStatus: "needs-review",
  },
  {
    id: "energy-standby",
    icon: "🔌",
    title: "사용하지 않는 플러그 3개 뽑기",
    summary: "대기전력을 쓰는 가전제품을 찾아 오늘 사용하지 않는 플러그를 뽑아요.",
    howTo: ["집 안 대기전력 제품 찾기", "오늘 쓰지 않을 제품 3개 고르기", "안전하게 전원 차단하기"],
    benefit: "에너지 절감량을 에코마일리지 데이터와 연결 예정",
    duration: "약 5분",
    interestIds: ["energy-saving"],
    sourceProgramId: "SEOUL-EM-BLDG",
    verificationStatus: "needs-review",
  },
  {
    id: "energy-water",
    icon: "🚿",
    title: "샤워 시간을 3분 줄이기",
    summary: "타이머를 켜고 평소보다 샤워 시간을 3분 줄여 물과 에너지를 함께 아껴요.",
    howTo: ["평소 샤워 시간 떠올리기", "3분 짧게 타이머 맞추기", "완료 후 실천 기록하기"],
    benefit: "수도·에너지 절감형 에코마일리지와 연결 예정",
    duration: "약 10분",
    interestIds: ["energy-saving"],
    verificationStatus: "needs-review",
  },
  {
    id: "education-plogging",
    icon: "🧤",
    title: "산책하며 쓰레기 5개 줍기",
    summary: "장갑과 작은 봉투를 챙겨 동네를 걷고 눈에 띄는 쓰레기를 안전하게 주워요.",
    howTo: ["장갑과 봉투 준비하기", "안전한 산책 경로 고르기", "쓰레기 5개 줍고 분리배출하기"],
    benefit: "지역 플로깅·봉사 프로그램과 연결 예정",
    duration: "약 20분",
    interestIds: ["eco-learning", "waste-reduction"],
    requiresPhotoProof: true,
    verificationStatus: "needs-review",
  },
  {
    id: "education-course",
    icon: "📚",
    title: "가까운 환경교육 프로그램 찾아보기",
    summary: "이번 달 참여할 수 있는 환경 강좌나 체험 프로그램을 한 개 저장해요.",
    howTo: ["관심 주제 하나 고르기", "일정과 장소 확인하기", "참여할 프로그램 저장 또는 신청하기"],
    benefit: "환경교육·체험 프로그램 데이터와 연결 예정",
    duration: "약 10분",
    interestIds: ["eco-learning"],
    sourceProgramId: "G117",
    verificationStatus: "needs-review",
  },
  {
    id: "education-tree",
    icon: "🌱",
    title: "나무심기·도시숲 활동 확인하기",
    summary: "가까운 나무심기, 반려나무, 도시숲 봉사 일정을 찾아 참여 후보로 저장해요.",
    howTo: ["지역 활동 검색하기", "준비물과 모집 기간 확인하기", "가능한 일정 하나 저장하기"],
    benefit: "지역활동 및 탄소중립포인트 연계 여부 확인 예정",
    duration: "약 10분",
    interestIds: ["eco-learning", "home-upgrade"],
    sourceProgramId: "C14",
    verificationStatus: "needs-review",
  },
];

export function isInterestId(value: string): value is InterestId {
  return interests.some((interest) => interest.id === value);
}

export function findInterest(id: string) {
  return interests.find((interest) => interest.id === id);
}
