/**
 * Serialise structured data for an inline `<script type="application/ld+json">`.
 *
 * JSON.stringify leaves "<" unescaped, so a "</script>" inside any value would
 * close the tag. The HTML-significant characters are escaped as JSON unicode
 * escapes, which parse back to the same value.
 */
export function toJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
