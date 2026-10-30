import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SystemHealthCheck } from './health/system.health.js';
import { SpikeModule } from './modules/spike/spike.module.js'; // ponytail: throwaway, remove after G1
import { IntakeModule } from './modules/intake/intake.module.js';

/**
 * Root Application Module
 * 
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'metamorph-mcp',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    SpikeModule, // ponytail: throwaway probe, remove after G1
    IntakeModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}

