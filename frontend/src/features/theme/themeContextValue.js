import { createContext } from 'react'

import { DEV_MODES } from './themeConstants.js'

export const defaultThemeContext = {
  bg: 'sky',
  disciplineTierKey: null,
  devOverride: null,
  setDevOverride: () => {},
  DEV_MODES,
}

export const ThemeContext = createContext(defaultThemeContext)
