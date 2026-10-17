# Workflows: `event.timestamp` of a cron-scheduled instance is one interval early

Minimal reproduction for Cloudflare Workflows `schedules` (cron on a Workflow binding).

For an instance created by `schedules`, `event.timestamp` is not the time the instance was triggered.
It is the time the instance was created ahead of time: when the previous occurrence fired, or, for the
first occurrence, shortly after the Workflow was deployed. `event.schedule.scheduledTime` is the trigger time.

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
6. Save the outputs, then `npx wrangler delete` to stop it. `npx wrangler workflows delete workflows-cron-timestamp-repro`
   removes the Workflow, and it also deletes the instances and their outputs.

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

- The first instance: `event.timestamp` is about 30 seconds after `wrangler deploy` created the Workflow,
  more than 3 minutes before the instance fired.
- Later instances: `event.timestamp` is just before the previous occurrence started running, so
  `scheduledTimeMinusEventTimestampMs` is about the cron interval (300000 ms here).
- `event.timestamp` is equal to the `queued` field of `GET /accounts/{account_id}/workflows/{workflow_name}/instances/{instance_id}`.
  The next occurrence's instance already exists in `queued` status before it fires
  (`GET /accounts/{account_id}/workflows/{workflow_name}` shows its ID as `schedules[].next_instance`).
- `GET .../workflows/{workflow_name}/instances` (list) shows `created_on` as the scheduled slot time, which is different from `queued`.

### Results

Run on 2026-10-17 with wrangler 4.151.1. All times are UTC as returned by the API. The raw values are in
[`results/2026-10-17.json`](results/2026-10-17.json).

- `wrangler deploy`: 19:36:54.035 to 19:36:59.911. The Workflow's `created_on`: 19:36:58.922.

| Instance | `queued` (= `event.timestamp`) | `event.schedule.scheduledTime` | `startedAt` (first step) | `scheduledTimeMinusEventTimestampMs` | list `created_on` |
| --- | --- | --- | --- | --- | --- |
| `*/5 * * * *-1792266000000` | 19:37:31.319 | 19:40:50.687 | 19:40:51.591 | 199368 | 19:40:00.000 |
| `*/5 * * * *-1792266300000` | 19:40:51.257 | 19:45:50.687 | 19:45:51.795 | 299430 | 19:45:00.000 |
| `*/5 * * * *-1792266600000` | 19:45:51.364 | 19:50:50.687 | (did not run) | | (not listed) |

- The second instance was created (`queued` 19:40:51.257) just before the first one started (`start` 19:40:51.287),
  and its `event.timestamp` is that time.
- The third instance was already `queued` before it fired. It was terminated at 19:47:25.950 after the Worker was deleted,
  and it did not appear in the list while it was `queued`.
- The same happens on a Workflow deployed with Pulumi (`cloudflare.Workflow` with `schedules`) on a daily schedule:
  the first scheduled instance had `event.timestamp` equal to its `queued` time, about 21 hours before it fired,
  shortly after the Workflow was created.

## Why it matters

Code that uses `event.timestamp` as the start time of the run gets a time one interval old, and for the first
occurrence, the deploy time. A run that compares its own start time with a previous run (for example to avoid
overwriting newer results with older ones) wrongly decides that it is older.

The local implementation in [cloudflare/workers-sdk#14768](https://github.com/cloudflare/workers-sdk/pull/14768)
sets `timestamp: new Date(cron.scheduledTime)` for cron instances, which is different from production.
