/**
 * Wrapper de compatibilidade: fonte canônica vive em `shared/whatsapp-webview-script.mjs`
 * para ser empacotada no Docker/Cloud Run e servida remotamente com assinatura Ed25519.
 */
export * from '../shared/whatsapp-webview-script.mjs';
