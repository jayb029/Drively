# Security Policy

## Supported versions

Security fixes are applied to the latest published version of Drively and the current `main` branch. Older builds may not receive separate fixes.

## Reporting a vulnerability

Do not report suspected vulnerabilities in a public issue, discussion, or pull request.

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories** and then **Report a vulnerability**.
3. Include the affected version or commit, the impacted platform, reproduction steps, the expected impact, and any suggested mitigation.

If private vulnerability reporting is unavailable, contact the repository owner through their GitHub profile and ask for a private reporting channel. Do not include exploit details in that initial public message.

Please allow time to reproduce and assess the report before publishing details. The maintainer will coordinate disclosure after a fix or mitigation is available when practical.

## Security scope

Reports are particularly useful when they involve:

- Unauthorized disclosure or modification of driving records, supervisor details, signatures, or location-derived data
- Unsafe parsing or import of backup files
- Exported data being exposed without a clear user action
- Background location collection that continues outside the behavior shown to the user
- Android backup behavior that bypasses the in-app cloud-backup choice
- Update, build, or native integration behavior that could allow untrusted code to run

The repository contains a client-side mobile application with no Drively account service or hosted application backend. Weather requests, when enabled, are sent directly from the device to Open-Meteo. Reports should describe a realistic path through code maintained in this repository and the resulting impact.

## Good-faith research

Use test data and accounts or devices you own or are authorized to test. Do not access another person's data, disrupt services, use social engineering, or retain sensitive information beyond what is necessary to document the issue.

Good-faith reports that follow this policy will be handled constructively. This policy does not authorize testing of third-party services or infrastructure.
