// Existing server contract: count Unicode code points, not UTF-16 code units.
export const CONTRIBUTION_DESCRIPTION_LIMIT = 1000;
const formattedLimit = CONTRIBUTION_DESCRIPTION_LIMIT.toLocaleString('en-US');

export function contributionDescriptionError(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    return `Enter a contribution description (1–${formattedLimit} characters).`;
  }
  if ([...value].length > CONTRIBUTION_DESCRIPTION_LIMIT) return `Shorten the description to ${formattedLimit} characters or fewer.`;
  if (/[\u0000-\u001f\u007f]/.test(value)) return 'Remove line breaks, tabs and control characters. Use one paragraph.';
  if (value.trim() !== value) return 'Remove whitespace from the beginning and end of the description.';
  return null;
}
