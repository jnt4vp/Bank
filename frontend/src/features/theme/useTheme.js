import { useContext } from 'react'

import { ThemeContext } from './themeContextValue.js'

export function useTheme() {
  return useContext(ThemeContext)
}
