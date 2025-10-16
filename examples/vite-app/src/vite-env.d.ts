/// <reference types="vite/client" />

/**
 * Type definitions for import.meta.env
 * These provide IntelliSense for VITE_* environment variables
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_ENABLE_ANALYTICS: boolean
  readonly VITE_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

