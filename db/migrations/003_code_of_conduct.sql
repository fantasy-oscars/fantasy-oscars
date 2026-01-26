-- Add CMS static entry for Code of Conduct (live immediately)

INSERT INTO public.cms_static_content (key, title, body_markdown)
VALUES
  (
    'code_of_conduct',
    'Code of Conduct',
    $$## Purpose

This Code of Conduct exists to help maintain a respectful, welcoming environment for everyone using the app. It sets expectations for behavior and outlines how concerns are handled.

## Expected Behavior

We expect users to interact with others in a respectful and considerate manner. This includes engaging in good faith, respecting differing opinions, and contributing constructively to shared spaces within the app.

## Prohibited Behavior

Prohibited behavior includes, but is not limited to:

- Harassment, abuse, or intimidation
- Hate speech or discriminatory language
- Impersonation of others
- Posting unlawful or malicious content
- Disrupting the normal operation of the app

## Reporting Concerns

If you encounter behavior or content that you believe violates this Code of Conduct, you may report it to us. Reports should include enough detail to allow us to understand and review the concern.

## Enforcement

We reserve the right to take appropriate action in response to violations of this Code of Conduct, including content removal, account suspension, or account termination. Enforcement decisions are made at our discretion and may be taken without prior notice.$$
  )
ON CONFLICT (key) DO NOTHING;

