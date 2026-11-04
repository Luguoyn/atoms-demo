/** Best-effort Chinese copy for raw error strings coming from the store. */
export function humanizeError(message: string | null | undefined): string {
  const text = (message ?? "").trim();
  if (!text) return "生成失败，请稍后重试。";
  if (
    /failed to fetch|network ?error|network request failed|load failed|net::err/i.test(
      text,
    )
  ) {
    return "网络请求失败，请检查网络连接后重试。";
  }
  if (/aborted|abort error/i.test(text)) return "请求已中断。";
  if (/timeout|timed out/i.test(text)) return "请求超时，请稍后重试。";
  return text;
}
