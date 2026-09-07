/**
 * The brand mark: a small escutcheon — gold border, navy field, a cream base band
 * with a simplified tower rising out of it.
 *
 * Inline SVG rather than a file in `public/`, so the mark costs no request and
 * inherits nothing that can fail to load; and rather than the stack of nested,
 * elliptically-rounded `<div>`s the design handoff spells out, which is only how
 * that document draws it because the tool that produced it cannot emit vector.
 * The shape is the same one; this is the medium it was always meant to be in.
 *
 * Decorative. The wordmark beside it in the header is what names the site, so a
 * screen reader announcing the crest as well would only say it twice.
 */
export function Crest() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="26"
      height="32"
      viewBox="0 0 26 32"
      className="flex-none"
    >
      <defs>
        {/* The navy field, reused as a clip so the base band and the tower stop
            at the shield's curved edge instead of running out through it. */}
        <clipPath id="crest-field">
          <path d="M3.2 1.6H22.8A1.6 1.6 0 0 1 24.4 3.2V18C24.4 24.6 18.7 28.8 13 30.3C7.3 28.8 1.6 24.6 1.6 18V3.2A1.6 1.6 0 0 1 3.2 1.6Z" />
        </clipPath>
      </defs>

      <path
        d="M3 0H23A3 3 0 0 1 26 3V18C26 26 20 30.5 13 32C6 30.5 0 26 0 18V3A3 3 0 0 1 3 0Z"
        fill="var(--gold)"
      />
      <path
        d="M3.2 1.6H22.8A1.6 1.6 0 0 1 24.4 3.2V18C24.4 24.6 18.7 28.8 13 30.3C7.3 28.8 1.6 24.6 1.6 18V3.2A1.6 1.6 0 0 1 3.2 1.6Z"
        fill="var(--app)"
      />
      <g clipPath="url(#crest-field)" fill="var(--fg)">
        <rect x="1.6" y="20.3" width="22.8" height="10.1" />
        <rect x="6" y="3.2" width="14" height="3" />
        <rect x="8" y="6.2" width="10" height="14.1" />
      </g>
    </svg>
  );
}
