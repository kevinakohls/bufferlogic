# Cloud Run reviewer demo

This configuration prepares a public, stateless demo. It does not create cloud
resources. Workspaces are sent to the server for calculation, then returned to the
browser; they are not saved on the server. Save workspace downloads a local file.
Visitors have separate browser state. Use fictional examples for the public demo.

## Runtime settings

- `PORT`: Cloud Run supplies this (8080 by default). The server binds to
  `0.0.0.0` when present. Without it, local `npm run ui` still binds to loopback
  using `BUFFERLOGIC_PORT` or port 3000.
- `BUFFERLOGIC_PUBLIC_ORIGIN`: the exact HTTPS service origin, for example
  `https://YOUR-SERVICE-URL.run.app`, with no path. This enables that hostname
  and same-origin browser requests behind Google's TLS proxy. Other public hosts
  and cross-origin requests remain rejected. Forwarded headers are not trusted
  to determine the allowed origin.

The multi-stage Dockerfile builds TypeScript with the lockfile, then runs Node 24
as a non-root user without development dependencies. It includes the UI and bundled
examples required by the server. Build locally with `docker build -t bufferlogic .`.
Run with `docker run --rm -p 8080:8080 bufferlogic`; local HTTP requests still work.

## Deployment checklist (perform later)

1. Select a Google Cloud project with billing enabled and configure a budget alert.
   Alerts do not cap charges. Confirm current regional pricing and free allowances.
2. Build/deploy the Dockerfile to Cloud Run initially with authentication required.
   Use request-based billing, minimum instances 0, maximum instances 1, one CPU,
   512 MiB memory, concurrency 1 and a 60-second request timeout initially.
   Scheduling uses synchronous CPU work; one request per instance avoids competing
   calculations. Large requests may time out and should be reduced for the demo.
3. Obtain the assigned HTTPS service URL and set `BUFFERLOGIC_PUBLIC_ORIGIN` to
   that exact origin. The initial revision rejects public-host requests until this
   setting is present; Cloud Run's TCP startup check can still succeed.
4. Test the configured revision, then enable unauthenticated access when ready to
   publish the demo. Cloud Run terminates HTTPS; no certificate purchase is needed.
5. In a private browser window, load the example, schedule, edit priorities, compare
   against a captured baseline, download a workspace and reopen it. Check a second
   browser has independent state. Check templates, task deletion and calendar dates.
6. Share the assigned URL, monitor usage, and remove or restrict the demo when done.

Maximum instances limits scaling, not total spending. Builds, image storage,
network traffic and running requests can incur charges. No domain purchase,
database or sign-in implementation is needed for this reviewer demo. The public
service is a demo without persistent accounts or saved cloud workspaces.
