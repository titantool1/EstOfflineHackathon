// Team front-end visuals; labels and selections come from the member API.
const icons: Record<string, string> = {
  "green-mobility": "🚲", "green-shopping": "🛍️", "energy-saving": "💡",
  "home-upgrade": "🏠", "waste-reduction": "♻️", "eco-learning": "🌳", unsure: "🌿",
};

export function interestIcon(id?: string): string {
  return id ? icons[id] ?? "🌿" : "🌿";
}
