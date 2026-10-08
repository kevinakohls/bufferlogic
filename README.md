# BufferLogic

**Protect the Buffer. Finish Faster.**

> **AI makes code faster. BufferLogic makes projects finish faster.**

BufferLogic applies **Critical Chain Project Management (CCPM)** and the **Theory of Constraints (TOC)** to AI-powered software development.

**Review the working deterministic P50 milestone:** follow the
[Reviewer Guide](REVIEWER_GUIDE.md) for Windows commands and expected results.
The current engine supports JSON/CSV scheduling, scenario comparison,
approximate whole-project percentiles from the baseline Critical Chain, and
Excel-compatible exports. The progress engine also forecasts remaining work
from JSON snapshots with active estimates and completed actuals.
The buffer management and GitLab/Duo integration
described below remain future goals. See [Development](DEVELOPMENT.md) for
the input format and scheduling contract.

As AI agents become capable of coding, reviewing, testing, securing, and deploying software, the next challenge is no longer simply doing more work faster.

The challenge is determining:

**What work should we do next to make the entire project finish sooner?**

BufferLogic identifies the work currently controlling project completion, monitors protective buffers, and helps focus AI agents on the work that matters most.

## The Problem

Generative AI dramatically increases the speed at which individual software-development tasks can be completed.

But optimizing individual tasks does not necessarily optimize the project.

A project can generate code faster while remaining constrained by:

- Testing
- Code review
- Security analysis
- Integration
- Deployment
- Specialized resources
- Decisions and approvals

**Generative AI does not eliminate constraints. It moves them.**

BufferLogic treats software development as a system rather than a collection of independent tasks.

## How BufferLogic Works

BufferLogic analyzes:

- Task dependencies
- Resource requirements
- Task status and progress
- Resource contention
- Critical Chain position
- Feeding buffers
- Project buffer consumption

From this information, BufferLogic determines the **Critical Chain** — the sequence of work currently controlling when the project can finish.

It then asks a different question from conventional project-management systems.

Instead of:

**What task is late?**

BufferLogic asks:

**What should we work on now to protect the project completion date?**

## Buffer Management

Critical Chain protects the project using buffers rather than embedding safety into every individual task.

BufferLogic monitors those buffers to determine whether changing project conditions actually threaten completion.

A delayed task outside the Critical Chain may require little or no intervention.

A seemingly small delay consuming a feeding buffer or project buffer may require immediate attention.

This provides AI agents with a system-level priority signal.

**AI agents do the work. BufferLogic determines which work matters most.**

## Example

Imagine a development project in which several events occur simultaneously:

- A test fails.
- A security finding appears.
- A merge request is waiting for review.
- Another developer finishes early.

A conventional system may flag all three problems as urgent.

BufferLogic evaluates their effect on the Critical Chain and project buffer.

If the delayed review is consuming the buffer protecting project completion while the failed test is on a non-critical path with available feeding-buffer protection, BufferLogic prioritizes the review.

The objective isn't to eliminate every delay.

The objective is to **protect project completion**.

## Architecture

The initial BufferLogic architecture is:

**GitLab → BufferLogic TypeScript Engine → Critical Chain & Buffer Analysis → GitLab Duo Agent Platform → Recommendation / Action**

The BufferLogic engine will:

1. Build the project dependency network.
2. Account for resource contention.
3. Identify the Critical Chain.
4. Establish project and feeding buffers.
5. Monitor buffer consumption.
6. Identify the work creating the greatest threat to project completion.
7. Provide that priority to an AI agent for recommendation or action.

## Hackathon

BufferLogic is being developed for **GitLab Transcend: Life After Code**.

The project explores what happens after AI makes code generation dramatically faster.

Our answer:

**The next opportunity is coordinating AI work around the constraint of the entire development system.**

## Development Status

🚧 **Hackathon prototype under active development**

The first milestone is an end-to-end demonstration in which BufferLogic:

**GitLab project → Critical Chain calculation → buffer status → AI-agent recommendation/action**

The initial implementation will use TypeScript and the GitLab Duo Agent Platform.

Future development may incorporate historical task-duration distributions and Monte Carlo simulation to estimate the probability of
