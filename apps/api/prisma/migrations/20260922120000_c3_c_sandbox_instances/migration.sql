-- CreateEnum
CREATE TYPE "SandboxInstanceStatus" AS ENUM ('active', 'stale', 'destroying');

-- CreateTable
CREATE TABLE "sandbox_instances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "provider_sandbox_id" TEXT NOT NULL,
    "status" "SandboxInstanceStatus" NOT NULL DEFAULT 'active',
    "last_active_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "hard_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sandbox_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_instances_session_id_key" ON "sandbox_instances"("session_id");

-- CreateIndex
CREATE INDEX "sandbox_instances_status_expires_at_idx" ON "sandbox_instances"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "sandbox_instances" ADD CONSTRAINT "sandbox_instances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
