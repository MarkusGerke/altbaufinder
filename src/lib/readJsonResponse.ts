/**
 * Liest JSON aus einer fetch-Antwort. Wirft eine verständliche Fehlermeldung,
 * wenn stattdessen HTML oder PHP-Quelltext ankommt (z. B. PHP läuft nicht).
 */
export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  const trimmed = text.trimStart()
  const badPrefix =
    trimmed.startsWith('<') ||
    trimmed.startsWith('<?php') ||
    trimmed.startsWith('<?=')
  if (badPrefix) {
    throw new Error(
      'Die Server-Antwort ist kein gültiges JSON (es kam HTML oder PHP-Code). ' +
        'Lokal: `npm run dev` nutzt bei fehlendem PHP die Online-API (siehe `.env.example`), ' +
        'oder PHP installieren und erneut `npm run dev`.'
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Die Server-Antwort konnte nicht als JSON gelesen werden.')
  }
}
