export function validateDisease(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return "Please select or enter a disease to continue.";
  }
  return null;
}
