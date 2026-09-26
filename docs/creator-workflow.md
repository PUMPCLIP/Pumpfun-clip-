# Creator workflow expansion

The `/dashboard` command center adds the creator-clipper marketplace workflow on top of the existing PumpClip native media stack.

## Included UI

- Brief discovery with category, difficulty, platform, deadline and reward signals.
- Creator brief builder covering source, clip count, length, audience, tone, examples, exclusions, reward, deadline and revision policy.
- Pre-launch checklist that blocks the mental model of publishing an incomplete brief.
- Portfolio directory with specialties, approval rate, rating, campaign count and availability.
- Submission review workspace with version history (V1/V2/V3), timeline markers, structured revision reasons and a clear approve action.
- Job-locked campaign chat and customer-care dispute escalation.

## Data model

`013_creator_workflow.sql` adds structured brief fields to `campaigns`, plus `submission_versions`, `review_comments`, `campaign_messages`, and `campaign_disputes`. The existing studio/native worker APIs remain responsible for ingest, FFmpeg rendering, and asynchronous job processing.

This dashboard is intentionally safe to preview without a configured database; production wiring should bind the interaction handlers to the existing `/api/v1` session and campaign endpoints and the new migration tables.
