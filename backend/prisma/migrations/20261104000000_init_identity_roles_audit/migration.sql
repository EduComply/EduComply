-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_type" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "auth_protocol" AS ENUM ('OIDC', 'SAML');

-- CreateTable
CREATE TABLE "role" (
    "id" SMALLSERIAL NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "description" TEXT,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "institutional_id" VARCHAR(50),
    "user_type" "user_type" NOT NULL,
    "department" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identity" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "protocol" "auth_protocol" NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" VARCHAR(100),
    "reason" TEXT,
    "metadata" JSONB,
    "request_id" VARCHAR(100),
    "ip_hash" CHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_institutional_id_key" ON "user"("institutional_id");

-- CreateIndex
CREATE INDEX "user_role_id_idx" ON "user"("role_id");

-- CreateIndex
CREATE INDEX "user_identity_user_id_idx" ON "user_identity"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identity_issuer_subject_key" ON "user_identity"("issuer", "subject");

-- CreateIndex
CREATE INDEX "audit_event_actor_id_occurred_at_idx" ON "audit_event"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_target_type_target_id_idx" ON "audit_event"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_event_action_occurred_at_idx" ON "audit_event"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_occurred_at_idx" ON "audit_event"("occurred_at");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identity" ADD CONSTRAINT "user_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Append-only audit trail (API Design §9: "insert-only") ───────────
-- Hand-written addition: Prisma does not model triggers.
CREATE FUNCTION "audit_event_prevent_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_event_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_prevent_mutation"();

CREATE TRIGGER "audit_event_no_truncate"
  BEFORE TRUNCATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_event_prevent_mutation"();
