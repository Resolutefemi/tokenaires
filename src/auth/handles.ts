const MAX_HANDLE_LENGTH = 39;

export function parkedHandle(handle: string, key: string): string {
  const suffix = `-gh${key}`;
  return `${handle.slice(0, MAX_HANDLE_LENGTH - suffix.length)}${suffix}`;
}
