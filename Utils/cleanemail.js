const nodemailer = require("nodemailer");
const {EmailJobSchema, SmtpSchema,SubscriptionSchema} = require("../Controller/Model/model");
const { decrypt } = require("./Encryption");

const disposableDomains = [
  "mailinator.com",
  "tempmail.io",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com"
];

function cleanEmailList(raw,) {
if (!raw) return [];

     if (!raw || typeof raw !== "string") return [];

  // 1️⃣ Extract emails from messy input using TLD boundary
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:com|net|org|io|ai|co|gov|edu|[a-z]{2,})/g;
  const matches = raw.match(regex);
  if (!matches) return [];

  // 2️⃣ Normalize (lowercase + trim) and remove duplicates
  let uniqueEmails = [...new Set(matches.map(e => e.toLowerCase().trim()))];

  // 3️⃣ Filter invalid/disposable emails
  const validEmails = uniqueEmails.filter(email => {
    // Basic regex validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) return false;

    // Remove disposable emails
    const domain = email.split("@")[1];
    if (disposableDomains.includes(domain)) return false;

    return true;
  });

  return validEmails;
}




async function startSending(jobId) {
  const job = await EmailJobSchema.findById(jobId).populate("smtpId");
  if (!job || job.status !== "running") return;

  const smtp = job.smtpId;

  // Estimated time
  const totalEmails = job.pending.length;
  const estimatedSeconds = totalEmails * job.interval;
  const estimatedTime = `${Math.floor(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`;

  job.estimatedTime = estimatedTime;
  await job.save();

  // Create transporter
  const decryptedPassword = decrypt(smtp.password);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: decryptedPassword },
    tls: { rejectUnauthorized: false }
  });

  // Start sequential sending (no recursion)
  while (true) {
    const currentJob = await EmailJobSchema.findById(jobId).populate("smtpId");
    if (!currentJob || currentJob.status !== "running") return;

    // All emails done
    if (currentJob.pending.length === 0) {
      currentJob.status = "completed";
      await currentJob.save();
      return estimatedTime;
    }

    // Check daily limit live
    const smtpDoc = await SmtpSchema.findById(currentJob.smtpId);
    const subscription = await SubscriptionSchema.findOne({ userId: currentJob.userId });

    if (!smtpDoc.isSubscribed && smtpDoc.sentToday >= smtpDoc.dailyLimit) {
      currentJob.status = "error";
      currentJob.errorMessage = "Daily sending limit reached.";
      await currentJob.save();
      return;
    }

    // Send next email
    const email = currentJob.pending[0];

    try {
      const mailOptions = {
        from: currentJob.from,
        to: email,
        subject: currentJob.subject,
        attachments:  Array.isArray(currentJob.attachments)
  ? currentJob.attachments.map((a) => ({
      filename: a.filename,
      path: a.path,        // make sure path is correct relative to server
      contentType: a.mimetype || undefined
    }))
  : currentJob.attachments
    ? [{
        filename: currentJob.attachments.filename,
        path: currentJob.attachments.path,
        contentType: currentJob.attachments.mimetype || undefined
      }]
    : [],
        ...(currentJob.messageType === "html"
          ? { html: currentJob.messageContent }
          : { text: currentJob.messageContent })
      };

      await transporter.sendMail(mailOptions);

      currentJob.sent.push(email);

      // increment counters
      await SmtpSchema.findByIdAndUpdate(currentJob.smtpId, {
        $inc: { sentToday: 1, Totalsent: 1 }
      });

      // ❗❗ THIS WAS MISSING — remove email from pending
      currentJob.pending.shift();
      await currentJob.save();

    } catch (err) {

      if (err?.responseCode === 553) {
        currentJob.failed.push({
          email,
          reason: "SMTP rejected the FROM email"
        });

        currentJob.status = "error";
        currentJob.errorMessage = "SMTP rejected the FROM email";
        await currentJob.save();
        return;
      }

      // Normal failure
      const reason = err?.message || "Unknown SMTP error";

      currentJob.failed.push({ email, reason });

      await SmtpSchema.findByIdAndUpdate(currentJob.smtpId, {
        $inc: { failedToday: 1, Totalfailed: 1 }
      });

      currentJob.status = "error";
      currentJob.errorMessage = reason;
      await currentJob.save();
      return;
    }

    // Wait interval
    await new Promise(r => setTimeout(r, currentJob.interval * 1000));
  }
}






module.exports = {cleanEmailList,startSending};
