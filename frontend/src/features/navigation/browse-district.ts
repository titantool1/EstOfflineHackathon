export const browseDistrictKey = "eco_browse_district_v1";
export const browseDistrictEvent = "eco-browse-district-change";
export const seoulDistricts = ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"];
let unavailableStorageValue = "";
export function readBrowseDistrict() {
  if (typeof window === "undefined") return "";
  try { const value = localStorage.getItem(browseDistrictKey) ?? ""; return seoulDistricts.includes(value) ? value : ""; }
  catch { return unavailableStorageValue; }
}
export function setBrowseDistrict(value: string) {
  if (value !== "" && !seoulDistricts.includes(value)) return;
  unavailableStorageValue = value;
  try { localStorage.setItem(browseDistrictKey, value); } catch { /* Keep this visit usable when storage is unavailable. */ }
  window.dispatchEvent(new Event(browseDistrictEvent));
}
export function subscribeBrowseDistrict(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener(browseDistrictEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(browseDistrictEvent, listener); };
}
