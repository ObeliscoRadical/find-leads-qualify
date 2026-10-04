import { pgTable, text, timestamp, integer, boolean, decimal, varchar, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ============ Users & Organizations ============

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    passwordHash: text('password_hash'),
    googleId: varchar('google_id', { length: 255 }).unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index('idx_users_email').on(table.email),
    googleIdIdx: index('idx_users_google_id').on(table.googleId),
  })
)

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    nif: varchar('nif', { length: 20 }),
    cae: varchar('cae', { length: 10 }),
    nicho: text('nicho'),
    description: text('description'),
    timezone: varchar('timezone', { length: 50 }).default('Europe/Lisbon'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
)

export const memberships = pgTable(
  'memberships',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull().default('member'), // admin, member
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.organizationId] }),
    userIdx: index('idx_memberships_user').on(table.userId),
    orgIdx: index('idx_memberships_org').on(table.organizationId),
  })
)

// ============ OAuth & Connections ============

export const oauthStates = pgTable(
  'oauth_states',
  {
    state: varchar('state', { length: 64 }).primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(), // 'meta', 'google'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    expiresIdx: index('idx_oauth_states_expires').on(table.expiresAt),
  })
)

export const metaConnections = pgTable(
  'meta_connections',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    pageTokenEncrypted: text('page_token_encrypted'),
    pageId: varchar('page_id', { length: 255 }),
    pageName: varchar('page_name', { length: 255 }),
    igUserId: varchar('ig_user_id', { length: 255 }),
    igUsername: varchar('ig_username', { length: 255 }),
    businessAccountId: varchar('business_account_id', { length: 255 }),
    scopes: text('scopes'), // JSON array
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: varchar('status', { length: 50 }).default('connected'), // 'connected', 'expired', 'revoked'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_meta_connections_org').on(table.organizationId),
    orgUniqueIdx: uniqueIndex('idx_meta_connections_org_unique').on(table.organizationId),
    statusIdx: index('idx_meta_connections_status').on(table.status),
  })
)

// ============ Leads ============

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourceType: varchar('source_type', { length: 50 }).notNull(), // 'instagram_api', 'google_places', 'referral'
    sourceExternalId: varchar('source_external_id', { length: 255 }),
    contactName: varchar('contact_name', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 50 }),
    sourceFields: text('source_fields'),
    leadType: varchar('lead_type', { length: 50 }).notNull().default('customer'), // 'customer', 'affiliate'
    instagramId: varchar('instagram_id', { length: 255 }),
    instagramUsername: varchar('instagram_username', { length: 255 }),
    instagramDisplayName: varchar('instagram_display_name', { length: 255 }),
    instagramBio: text('instagram_bio'),
    instagramFollowers: integer('instagram_followers'),
    instagramIsBusiness: boolean('instagram_is_business'),
    instagramCategory: varchar('instagram_category', { length: 255 }),
    instagramProfileUrl: varchar('instagram_profile_url', { length: 500 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactWhatsapp: varchar('contact_whatsapp', { length: 50 }),
    website: varchar('website', { length: 500 }),
    icpMatchScore: decimal('icp_match_score', { precision: 3, scale: 2 }),
    icpSegment: text('icp_segment'),
    leadStatus: varchar('lead_status', { length: 50 }).notNull().default('new'), // 'new', 'contacted', 'replied', 'qualified', 'closed', 'opted_out'
    noContact: boolean('no_contact').default(false),
    noContactReason: text('no_contact_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index('idx_leads_org').on(table.organizationId),
    sourceExternalIdx: uniqueIndex('idx_leads_source_external').on(table.organizationId, table.sourceType, table.sourceExternalId),
    statusIdx: index('idx_leads_status').on(table.leadStatus),
    instagramIdIdx: uniqueIndex('idx_leads_instagram_id').on(table.instagramId, table.organizationId).where(sql`${table.instagramId} IS NOT NULL`),
  })
)

// ============ Messages & Communication ============

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull(), // 'user', 'assistant', 'system'
    content: text('content').notNull(),
    sentVia: varchar('sent_via', { length: 50 }).notNull(), // 'api', 'manual'
    instagramMessageId: varchar('instagram_message_id', { length: 255 }),
    isFromLead: boolean('is_from_lead').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadIdx: index('idx_messages_lead').on(table.leadId),
    orgIdx: index('idx_messages_org').on(table.organizationId),
    instagramIdIdx: uniqueIndex('idx_messages_instagram_id').on(table.leadId, table.instagramMessageId).where(sql`${table.instagramMessageId} IS NOT NULL`),
  })
)

// ============ Campaigns & Jobs ============

export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'paused', 'completed'
    autonomyLevel: varchar('autonomy_level', { length: 50 }).notNull().default('manual'), // 'manual', 'semi-auto', 'autonomous'
    dailyLimit: integer('daily_limit').default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_campaigns_org').on(table.organizationId),
    statusIdx: index('idx_campaigns_status').on(table.status),
  })
)

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 50 }).notNull(), // 'discovery', 'send_dm', 'classify', 'ai_response'
    payload: text('payload'), // JSON
    status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'running', 'completed', 'failed'
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    runAt: timestamp('run_at', { withTimezone: true }),
    attempts: integer('attempts').default(0),
    maxAttempts: integer('max_attempts').default(5),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index('idx_jobs_org').on(table.organizationId),
    statusIdx: index('idx_jobs_status').on(table.status),
    runAtIdx: index('idx_jobs_run_at').on(table.runAt),
    kindIdx: index('idx_jobs_kind').on(table.kind),
  })
)

// ============ Audit & Compliance ============

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: text('entity_id'),
    details: text('details'), // JSON
    ip: varchar('ip', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_audit_logs_org').on(table.organizationId),
    actionIdx: index('idx_audit_logs_action').on(table.action),
  })
)

export const privacyPolicies = pgTable(
  'privacy_policies',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    version: integer('version').default(1),
    content: text('content').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }
)

// ============ AI Calls (cost tracking) ============

export const aiCalls = pgTable(
  'ai_calls',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    model: varchar('model', { length: 100 }).notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    purpose: varchar('purpose', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('idx_ai_calls_org').on(table.organizationId),
    modelIdx: index('idx_ai_calls_model').on(table.model),
  })
)
