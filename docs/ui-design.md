# PUMPCLIP interface

The interface uses white as the working surface and light green as the context surface. Deep green is reserved for text, primary actions and video framing. The dark video canvas helps footage remain legible; the application chrome remains light.

| Token | Value | Use |
| --- | --- | --- |
| Pine | `#1e4330` | Primary text and buttons |
| Forest | `#356b44` | Links and interactive emphasis |
| Mint | `#f2faee` | Page background and supporting panels |
| Pale green | `#e6f4db` | Access and workflow highlights |
| White | `#ffffff` | Forms, cards and editing surfaces |
| Border | `#d5e5d0` | Quiet separation |

## Designed screens and states

- Public home and campaign discovery, including an empty marketplace state.
- Account access for sign-in, wallet link, token eligibility, insufficient balance and RPC unavailable.
- Campaign draft, licensed source upload, rules, fee review, SOL funding and publish controls.
- Campaign detail, clip submission and streamer review.
- Dedicated clip studio with source or vertical crop preview, timecode, scrub timeline, in/out controls, caption preview, render status, download and submission.
- Mobile navigation, form focus indicators, loading and error states, branded 404 page and reduced-motion support.

The studio preview shows the intended 9:16 crop and caption placement. The actual MP4 is rendered by the FFmpeg worker. AI-generated candidates, automatic transcription and social platform publishing are not present. See [feature status](feature-status.md) and [launch readiness](launch-readiness.md).
