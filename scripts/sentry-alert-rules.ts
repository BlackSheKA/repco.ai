// Run: npx tsx scripts/sentry-alert-rules.ts
//
// Creates Sentry alert rules for OBSV-04 threshold monitoring.
// Requires environment variables: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT

interface AlertRule {
  name: string;
  fingerprint: string;
}

const RULES: AlertRule[] = [
  {
    name: "OBSV-04: Low Action Success Rate",
    fingerprint: "obsv04-low-success-rate",
  },
  {
    name: "OBSV-04: High Timeout Rate",
    fingerprint: "obsv04-high-timeout-rate",
  },
];

async function createAlertRule(
  org: string,
  project: string,
  token: string,
  rule: AlertRule,
): Promise<void> {
  const url = `https://sentry.io/api/0/projects/${org}/${project}/rules/`;

  const body = {
    name: rule.name,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 1,
        interval: "10m",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "fingerprint",
        match: "eq",
        value: rule.fingerprint,
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
      },
    ],
    actionMatch: "all",
    filterMatch: "all",
    frequency: 60,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`[OK] Created rule "${rule.name}" (id: ${data.id})`);
  } else {
    const text = await response.text();
    console.error(
      `[FAIL] Failed to create rule "${rule.name}": ${response.status} ${text}`,
    );
  }
}

async function main() {
  const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
  const SENTRY_ORG = process.env.SENTRY_ORG;
  const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    console.error(
      "Missing required env vars: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT",
    );
    process.exit(1);
  }

  console.log(
    `Creating ${RULES.length} Sentry alert rules for ${SENTRY_ORG}/${SENTRY_PROJECT}...`,
  );

  for (const rule of RULES) {
    await createAlertRule(SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN, rule);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
