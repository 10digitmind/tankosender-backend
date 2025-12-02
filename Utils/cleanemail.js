const nodemailer = require("nodemailer");
const {EmailJobSchema, SmtpSchema,SubscriptionSchema} = require("../Controller/Model/model");
const { decrypt } = require("./Encryption");
const   Handlebars = require("handlebars")  


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
  const decryptedPassword = decrypt(smtp.password);

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: decryptedPassword },
    tls: { rejectUnauthorized: false },
  });

  while (true) {
    const currentJob = await EmailJobSchema.findById(jobId).populate("smtpId");
    if (!currentJob || currentJob.status !== "running") return;
    if (currentJob.pending.length === 0) {
      currentJob.status = "completed";
      await currentJob.save();
      return;
    }

    const email = currentJob.pending[0];

    // Combine attachments + QR code
    const attachments = [
      ...(Array.isArray(currentJob.attachments)
        ? currentJob.attachments.map(a => ({
            filename: a.filename,
            path: a.path,
            contentType: a.mimetype || undefined
          }))
        : currentJob.attachments
        ? [{ filename: currentJob.attachments.filename, path: currentJob.attachments.path, contentType: currentJob.attachments.mimetype || undefined }]
        : []),
      ...(currentJob.qrAttachment
        ? [currentJob.qrAttachment]
        : []),
    ];

    // Compile Handlebars template in memory
    let htmlContent = currentJob.messageContent;
    if (currentJob.messageType === "html") {
      const template = Handlebars.compile(htmlContent);
      htmlContent = template({
        qrCode: currentJob.qrAttachment ? `cid:${currentJob.qrAttachment.cid}` : ""
      });
    }

    const mailOptions = {
      from: currentJob.from,
      to: email,
      subject: currentJob.subject,
      attachments,
      ...(currentJob.messageType === "html" ? { html: htmlContent } : { text: currentJob.messageContent })
    };

    try {
      await transporter.sendMail(mailOptions);

      currentJob.sent.push(email);
      currentJob.pending.shift();
      await currentJob.save();

      await SmtpSchema.findByIdAndUpdate(currentJob.smtpId, {
        $inc: { sentToday: 1, Totalsent: 1 }
      });

    } catch (err) {
      console.error("Send email error:", err);
      currentJob.failed.push({ email, reason: err.message });
      await currentJob.save();
      return;
    }

    await new Promise(r => setTimeout(r, currentJob.interval * 1000));
  }
}









module.exports = {cleanEmailList,startSending};
