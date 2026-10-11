/** Submit the scene description exactly: no wrapper, translation, or truncation. */
export function buildSubmissionPrompt(description: string): string {
  return description;
}
