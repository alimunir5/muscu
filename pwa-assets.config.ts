import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#111827' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#111827' } },
  },
  images: ['public/logo.svg'],
})
