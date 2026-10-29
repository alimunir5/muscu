// Enregistrement d'un fichier : feuille de partage iOS (→ « Enregistrer dans Fichiers »)
// si disponible, sinon téléchargement classique.
export async function saveFile(name: string, content: string, type: string): Promise<boolean> {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
    }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

export function readFileText(file: File): Promise<string> {
  return file.text()
}

export const stamp = () => new Date().toISOString().slice(0, 10)
