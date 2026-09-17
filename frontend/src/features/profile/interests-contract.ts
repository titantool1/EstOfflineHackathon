export type InterestOption = { id: string; title: string; description: string };
export type InterestProfile = { options: InterestOption[]; interestIds: string[] };
export type InterestSelectionInput = { interestIds: string[] };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => key in value);
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;

export function isInterestSelectionInput(value: unknown): value is InterestSelectionInput {
  if (!record(value) || !exactKeys(value, ["interestIds"]) || !Array.isArray(value.interestIds)
      || value.interestIds.length > 50 || !value.interestIds.every(isId)) return false;
  const unique = new Set(value.interestIds);
  return unique.size === value.interestIds.length
    && (!unique.has("unsure") || value.interestIds.length === 1);
}

function isInterestOption(value: unknown): value is InterestOption {
  return record(value) && exactKeys(value, ["id", "title", "description"])
    && isId(value.id) && typeof value.title === "string" && value.title.length > 0
    && typeof value.description === "string" && value.description.length > 0;
}

export function isInterestProfile(value: unknown): value is InterestProfile {
  if (!record(value) || !exactKeys(value, ["options", "interestIds"])
      || !Array.isArray(value.options) || !value.options.every(isInterestOption)
      || !Array.isArray(value.interestIds) || !value.interestIds.every(isId)) return false;
  const optionIds = new Set(value.options.map(option => option.id));
  const selected = new Set(value.interestIds);
  return optionIds.size === value.options.length && selected.size === value.interestIds.length
    && value.interestIds.every(id => optionIds.has(id))
    && (!selected.has("unsure") || value.interestIds.length === 1);
}
