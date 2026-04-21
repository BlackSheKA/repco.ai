-- Migration: 00016_add_connected_pipeline_status.sql
-- Phase: audit gap closure (integration check Phase 10 bug)
-- Adds 'connected' to pipeline_status_type enum. Used by LinkedIn connection_request
-- worker arm when Haiku CU detects an already-connected 1st-degree user.

ALTER TYPE public.pipeline_status_type ADD VALUE IF NOT EXISTS 'connected';
