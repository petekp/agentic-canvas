export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof Element)) return false;

  const element = target as HTMLElement;
  const tagName = element.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  if (element.isContentEditable) return true;

  // Some editors attach contenteditable to an ancestor.
  return Boolean(element.closest('[contenteditable="true"]'));
}

