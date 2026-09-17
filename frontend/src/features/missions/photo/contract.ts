export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type Observation = {
  container_type: "reusable_product" | "disposable_packaging" | "other" | "unknown";
  food_state: "visible" | "visibly_empty" | "hidden_or_unclear";
  container_evidence: string; food_evidence: string; next_photo: string;
};
export type PhotoResult = { verdict: "met" | "not_met" | "unknown"; title: string; message: string };
export function isObservation(value: unknown): value is Observation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 5
    && typeof v.container_type === "string" && ["reusable_product", "disposable_packaging", "other", "unknown"].includes(v.container_type)
    && typeof v.food_state === "string" && ["visible", "visibly_empty", "hidden_or_unclear"].includes(v.food_state)
    && ["container_evidence", "food_evidence", "next_photo"].every(k => typeof v[k] === "string" && v[k].length <= 2000);
}
// Reviewed trial precedence. Only these fixed messages are displayed, not model prose.
export function photoResult(v: Observation): PhotoResult {
  if (v.container_type === "disposable_packaging" || v.container_type === "other")
    return { verdict: "not_met", title: "용기 조건에 맞지 않아요", message: "반복 사용하도록 만든 도시락이나 식품 보관통에 음식을 담아 주세요. 일회용 상품 포장은 이번 확인 대상에 포함되지 않아요." };
  if (v.food_state === "visibly_empty")
    return { verdict: "not_met", title: "음식이 담긴 사진이 필요해요", message: "용기 안이 비어 있어요. 음식이 담긴 상태에서 내부와 용기 전체가 함께 보이게 찍어 주세요." };
  if (v.container_type === "reusable_product" && v.food_state === "visible")
    return { verdict: "met", title: "사진 조건을 충족했어요", message: "다회용 식품 용기와 그 안의 음식이 확인됐어요. 실제 참여나 구매 이력, 미션 완료를 증명하는 결과는 아니에요." };
  return { verdict: "unknown", title: "사진만으로 확인하기 어려워요", message: v.container_type === "unknown"
    ? "용기 전체와 뚜껑·잠금 부분이 잘 보이게 다시 찍어 주세요. 계속 구분하기 어려우면 사진 확인이 어려울 수 있어요."
    : "뚜껑을 열고 용기 안의 음식과 용기 전체가 함께 보이게 다시 찍어 주세요." };
}
export function isPhotoResult(value: unknown): value is PhotoResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.verdict === "string" && ["met", "not_met", "unknown"].includes(v.verdict) && typeof v.title === "string" && typeof v.message === "string";
}
