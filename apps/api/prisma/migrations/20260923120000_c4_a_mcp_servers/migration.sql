-- CreateEnum
CREATE TYPE "McpTransport" AS ENUM ('streamable_http');

-- CreateEnum
CREATE TYPE "McpDefaultApproval" AS ENUM ('auto_execute', 'require_approval');

-- CreateEnum
CREATE TYPE "McpSecretKind" AS ENUM ('header', 'env', 'bearer');

-- CreateTable
CREATE TABLE "mcp_server_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "server_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "transport" "McpTransport" NOT NULL DEFAULT 'streamable_http',
    "url" TEXT NOT NULL,
    "headers_plain" JSONB NOT NULL DEFAULT '{}',
    "startup_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "tool_call_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "fail_on_startup_error" BOOLEAN NOT NULL DEFAULT false,
    "default_approval" "McpDefaultApproval" NOT NULL DEFAULT 'require_approval',
    "enabled_tools" JSONB,
    "disabled_tools" JSONB,
    "max_instruction_bytes" INTEGER NOT NULL DEFAULT 32768,
    "reconnect_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reconnect_max_attempts" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_server_secrets" (
    "id" TEXT NOT NULL,
    "mcp_server_config_id" TEXT NOT NULL,
    "kind" "McpSecretKind" NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_server_configs_user_id_enabled_idx" ON "mcp_server_configs"("user_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_configs_user_id_session_id_server_name_key" ON "mcp_server_configs"("user_id", "session_id", "server_name");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_secrets_mcp_server_config_id_kind_name_key" ON "mcp_server_secrets"("mcp_server_config_id", "kind", "name");

-- AddForeignKey
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_server_secrets" ADD CONSTRAINT "mcp_server_secrets_mcp_server_config_id_fkey" FOREIGN KEY ("mcp_server_config_id") REFERENCES "mcp_server_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
