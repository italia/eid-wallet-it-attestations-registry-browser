export async function loadDumpManifest() {
  const urls = ['./cache/manifest.json', './public/cache/manifest.json'];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('manifest.json not found');
}
