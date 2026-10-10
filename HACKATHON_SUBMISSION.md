# Submission draft and demonstration guide

This document prepares the submission; it does not assert that all event
eligibility or submission requirements have been verified. Confirm the items
below against the event's official rules before submitting.

## Draft description

**BufferLogic: supervised AI review and validation for a shared-resource scheduling engine**

BufferLogic helps project managers understand when projects can finish when they
compete for the same people and resources. Its TypeScript engine calculates
resource-constrained critical chains and approximate project completion
percentiles. A local web interface supports reusable project templates, calendar
edits, actual progress, deadlines, checklists, schedule visualization and resource
utilization. Users save their workspaces and export reports for Excel.

The post-code problem is ensuring that a proposed change preserves the scheduling
contract before it becomes an accepted release. Small boundary mistakes can
produce misleading deadline warnings even when the rest of the application works.

We use GitLab Duo Agent Platform's automated Code Review flow and GitLab CI in a
**Supervised** workflow. For a controlled demonstration, we introduced a deadline
boundary regression on a separate merge-request branch. The engine incorrectly
marked a completion on the deadline date as late. An unchanged regression test
caught the error. Duo reviewed the diff, explained the contradiction with the
whole-date deadline contract, and suggested restoring the strict comparison. A
human approved the correction, the fix was committed, and the subsequent branch
and merge-request pipelines passed. The corrected merge request was then merged.

GitLab hosts the source and review history. Its application test jobs install
locked dependencies, compile TypeScript and run the automated suite on Node.js
22 and 24. SAST and Secret Detection are configured alongside application tests.
The demonstration shows AI-assisted review, explicit human control over the fix,
and automated validation after code submission. It does not claim autonomous
repair, automatic deployment or an engine-to-Duo integration.

The application and its source are MIT licensed. The repository includes local
run instructions, fixtures and tests. The demo regression is intentionally
introduced for demonstration, not evidence of a naturally occurring production
incident.

## Evidence to retain

- Submission repository: https://gitlab.com/darkvole1/BufferLogic
- Demo merge request: https://gitlab.com/darkvole1/BufferLogic/-/merge_requests/1
  Verify that it is the deadline demo before publishing this link.
- Original demo regression: source comparison changed from `>` to `>=`.
- Local reproduction: 139 tests, 138 passed, 1 intentionally failed. The failing
  test is `calendar deadlines include their whole date and milestones use their actual date`.
- Capture/link the failed GitLab application job, including its assertion output.
  The local count alone does not prove a GitLab run.
- Duo's review thread explaining `late` with `daysLate: 0`, and its suggested fix.
- Approved fix commit `2a95fad8`, restoring `>` without modifying tests.
- Passing merge-request pipeline:
  https://gitlab.com/darkvole1/BufferLogic/-/pipelines/2933618810
- Passing branch pipeline:
  https://gitlab.com/darkvole1/BufferLogic/-/pipelines/2933618736
- Verify the above URLs in the project. Pipeline IDs and fix hash come from the
  user's screenshots. The overall Passed badges were observed; record the actual
  Node 22/24 job output and the security jobs separately before making job-level
  claims. A test stage alone may contain security jobs as well as application tests.
- The merged status and final code. Preserve the MR and pipeline records even if
  the source branch is deleted.

## Video script: approximately 2 minutes 45 seconds

Use screen recording with spoken narration. Prepare the relevant pages first.
Keep unrelated browser tabs, personal account details and notifications out of
frame. Do not add third-party logos as decorative assets or copyrighted music.
The quoted event instructions prohibit third-party trademarks; confirm how this
applies to required GitLab UI footage and any other visible brands before final
recording. Do not assume a waiver.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:20 | BufferLogic UI: project forecasts and shared-resource timeline | “BufferLogic predicts project completion when several projects compete for shared resources. Correct scheduling behavior depends on preserving contracts such as what a deadline means.” |
| 0:20–0:45 | Demo MR's original diff and failed application-test job | “This is a controlled regression on a separate branch. It marks a task finishing on its deadline date as late. Our existing test catches that mistake; the working main branch was kept separate.” |
| 0:45–1:20 | GitLab Duo review thread and suggested change | “GitLab Duo's automated Code Review flow identifies the boundary error. It explains that the named deadline date is included, and that ‘late with zero days late’ contradicts that contract. Duo proposes a specific correction.” |
| 1:20–1:45 | Approved fix commit/diff; review unchanged tests | “This is a supervised workflow. I approve the fix. The committed change restores the comparison while leaving the tests intact.” |
| 1:45–2:20 | Passing pipelines; open application job output and security results | “GitLab validates the update after code submission. Here are the application test results and the security checks that actually ran. Both the branch and merge-request pipelines passed for the fix.” |
| 2:20–2:45 | Merged MR, public repository and run instructions | “The verified fix is merged. The public MIT-licensed repository contains the application, tests and reproduction instructions. This demonstrates Duo review, human approval and CI validation after code is written.” |

Show real recorded evidence rather than claiming the already completed flow is
running live. If the rules require a fresh execution in the video, rerun the
controlled workflow and record that execution. Adjust the security/test narration
to the job results you have verified. Avoid spending the video on unrelated UI
features or waiting for jobs to finish.

## Reproduce the supervised workflow

1. Clone the submission repository and run `npm ci`, then `npm test`.
   On Windows use `npm.cmd`. The corrected baseline should pass all tests.
2. Verify automated Code Review flow is enabled for the project's group and that
   the account/project has the required Duo access and runner configuration.
3. Create a new demo branch from its latest `main`.
4. In `src/deadlines.ts`, change only the calendar-date status comparison from
   `difference>0` to `difference>=0`. Leave the numeric deadline comparison and
   all tests unchanged.
5. Run `npm test`; confirm only the intended deadline regression test fails.
6. Commit and push the demo branch. Create a merge request and leave auto-merge
   off. Label its description as a controlled demonstration.
7. Observe the automated Duo review. Preserve the actual agent activity, its
   explanation and suggested change. If it does not trigger, inspect the group
   Code Review flow configuration; do not substitute an ordinary chat transcript
   and claim that an automated flow ran.
8. Approve/apply the suggestion or review a fix made through an available coding
   flow. In the demonstrated run, a suggestion was approved and the fix committed;
   the evidence does not establish unattended agent execution.
9. Check the new pipeline and actual job results. Confirm the fix preserves tests,
   resolve the review and merge after validation. Keep links for the video.

## Submission checks still requiring verification

- **Start Fresh eligibility:** project creation timing and allowed reused code,
  checked against the event's submission-start date and official rules. Neither
  moving code nor making a placeholder public establishes eligibility.
- **Required Duo features:** confirm automated Code Review flow is a qualifying
  Agent Platform feature for the selected track. The flow ran, as shown by Duo
  review activity; event qualification still needs rules confirmation.
- **Public repository:** user confirmed incognito access. Recheck logged out for
  source files, MR activity, pipelines and job logs before submitting.
- **MIT visibility:** LICENSE exists. Check GitLab recognizes it and displays MIT
  in the repository's About section, as the email requires.
- **CI history:** retain failed and corrected pipeline evidence with application
  and security jobs visible. Inspect individual jobs rather than relying only on
  pipeline badges.
- **Video:** replace the placeholder with a publicly visible YouTube demo under
  three minutes, following the event's branding/music requirements.
- **Instructions:** smoke-test clone/install/test/start using the public submission
  repository and confirm the draft's URLs resolve.
- **Final text:** remove or resolve checklist uncertainty before presenting
  eligibility and job-level claims as verified facts.

## Readiness check: October 10, 2026

- Frozen dependency installation succeeded locally with `npm ci`.
- TypeScript build and all 139 tests passed on the documentation branch.
- The local UI started, and loading/calculating the two-house example returned
  72 tasks in two projects.
- The tracked LICENSE begins with MIT License. GitLab About-section recognition
  in the submission project remains unverified.
- Anonymous API access confirms `DarkVole/bufferlogic` is public.
- The supplied submission URL `https://gitlab.com/darkvole1/BufferLogic` redirected
  this environment to GitLab sign-in; anonymous API lookup returned 404. This
  conflicts with the user's successful incognito check, so confirm the exact
  publicly accessible URL before finalizing submission or evidence links.
- The supplied official-rules URL was inaccessible from this environment.
  Start Fresh eligibility, timing and treatment of previously developed code
  remain unverified; obtain the event URL or the relevant rule text.
- GitLab write authentication is unavailable in the cloud. Documentation is
  prepared on `hackathon-submission-demo-guide`; transfer from a locally
  authenticated Git client and merge in the intended submission project.
