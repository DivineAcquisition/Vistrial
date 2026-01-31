interface OTPEmailParams {
  name: string
  otp: string
  expiresInMinutes: number
}

export function generateOTPEmailHTML({ name, otp, expiresInMinutes }: OTPEmailParams): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width:400px;">
          <tr>
            <td style="background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
              <h1 style="margin:0 0 8px;font-size:18px;color:#111827;">Verification Code</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Hi ${name}, use this code to verify your email:</p>
              <div style="background:#f3f4f6;border-radius:6px;padding:16px;text-align:center;margin-bottom:24px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#4f46e5;">${otp}</span>
              </div>
              <p style="margin:0;font-size:12px;color:#9ca3af;">This code expires in ${expiresInMinutes} minutes.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} VisTrial</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function generateOTPEmailText({ name, otp, expiresInMinutes }: OTPEmailParams): string {
  return `Hi ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in ${expiresInMinutes} minutes.\n\n© ${new Date().getFullYear()} VisTrial`
}
