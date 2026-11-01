/** The design's icon set, verbatim (24×24, stroked). Paths are static constants. */
const icons = {
  wallet:
    '<path d="M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v2"/><path d="M20 11h-5a2 2 0 0 0 0 4h5M16 13h.01"/>',
  send: '<path d="M7 17 17 7M6 7h11v11"/>',
  down: '<path d="m17 7-10 10M7 6v11h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  shield: '<path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6zM9 12l2 2 4-4"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  log: '<path d="M8 3h8l4 4v14H4V3h4M8 11h8M8 15h8M8 7h4"/>',
  test: '<path d="M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
