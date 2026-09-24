import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { McpAdminController } from './mcp-admin.controller';
import { McpAdminService } from './mcp-admin.service';
import { McpConnectionManager } from './mcp-connection.manager';
import { McpRunLatchService } from './mcp-run-latch.service';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import { McpServerSecretsRepository } from './mcp-server-secrets.repository';
import { McpToolCatalogService } from './mcp-tool-catalog.service';
import { McpResourceExecutor } from './mcp-resource.executor';
import { McpToolExecutor } from './mcp-tool-executor';
import { SecretsCryptoService } from './secrets-crypto.service';

@Module({
  imports: [DatabaseModule],
  controllers: [McpAdminController],
  providers: [
    SecretsCryptoService,
    McpServerConfigRepository,
    McpServerSecretsRepository,
    McpConnectionManager,
    McpToolCatalogService,
    McpToolExecutor,
    McpResourceExecutor,
    McpRunLatchService,
    McpAdminService,
  ],
  exports: [
    McpToolCatalogService,
    McpToolExecutor,
    McpResourceExecutor,
    McpRunLatchService,
    McpConnectionManager,
    SecretsCryptoService,
  ],
})
export class McpModule {}
