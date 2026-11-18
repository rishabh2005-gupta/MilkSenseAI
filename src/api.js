export async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return null
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error ?? `Request failed (${response.status}).`)
    error.status = response.status
    throw error
  }
  return result
}

export async function downloadApiFile(path, filename) {
  const response = await fetch(`/api${path}`, { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error ?? `Request failed (${response.status}).`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
