-- =============================================================================
-- Migration: 00001_enums.sql
-- Purpose: Define all ENUM types used across the schema
-- =============================================================================

-- Platform types
CREATE TYPE platform_type AS ENUM ('reddit', 'linkedin');

-- Social account health
CREATE TYPE health_status_type AS ENUM ('warmup', 'healthy', 'warning', 'cooldown', 'banned');

-- Intent signal classification
CREATE TYPE intent_type AS ENUM ('direct', 'competitive', 'problem', 'engagement');

-- Intent signal status
CREATE TYPE signal_status_type AS ENUM ('pending', 'actioned', 'dismissed');

-- Action types
CREATE TYPE action_type AS ENUM ('like', 'follow', 'public_reply', 'dm', 'followup_dm');

-- Action status
CREATE TYPE action_status_type AS ENUM ('pending_approval', 'approved', 'rejected', 'executing', 'completed', 'failed');

-- Prospect pipeline stages
CREATE TYPE pipeline_status_type AS ENUM ('detected', 'engaged', 'contacted', 'replied', 'converted', 'rejected');

-- Job types
CREATE TYPE job_type AS ENUM ('monitor', 'action', 'reply_check');

-- Job status
CREATE TYPE job_status_type AS ENUM ('started', 'completed', 'failed', 'timeout');

-- Billing period
CREATE TYPE billing_period_type AS ENUM ('monthly', 'quarterly', 'annual');

-- Monitoring signal type
CREATE TYPE signal_source_type AS ENUM ('reddit_keyword', 'linkedin_keyword', 'subreddit', 'competitor', 'profile_visitor');

-- Credit transaction type
CREATE TYPE credit_type AS ENUM ('monthly_grant', 'pack_purchase', 'monitoring_burn', 'action_spend', 'refund');
