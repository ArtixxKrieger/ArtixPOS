# Security Policy

## Supported Versions

Only the latest production version of ArtixPOS receives security updates.

| Version | Supported |
|---|---|
| Latest | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in ArtixPOS, **please do not open a public GitHub issue.** Public disclosure before a fix is in place puts users at risk.

Instead, report it responsibly:

**Email:** security@artixpos.com *(replace with your actual contact)*

Please include in your report:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact (what an attacker could do)
- Any suggested fix, if you have one

### What to expect

- **Acknowledgement** within 48 hours of your report
- **Status update** within 7 days
- **Credit** in the release notes if you'd like recognition (optional)

We take every report seriously and will work to resolve confirmed issues as quickly as possible.

## Scope

Reports are welcome for:
- Authentication or authorization bypass
- Data exposure across tenant boundaries
- Injection vulnerabilities (SQL, XSS, etc.)
- Business logic flaws with real-world impact

Out of scope:
- Theoretical vulnerabilities without a working proof of concept
- Issues in third-party dependencies (report those upstream)
- Denial of service via resource exhaustion without meaningful impact
- Social engineering or physical access attacks

## Disclosure Policy

We follow a **coordinated disclosure** model. Once a fix is deployed, we will publish a brief advisory acknowledging the reporter (unless anonymity is requested).

Thank you for helping keep ArtixPOS and its users safe.
