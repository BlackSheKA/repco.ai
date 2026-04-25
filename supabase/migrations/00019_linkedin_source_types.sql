-- =============================================================================
-- Migration: 00019_linkedin_source_types.sql
-- Purpose: Extend signal_source_type ENUM with LinkedIn-specific source kinds
--          so users can configure target companies and authors (in addition to
--          free-form keywords) on the /signals → Sources panel.
-- =============================================================================

ALTER TYPE signal_source_type ADD VALUE IF NOT EXISTS 'linkedin_company';
ALTER TYPE signal_source_type ADD VALUE IF NOT EXISTS 'linkedin_author';
