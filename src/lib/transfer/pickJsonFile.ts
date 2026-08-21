/** Open a file picker for a single JSON file and return its parsed contents.
 *  Resolves `null` if the user cancels. */
export function pickJsonFile(): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'

    let settled = false

    const finish = (result: unknown | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      resolve(result)
    }

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      reject(err)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '')
          finish(JSON.parse(text) as unknown)
        } catch {
          fail(new Error('File is not valid JSON.'))
        }
      }
      reader.onerror = () => fail(new Error('Could not read the selected file.'))
      reader.readAsText(file)
    })

    function onWindowFocus() {
      window.setTimeout(() => {
        if (!settled && !input.files?.length) finish(null)
      }, 400)
    }

    window.addEventListener('focus', onWindowFocus)
    document.body.appendChild(input)
    input.click()
  })
}
