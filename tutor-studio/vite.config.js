import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The tutor's voice is rendered by the small Python server in ../tutor-simple
// (start it with that folder's start.command). Proxying to it means this app
// gets the same Nigerian English voice, and the same instant playback, without
// needing a server of its own. If it is not running, every one of these fails
// quietly and the browser's own speech engine is used instead.
const VOICE_SERVER = 'http://127.0.0.1:8321'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      ['/voices', '/prepare', '/audio', '/say', '/stop'].map(path => [
        path,
        { target: VOICE_SERVER, changeOrigin: true }
      ])
    )
  }
})
