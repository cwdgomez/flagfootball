// =============================================================
//  CGMax FFTP — Photo Consent Email Sender
//  Receives signed consent form data, emails copies to
//  the parent/guardian AND the coach (cgmaxfftp@itcc.llc).
// =============================================================

const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const resend = new Resend(process.env.RESEND_API_KEY);

// Supabase (optional — for storing parent-uploaded photos)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function getCorsOrigin(req) {
  const allowed = ['https://cgmaxfftp.com', 'https://cwdgomez.github.io'];
  const origin = req.headers.origin || '';
  return allowed.includes(origin) ? origin : allowed[0];
}

module.exports = async function handler(req, res) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { player, age, jersey, team, season, guardian, relation, email, phone, signature, date, photo, coachUid } = req.body;

    // Validate required fields
    if (!player || !age || !team || !season || !guardian || !relation || !email || !signature || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate photo if provided (base64 data URL, max ~2 MB after encoding)
    if (photo && typeof photo === 'string') {
      const photoSizeBytes = Math.ceil((photo.length - (photo.indexOf(',') + 1)) * 3 / 4);
      if (photoSizeBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Photo too large. Please use a smaller image.' });
      }
    }

    // Optionally store photo in Supabase parent_photos table
    if (photo && supabase) {
      try {
        // Validate coachUid is a UUID before storing
        const validUid = coachUid && /^[0-9a-f-]{36}$/i.test(coachUid) ? coachUid : null;
        await supabase.from('parent_photos').upsert({
          player_name: player,
          team_name: team,
          season: season,
          guardian_email: email,
          photo_base64: photo,
          submitted_at: new Date().toISOString(),
          coach_user_id: validUid
        }, { onConflict: 'player_name,team_name,season' });
      } catch (dbErr) {
        console.error('Supabase parent_photos store error (non-fatal):', dbErr);
        // Non-fatal — continue sending email even if DB store fails
      }
    }

    // Build the HTML email body
    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#080808;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#AA0000,#CC1100);padding:24px;text-align:center;">
    <div style="font-size:24px;font-weight:900;letter-spacing:6px;color:#FFD700;">CGMAX FFTP</div>
    <div style="font-size:14px;letter-spacing:3px;color:rgba(255,255,255,.7);margin-top:6px;">PHOTO &amp; MEDIA CONSENT FORM</div>
  </div>

  <!-- BODY -->
  <div style="padding:24px;">
    <div style="font-size:12px;color:#888;letter-spacing:1px;margin-bottom:16px;">SIGNED: ${date}</div>

    <!-- PLAYER INFO -->
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#CC9900;margin-bottom:10px;">PLAYER INFORMATION</div>
      <table style="width:100%;font-size:14px;color:#f2f2f2;" cellpadding="4">
        <tr><td style="color:#888;width:120px;">Player Name:</td><td><strong>${escHtml(player)}</strong></td></tr>
        <tr><td style="color:#888;">Age:</td><td>${escHtml(age)}</td></tr>
        ${jersey ? `<tr><td style="color:#888;">Jersey #:</td><td>${escHtml(jersey)}</td></tr>` : ''}
        <tr><td style="color:#888;">Team:</td><td>${escHtml(team)}</td></tr>
        <tr><td style="color:#888;">Season:</td><td>${escHtml(season)}</td></tr>
      </table>
    </div>

    ${photo ? `<!-- PLAYER PHOTO -->
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#CC9900;margin-bottom:10px;">PLAYER PHOTO</div>
      <img src="${photo}" alt="Player photo" style="max-width:200px;max-height:200px;border-radius:10px;border:2px solid #333;">
      <div style="font-size:11px;color:#555;margin-top:8px;">Uploaded by parent/guardian with consent</div>
    </div>` : ''}

    <!-- GUARDIAN INFO -->
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#CC9900;margin-bottom:10px;">PARENT / GUARDIAN</div>
      <table style="width:100%;font-size:14px;color:#f2f2f2;" cellpadding="4">
        <tr><td style="color:#888;width:120px;">Name:</td><td><strong>${escHtml(guardian)}</strong></td></tr>
        <tr><td style="color:#888;">Relationship:</td><td>${escHtml(relation)}</td></tr>
        <tr><td style="color:#888;">Email:</td><td>${escHtml(email)}</td></tr>
        ${phone ? `<tr><td style="color:#888;">Phone:</td><td>${escHtml(phone)}</td></tr>` : ''}
      </table>
    </div>

    <!-- CONSENT SUMMARY -->
    <div style="background:rgba(170,0,0,.08);border:1px solid rgba(170,0,0,.25);border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#CC9900;margin-bottom:10px;">CONSENT GRANTED</div>
      <div style="font-size:13px;color:rgba(255,255,255,.6);line-height:1.7;">
        The undersigned parent/legal guardian confirms they have read and agree to all terms of the CGMax FFTP Photo &amp; Media Consent Form, including:
        <ul style="margin:8px 0;padding-left:18px;">
          <li>Permission for the child's photo to be taken and displayed within the app</li>
          <li>Understanding that photos are stored locally on the coach's device only</li>
          <li>Understanding that consent may be withdrawn at any time</li>
          <li>Confirmation of legal authority to provide consent for this minor</li>
        </ul>
      </div>
    </div>

    <!-- SIGNATURE -->
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#CC9900;margin-bottom:10px;">SIGNATURE</div>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:12px;text-align:center;">
        <img src="${signature}" alt="Signature" style="max-width:100%;height:auto;max-height:120px;">
      </div>
      <div style="font-size:12px;color:#888;margin-top:6px;">${escHtml(guardian)} · ${date}</div>
    </div>

    <!-- FOOTER NOTE -->
    <div style="font-size:11px;color:#555;line-height:1.6;border-top:1px solid #222;padding-top:12px;">
      This is an automated confirmation from CGMax FFTP. This consent is valid for the ${escHtml(season)} season only.
      To withdraw consent, contact your coach directly. For questions about data handling, email
      <a href="mailto:cgmaxfftp@itcc.llc" style="color:rgba(255,215,0,.4);text-decoration:none;">cgmaxfftp@itcc.llc</a>.
    </div>
  </div>

  <!-- EMAIL FOOTER -->
  <div style="background:#0a0a0a;padding:16px;text-align:center;border-top:1px solid #222;">
    <div style="font-size:10px;letter-spacing:2px;color:#444;">
      CGMax FFTP · ITCC LLC · Youth Flag Football Technology
    </div>
  </div>
</div>
</body>
</html>`;

    // Send to parent/guardian
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'CGMax FFTP <noreply@itcc.llc>',
      to: email,
      subject: `Photo Consent Signed — ${player} · ${team}`,
      html: htmlBody,
    });

    // Send copy to coach
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'CGMax FFTP <noreply@itcc.llc>',
      to: 'cgmaxfftp@itcc.llc',
      subject: `[Consent Received] ${player} · ${team} · ${season}`,
      html: htmlBody,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Consent email error:', err);
    return res.status(500).json({ error: 'Failed to send consent email. Please try again.' });
  }
};

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
