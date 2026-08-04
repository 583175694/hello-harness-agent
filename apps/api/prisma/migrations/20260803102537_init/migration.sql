-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'local',
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
