# Workflows: `event.timestamp` of a cron-scheduled instance is one interval early

Minimal reproduction for Cloudflare Workflows `schedules` (cron on a Workflow binding).

For an instance created by `schedules`, `event.timestamp` is not the time the instance was triggered.
It is the time the instance was created ahead of time: when the previous occurrence fired, or, for the
first occurrence, when the Workflow was deployed. `event.schedule.scheduledTime` is the trigger time.

## What the Workflow does

[`src/index.js`](src/index.js) returns, for each instance:

- `eventTimestamp`: `event.timestamp`
- `scheduledTime`: `event.schedule.scheduledTime`
- `startedAt`: `Date.now()` taken in the first step (the time the instance actually started running)
- `scheduledTimeMinusEventTimestampMs`: `scheduledTime - event.timestamp`

The Workflow runs on `*/5 * * * *` ([`wrangler.jsonc`](wrangler.jsonc)).

## Steps to reproduce

1. `npm install`
2. `npx wrangler deploy`
3. Wait for two or three cron firings (10 to 15 minutes).
4. `npx wrangler workflows instances list workflows-cron-timestamp-repro`
5. `npx wrangler workflows instances describe workflows-cron-timestamp-repro <instance id>` for each instance, and look at the output.
6. `npx wrangler delete` to stop it.

## Expected

`event.timestamp` is the time the instance was triggered, close to `event.schedule.scheduledTime` and `startedAt`.
`scheduledTimeMinusEventTimestampMs` is close to 0.

The documentation says:

- [Events and parameters](https://developers.cloudflare.com/workflows/build/events-and-parameters/):
  `/** The timestamp that the Workflow was triggered. */ timestamp: Date;`
- [Workers API](https://developers.cloudflare.com/workflows/build/workers-api/):
  "`timestamp` - a `Date` object set to the time the Workflow instance was created (triggered)."
- [Trigger Workflows](https://developers.cloudflare.com/workflows/build/trigger-workflows/):
  "Each matching cron expression creates a new Workflow instance automatically."

## Actual

- The first instance: `event.timestamp` is the time of `wrangler deploy`.
- Later instances: `event.timestamp` is the time the previous occurrence fired, so
  `scheduledTimeMinusEventTimestampMs` is about the cron interval (300000 ms here).
- `event.timestamp` is equal to the `queued` field of `GET /accounts/{account_id}/workflows/{workflow_name}/instances/{instance_id}`.
  The next occurrence's instance already exists in `queued` status before it fires.
- `GET .../workflows/{workflow_name}/instances` (list) shows `created_on` as the scheduled slot time, which is different from `queued`.

### Results

(to be filled in after running)

## Why it matters

Code that uses `event.timestamp` as the start time of the run gets a time one interval old, and for the first
occurrence, the deploy time. A run that compares its own start time with a previous run (for example to avoid
overwriting newer results with older ones) wrongly decides that it is older.

The local implementation in [cloudflare/workers-sdk#14768](https://github.com/cloudflare/workers-sdk/pull/14768)
sets `timestamp: new Date(cron.scheduledTime)` for cron instances, which is different from production.
