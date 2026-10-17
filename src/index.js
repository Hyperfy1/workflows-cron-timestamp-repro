import { WorkflowEntrypoint } from "cloudflare:workers";

export class ReproWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Taken inside a step, so this is the time the instance actually started running
    // (and it stays the same if the instance is replayed).
    const startedAt = await step.do("started-at", async () => Date.now());

    const timestamp = new Date(event.timestamp).getTime();
    const scheduledTime = event.schedule?.scheduledTime ?? null;

    const result = {
      instanceId: event.instanceId,
      cron: event.schedule?.cron ?? null,
      eventTimestamp: new Date(timestamp).toISOString(),
      scheduledTime:
        scheduledTime === null ? null : new Date(scheduledTime).toISOString(),
      startedAt: new Date(startedAt).toISOString(),
      // Expected to be close to 0 if `event.timestamp` is the time the instance was triggered.
      scheduledTimeMinusEventTimestampMs:
        scheduledTime === null ? null : scheduledTime - timestamp,
    };
    console.log(JSON.stringify(result));
    return result;
  }
}

export default {
  async fetch() {
    return new Response("Not Found", { status: 404 });
  },
};
