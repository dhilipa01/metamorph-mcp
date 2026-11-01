/**
 * Calculator MCP Server
 * 
 * Main entry point for the MCP server.
 * Uses the @McpApp decorator pattern for clean, NestJS-style architecture.
 * 
 * Transport Configuration:
 * - Development (NODE_ENV=development): STDIO only
 * - Production (NODE_ENV=production): Dual transport (STDIO + HTTP SSE)
 */

import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { registerReportRoutes, type AppLike } from './modules/report/download.js';
import { installLanding, type LandingApp } from './landing.js';
import { installValidationDeferral } from './common/sdk-validation.js';

/**
 * Bootstrap the application
 */
async function bootstrap() {
  // Create and start the MCP server
  const server = await McpApplicationFactory.create(AppModule);
  // Tools validate their own input after the auth guard (friendly messages); let the SDK's schema failure pass to them.
  await installValidationDeferral(server);
  await server.start();
  // Signed report downloads live on the same Express app as /mcp. STDIO-only runs have no HTTP transport and no links.
  const http = server.getHttpTransport?.();
  const app = http?.getApp?.();
  if (app) {
    registerReportRoutes(app as unknown as AppLike);
    // Swap the SDK's generic root page for ours (no external requests, honest content).
    installLanding(app as unknown as LandingApp, (m) => console.warn(m));
  }
}

// Start the application
bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
