import process from 'node:process'

// Automatically load .env file into process.env if supported and file exists
try {
  process.loadEnvFile?.()
} catch {
  // .env file not found or already loaded by environment/runner; continue safely
}
