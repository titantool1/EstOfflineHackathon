export function toggleInterest(current: string[], id: string): string[] {
  if (id === "unsure") return current.length === 1 && current[0] === "unsure" ? [] : ["unsure"];
  const withoutUnsure = current.filter(value => value !== "unsure");
  return withoutUnsure.includes(id) ? withoutUnsure.filter(value => value !== id) : [...withoutUnsure, id];
}

export function interestDescription(id: string, description: string): string {
  return id === "unsure" ? "분야를 정하지 않고 여러 활동을 둘러볼게요" : description;
}
