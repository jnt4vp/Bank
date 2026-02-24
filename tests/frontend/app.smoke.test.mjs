import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('App renders the starter heading', async (t) => {
  const sourcePath = path.join(process.cwd(), 'src', 'App.jsx')
  const source = await fs.readFile(sourcePath, 'utf8')
  const { code } = await transform(source, {
    loader: 'jsx',
    format: 'esm',
    jsx: 'automatic',
  })

  const tempDir = path.join(
    process.cwd(),
    'node_modules',
    `.tmp-frontend-test-${process.pid}-${Date.now()}`,
  )
  await fs.mkdir(tempDir, { recursive: true })
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const compiledModulePath = path.join(tempDir, 'App.compiled.mjs')
  await fs.writeFile(compiledModulePath, code)

  const { default: App } = await import(
    `${pathToFileURL(compiledModulePath).href}?v=${Date.now()}`
  )

  const html = renderToStaticMarkup(React.createElement(App))
  assert.match(html, /Bank UI starter/)
})
