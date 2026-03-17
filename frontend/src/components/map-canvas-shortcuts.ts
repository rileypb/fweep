export function isUndoShortcut(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; key: string }): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z';
}

export function isRedoShortcut(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; key: string }): boolean {
  return (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && ((event.key.toLowerCase() === 'z' && event.shiftKey) || (event.key.toLowerCase() === 'y' && !event.shiftKey))
  );
}
