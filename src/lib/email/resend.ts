import { Resend } from "resend";

// Initialize Resend client
const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Generate a random 6-digit code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
export async function sendVerificationEmail(
  email: string,
  code: string,
  businessName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.error("Resend API key not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Vistrial <noreply@vistrial.io>",
      to: email,
      subject: "Verify your Vistrial account",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 24px; font-weight: bold;">V</span>
              </div>
              <p style="margin: 12px 0 0 0; font-size: 20px; font-weight: 600; color: #111827;">Vistrial</p>
            </td>
          </tr>
          
          <!-- Main Card -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 40px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center;">
                Verify your email
              </h1>
              
              <p style="margin: 0 0 32px 0; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.5;">
                ${businessName ? `Welcome to Vistrial, ${businessName}! ` : ""}Enter this code to verify your account:
              </p>
              
              <!-- Code Box -->
              <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px;">
                <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">
                  ${code}
                </p>
              </div>
              
              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                This code expires in 10 minutes.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
                If you didn't request this code, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Vistrial. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: "Failed to send email" };
  }
}

// Send welcome email after verification
export async function sendWelcomeEmail(
  email: string,
  businessName: string,
  ownerName: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Vistrial <noreply@vistrial.io>",
      to: email,
      subject: `Welcome to Vistrial, ${ownerName}!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 24px; font-weight: bold;">V</span>
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 40px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #111827;">
                Welcome to Vistrial! 🎉
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280; line-height: 1.6;">
                Hi ${ownerName},
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280; line-height: 1.6;">
                Your account for <strong>${businessName}</strong> is all set up. Here's what you can do next:
              </p>
              
              <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #6b7280; line-height: 1.8;">
                <li>Create your booking page</li>
                <li>Set up your services and pricing</li>
                <li>Start accepting bookings</li>
                <li>Enable quote follow-ups</li>
              </ul>
              
              <a href="https://app.vistrial.io/dashboard" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Go to Dashboard →
              </a>
            </td>
          </tr>
          
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Vistrial. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Welcome email error:", err);
    return { success: false, error: "Failed to send email" };
  }
}
