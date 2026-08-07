# Chinawheely Vercel Backend

This is a standalone Vercel serverless project that receives booking form submissions from the Chinawheely static website and forwards them via SendGrid. It replaces the previous formsubmit.co integration with a fully controllable backend.

## Files

- `api/booking.js` — Vercel serverless function: validates the booking form, checks honeypot, and sends an email via SendGrid.
- `package.json` — minimal project metadata so Vercel detects a Node.js project.
- `.env.example` — list of environment variables to set in the Vercel dashboard.
- `README.md` — this guide.

## What changed vs. formsubmit.co

- **No third-party form processor** — the booking form now posts to your own Vercel function.
- **Honeypot anti-spam** — hidden `website` field is silently rejected if filled.
- **Email validation** — validates email format and required fields (`firstName`, `lastName`, `email`, `phone`).
- **Payload size limit** — rejects requests larger than 100 KB.
- **Readable email subjects** — e.g. `Airport Pickup Beijing Capital Airport → Forbidden City from John Smith - Chinawheely [CWC-XXXX]`.
- **Formatted email body** — every submitted field is sent as a clean HTML table plus plain text, with route, price, and service type highlighted.
- **Booking reference, timestamp, and submitter IP** — automatically added to the email for easy tracking.
- **CORS enabled** — can be deployed separately from the static frontend if needed.

## Deploy to Vercel

1. Sign in to Vercel and import this folder (`Chinawheely-Website houduan 7.30`).
2. In **Project Settings → Environment Variables**, add the variables from `.env.example`.
   - `SENDGRID_API_KEY` is required.
   - `SENDGRID_FROM_EMAIL` should be a verified sender address in your SendGrid account.
3. Deploy. The booking endpoint will be:

   ```
   https://<your-project>.vercel.app/api/booking
   ```

## Connect the frontend

If the frontend is deployed on the **same Vercel project** (static + API together), the form action can stay relative:

```html
<form action="/api/booking" method="POST">...</form>
```

If the frontend is deployed on a **different domain or host** (e.g., Netlify, Cloudflare Pages, or another Vercel project), update the form action to the absolute API URL:

```html
<form action="https://<your-project>.vercel.app/api/booking" method="POST">...</form>
```

Also set `SUCCESS_URL` to the absolute URL of your `thank-you.html` page:

```
SUCCESS_URL=https://www.chinawheely.com/thank-you.html
```

## Form fields

The function expects a normal `application/x-www-form-urlencoded` POST with at least:

- `firstName`
- `lastName`
- `email`
- `phone`

Any additional fields are included in the email body.

## Honeypot

Include a hidden `website` field in the form to catch bots. If it has a value, the request is treated as spam and returns a silent success redirect.

```html
<input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">
```

## CORS

By default, `ALLOWED_ORIGINS=*` allows cross-origin POSTs from any frontend. For production, set it to your exact domains:

```
ALLOWED_ORIGINS=https://www.chinawheely.com,https://beijing.chinawheely.com
```

## Testing

After deployment, send a test POST:

```bash
curl -X POST https://<your-project>.vercel.app/api/booking \
  -d "firstName=Test&lastName=User&email=test@example.com&phone=1234567890&city=Beijing"
```

You should receive an email at `RECIPIENT_EMAIL` and be redirected to `SUCCESS_URL`.

## Security notes

- Keep `SENDGRID_API_KEY` secret; never commit it.
- Consider adding a reCAPTCHA / hCaptcha check in the function if spam becomes a problem.
- If you later add payment processing, do not use this lightweight function; switch to a proper checkout API with signature verification.
