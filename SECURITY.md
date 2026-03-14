# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

CGMax FFTP is a progressive web application served from GitHub Pages. The latest deployed version at [cgmaxfftp.com](https://cgmaxfftp.com) is always the only supported version. There are no legacy versions to maintain — all users automatically receive the latest release.

## Reporting a Vulnerability

If you discover a security vulnerability in CGMax FFTP, please report it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

**Email:** [cgmaxfftp@itcc.llc](mailto:cgmaxfftp@itcc.llc)

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant screenshots or proof-of-concept code
- Your name or handle (for credit, if desired)

## Response Timeline

- **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
- **Initial Assessment:** We will provide an initial severity assessment within **5 business days**.
- **Resolution:** We aim to resolve confirmed vulnerabilities within **30 days**, depending on complexity. Critical issues affecting user data will be prioritized for immediate remediation.

## What to Expect

- You will receive updates as we investigate and resolve the issue.
- If the vulnerability is confirmed, we will credit you (with your permission) in our release notes.
- If the report is declined, we will explain why.

## Scope

This policy covers:

- The CGMax FFTP web application (app.html and all associated pages)
- The Vercel serverless backend API endpoints
- Authentication and authorization flows
- Data storage and transmission (Supabase, Stripe webhooks, cloud sync)

Out of scope:

- Third-party services (Supabase, Stripe, Vercel, GitHub Pages, Resend) — report vulnerabilities in those services directly to their respective security teams.
- Social engineering attacks against ITCC LLC staff.

## Safe Harbor

We will not pursue legal action against security researchers who:

- Act in good faith to discover and report vulnerabilities
- Avoid accessing, modifying, or deleting user data beyond what is necessary to demonstrate the vulnerability
- Do not publicly disclose the vulnerability before we have had a reasonable opportunity to address it
