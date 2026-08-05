export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
