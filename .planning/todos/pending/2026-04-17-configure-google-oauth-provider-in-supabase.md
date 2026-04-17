---
created: 2026-04-17T09:51:20.678Z
title: Configure Google OAuth provider in Supabase
area: auth
files:
  - src/features/auth/actions/auth-actions.ts
  - src/features/auth/components/login-form.tsx
---

## Problem

Google OAuth button exists in the login form (`signInWithGoogle` calls `signInWithOAuth({ provider: 'google' })`), but clicking it fails because no Google OAuth provider is configured in the Supabase Dashboard. This is the only auth verification item that couldn't be tested with Playwright.

## Solution

1. Create OAuth Client ID in Google Cloud Console (https://console.cloud.google.com/apis/credentials)
   - Authorized redirect URI: `https://cmkifdwjunojgigrqwnr.supabase.co/auth/v1/callback`
2. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider
   - Paste Client ID and Client Secret
3. Test the flow end-to-end with Playwright
