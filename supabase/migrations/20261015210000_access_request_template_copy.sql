-- Replace the unfinished reply templates with the approved visitor wording.
-- {{name}} is filled when the email is sent.

UPDATE public.access_request_templates
SET
  subject = 'We received your Private Access request',
  body = E'Hi {{name}},\n\nThanks for requesting Private Access to Vistrial.\n\nA person on our team reviews every request and will reply by email.\n\nWe bring on a limited number of teams at a time so each one is set up properly. If your team is a fit, we will walk you through next steps, including guided setup inside your workspace.\n\nIf you want to add anything to your request, just reply to this email.\n\nThe Vistrial team',
  updated_at = now()
WHERE id = 'access_confirm';

UPDATE public.access_request_templates
SET
  subject = 'We received your request about Vistrial Custom',
  body = E'Hi {{name}},\n\nThanks for reaching out about Vistrial Custom.\n\nA person on our team will reply by email to set up a short call about what your team needs.\n\nIf it helps, reply with a few details: your team size, the tools you use today, and how many businesses you manage.\n\nThe Vistrial team',
  updated_at = now()
WHERE id = 'custom_confirm';

UPDATE public.access_request_templates
SET
  subject = 'You''re on the Vistrial waitlist',
  body = E'Hi {{name}},\n\nThanks for your interest in Vistrial. We bring on a limited number of teams at a time, and we are not able to bring your team on just yet.\n\nWe will email you when we can bring your team on. Your request stays on file for up to 12 months.\n\nIf anything changes on your side, reply to this email.\n\nThe Vistrial team',
  updated_at = now()
WHERE id = 'waitlisted';
