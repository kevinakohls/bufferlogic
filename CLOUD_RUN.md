# Cloud Run reviewer demo

The public demo is https://bufferlogic-859125571309.us-central1.run.app
(project `bufferlogic`, service `bufferlogic`, region `us-central1`).
The configuration files alone do not create cloud resources. Workspaces are sent to the server for calculation, then returned to the
browser; they are not saved on the server. Save workspace downloads a local file.
Visitors have separate browser state. A local browser recovery copy can retain
edits and captured baselines on that device; it is not server storage or account
history. Download files for portable backups and clear recovery on shared devices.
Use fictional examples for the public demo.

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

## Initial deployment checklist

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

## Release an update

Use GitHub pull requests and GitHub Actions for current review and testing.
Merging, updating a local PowerShell checkout and deploying the hosted service are
three separate actions. Deployment remains manual.

After the catch-up pull request is merged, use
https://github.com/kevinakohls/bufferlogic and its reviewed `main` revision for
releases. The initial deployment used a GitHub feature-branch snapshot; later
releases were uploaded from locally merged GitLab code. Those steps do not keep
either site's `main` synchronized automatically. Do not deploy the older feature
branches as if they were the latest release.

For a fresh Cloud Shell checkout, clone the public repository into a new folder:

```bash
git clone https://github.com/kevinakohls/bufferlogic.git bufferlogic-release
cd bufferlogic-release
```

If that folder already exists, inspect it or choose a new folder instead of
overwriting it. From a clean GitHub checkout, fetch and inspect the release:

```bash
git fetch origin
git switch --detach origin/main
git status --short
git log -1 --format='%H %s'
npm ci
npm test
```

Here `origin` must be `https://github.com/kevinakohls/bufferlogic.git`. Check with
`git remote get-url origin` first. Resolve unexpected local changes and stop if
any check fails. Record the full source commit in the release notes. An archive
exported from that verified commit is also suitable; record its source commit
and run the same npm checks after extraction.

From that verified source directory, deploy the existing public demo:

```bash
gcloud run deploy bufferlogic \
  --project bufferlogic \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 1 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 60 \
  --port 8080 \
  --update-env-vars BUFFERLOGIC_PUBLIC_ORIGIN=https://bufferlogic-859125571309.us-central1.run.app
```

This command builds and deploys a new revision and may incur charges. The URL
stays the same. Test it in a private browser: example loading, recalculation,
Compare, task deletion, workspace download/reopen and a separate visitor session.
Record the resulting revision alongside the source commit. Keep budget alerts
and monitor usage. If validation fails, route traffic back to the last verified
revision in Cloud Run's **Revisions** tab.

A future deployment pipeline can automate this after merging. It requires
separate Google Cloud authentication and deployment permissions; it is not yet
configured.
