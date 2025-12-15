const {
  SmtpSchema,
  User,
  EmailJobSchema,
  SubscriptionSchema,
} = require("../Controller/Model/model");


const {
  sendVerificationEmail,
  paymentAlert,
  passwordUpdate,
  signupAlert
} = require("../Nodemailer/sender");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { cleanEmailList, startSending ,processPdfFileWithQr,processHtmlFileWithQr,processEmlFileWithQr,processEmailFileWithQr} = require("../Utils/cleanemail");
const { encrypt } = require("../Utils/Encryption");
const {generateReferenceId,injectQrAtPlaceholder,htmlToPdf,htmlToEml,embedRemoteImages} = require("../Utils/referenceGenerator");
const axios = require("axios");
const { decrypt } = require("../Utils/Encryption");
// Create SMTP
const QRCode = require("qrcode");
const  fs= require  ("fs");
const  path =require ("path");






const registerUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Create username from first 4 chars of email
    const username = email.slice(0, 4);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // Create user
    const user = await User.create({
      email,
      username,
      passwordHash: hashedPassword,
    });
    if (!user) {
      return res.status(500).json({ message: "Failed to create user" });
    }
    const verificationToken = crypto.randomBytes(32).toString("hex");
    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    user.emailVerificationToken = verificationToken;
    await user.save();

    await sendVerificationEmail(user.email, user.username, verificationToken);

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

const verifyEmail = async (req, res) => {
  const { token } = req.query;

  try {
    // 1️⃣ Find user by verification token
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // 2️⃣ Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // 3️⃣ Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    // 4️⃣ Generate JWT for login
    const authToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    let name = user.username;
    let email = user.email;

    // await signupAlert(name, email);
 await signupAlert(name, email)
    // 5️⃣ Send response with token
    res.status(200).json({
      message: "Email successfully verified!",
      token: authToken,
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });

   
  } catch (error) {
    console.error("Email verification error:", error.message);
    res.status(500).json({ message: "Unable to verify user" });
  }
};

const resendVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.emailVerified)
      return res.status(400).json({ message: "Email is already verified" });

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = verificationToken;
    await user.save();

    // Send verification email
    await sendVerificationEmail(
      user.email,
      user.username || user.email.slice(0, 4),
      verificationToken
    );

    res.status(200).json({ message: "Verification email resent successfully" });
  } catch (error) {
    console.error("Resend verification error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Invalid email or  password" });
    }
    if (!user.emailVerified) {
      return res.status(400).json({ message: "Email not verified" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or  password" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token,
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Server error during login" });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  // Find the user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: "No account found with this email." });
  }

  // Generate a reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = Date.now() + 3600000; // 1 hour

  // Save token and expiry in user document
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = resetTokenExpiry;
  await user.save();

  // Create reset URL
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;

  const userEmail = user.email;

  await sendPasswordResetEmail(userEmail, user.username, resetUrl);
  res.json({ success: true, message: "Password reset email sent." });
};

const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password)
    return res
      .status(400)
      .json({ error: "Token and new password are required." });

  // Hash the token received from frontend

  // Find user by hashed token and check expiry
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user)
    return res.status(400).json({ error: "Invalid or expired token." });

  // Update password
  user.password = password; // make sure User model has pre-save hook for hashing
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({ success: true, message: "Password reset successful!" });
};

const createSMTP = async (req, res) => {
  try {
    const { label, host, port, username, password } = req.body;

    // Basic validation
    if (!label || !host || !port || !username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const salt = await bcrypt.genSalt(10);

    const encryptedPassword = encrypt(password);

    const smtp = new SmtpSchema({
      label,
      host,
      port,
      username,
      password: encryptedPassword,
      secure: req.body.secure || false,
      userId: req.user.id,
    });

    await smtp.save();
    res.json({ message: "SMTP created", smtp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

  // List SMTPs for user
  const listSMTP = async (req, res) => {
    try {
      const smtpList = await SMTP.find({ userId: req.user.id });
      res.json(smtpList);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
};

// Delete SMTP
const deleteSMTP = async (req, res) => {
  try {
    const smtp = await SmtpSchema.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!smtp) return res.status(404).json({ error: "SMTP not found" });
    res.json({ message: "SMTP deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const smtpConnection = async (req, res) => {
  try {
    const smtp = await SmtpSchema.findOne({ userId: req.user.id });

    if (!smtp) {
      return res.status(404).json({ message: "SMTP account not found" });
    }

    const { host, port, username, password, secure } = smtp;
    if (!host || !port || !username || !password) {
      return res.status(400).json({ message: "Missing SMTP credentials" });
    }

    const decryptedPassword = decrypt(password);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: secure ?? false,
      auth: { user: username, pass: decryptedPassword },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();

    // Mark as connected
    smtp.connected = true;
    await smtp.save();

    return res.status(200).json({
      status: "connected",
      message: "SMTP connection successful",
      smtp,
    });
  } catch (error) {
    console.error(error);
    console.log(error);

    const reason = error?.reason || error?.message || "Unknown server error";
    if (["ETIMEDOUT", "ECONNECTION", "EHOSTUNREACH"].includes(error.code)) {
      return res.status(502).json({
        status: "failed",
        message: "SMTP server unreachable",
        error: ereason,
      });
    } else if (error.code === "EAUTH") {
      return res.status(401).json({
        status: "failed",
        message: "SMTP authentication failed",
        error: reason,
      });
    } else {
      return res.status(500).json({
        status: "failed",
        message: "SMTP connection failed due to server error",
        error: reason,
      });
    }
  }
};

const testSMTP = async (req, res) => {
  const { to } = req.body;

  if (!to) return res.status(400).json({ message: "Recipient email required" });

  const smtp = await SmtpSchema.findOne({ userId: req.user.id });
  if (!smtp) return res.status(404).json({ message: "SMTP account not found" });

  const { host, port, username, password, secure } = smtp;
  if (!host || !port || !username || !password) {
    return res.status(400).json({ message: "Missing SMTP credentials" });
  }

  const decryptedPassword = decrypt(password);
  const isSecure = secure ?? port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: { user: username, pass: decryptedPassword },
      tls: { rejectUnauthorized: false },
    });

    // Verify connection
    await transporter.verify();

    // Send test email
    await transporter.sendMail({
      from: username,
      to,
      subject: " SMTP Test Email",
      text: "Your SMTP settings are working correctly! 🎉",
      html: `<p>Hello,</p>
             <p>This is a <strong>test email</strong> sent using your SMTP settings.</p>
             <p>If you received this, your SMTP is working perfectly. 🚀</p>
             <br/><p>— Thank you</p>`,
    });

    res.json({
      status: "sent",
      message: `Test email sent to ${to}`,
      connected: true,
    });
  } catch (error) {
    console.error("Test email failed:", error.message);

    res.status(500).json({
      status: "failed",
      message: "Could not send test email",
      connected: false,
      error: error.message,
    });
  }
};

const QR_UPLOAD_DIR = path.join(__dirname, '..', "uploads", "qr");

if (!fs.existsSync(QR_UPLOAD_DIR)) {
  fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
  console.log("Created QR_UPLOAD_DIR:", QR_UPLOAD_DIR);
}

const generateQrImage = async (link) => {
  const timestamp = Date.now();
  const filename = `qr-${timestamp}.png`;
  const filepath = path.join(QR_UPLOAD_DIR, filename);
  await QRCode.toFile(filepath, link, { width: 350, margin: 2 });
const dataUrl = await QRCode.toDataURL(link, { width: 350, margin: 2 });
  return {
    filename,
    path: filepath,
    dataUrl,
    cid: `qrCode-${timestamp}`,
  };
};

const createJob = async (req, res) => {
  try {
    const { recipients, from, fromName, subject, messageType, messageBody, htmlAttachment, sendAs, userFileName,interval, qrLink } = req.body;

    console.log('userfile',userFileName)
    // Clean and validate emails
    const emails = Array.isArray(cleanEmailList(recipients)) ? cleanEmailList(recipients) : [];
    if (!emails.length) return res.status(400).json({ error: "No valid emails found" });

    // Get SMTP
    const currentSmtp = await SmtpSchema.findOne({ userId: req.user.id });
    if (!currentSmtp) return res.status(400).json({ error: "SMTP not found" });

    // Prepare job
    const job = await EmailJobSchema.create({
      userId: req.user.id,
      smtpId: currentSmtp._id,
      recipients: emails,
      pending: emails,
      sent: [],
      failed: [],
      from,
      fromName,
      userFileName:userFileName || "",
      subject,
      messageType,
      messageBody,
      htmlAttachment: htmlAttachment || null,
      sendAs: sendAs || "inline",
      attachments: [],       // leave empty for now, PDFs/EMLs generated during sending
      qrLink: qrLink || null,
      qrAttachment: null,    // generated during sending
      batchSize: emails.length,
      interval: interval || 2,
      status: "idle",
    });

    res.json({
      message: "Email job created successfully",
      jobId: job._id,
      totalEmails: emails.length,
    });

  } catch (err) {
    console.error("Create job error:", err);
    res.status(500).json({ error: err.message });
  }
};



const editJob = async (req, res) => {
  try {
    const job = await EmailJobSchema.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // -------------------------
    // Update recipients
    // -------------------------
    const newEmails = cleanEmailList(req.body.recipients || "");
    if (!newEmails.length) return res.status(400).json({ error: "No valid emails" });

    job.recipients = [...newEmails];
    job.pending = [...newEmails];
    job.sent = [];
    job.failed = [];

    // -------------------------
    // Update basic fields
    // -------------------------
    job.subject = req.body.subject || job.subject;
    job.from = req.body.from || job.from;
    job.fromName = req.body.fromName || job.fromName;
    job.messageType = req.body.messageType || job.messageType;
    job.messageBody = req.body.messageBody ;
    job.htmlAttachment = req.body.htmlAttachment 
    job.sendAs = req.body.sendAs || job.sendAs;
    job.qrLink = req.body.qrLink 
    job.interval = req.body.interval || job.interval;
    job.userFileName= req.body.userFileName;
    job.status = "idle";

    // -------------------------
    // Update attachments
    // -------------------------
    let attachments = job.attachments || [];

    // Delete attachments if requested
    if (req.body.deleteAttachments) {
      const toDelete = Array.isArray(req.body.deleteAttachments)
        ? req.body.deleteAttachments
        : [req.body.deleteAttachments];

      attachments = attachments.filter((a) => !toDelete.includes(a.filename));
      toDelete.forEach((filename) => {
        const filePath = path.join("uploads", filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    // Add newly uploaded files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        attachments.push({
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
          size: file.size,
        });
      }
    }

    job.attachments = attachments;

    await job.save();
    res.json({ message: "Job updated successfully", job });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};







const deleteJob = async (req, res) => {
  try {
    const job = await EmailJobSchema.findOneAndDelete({
      userId: req.user.id,
      _id: req.params.id,
    });
    if (!job) return res.status(404).json({ error: "SMTP not found" });
    res.json({ message: "SMTP deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const startJob = async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = await EmailJobSchema.findById(jobId).populate("smtpId");

 
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status === "running")
      return res.status(400).json({ error: "Job is already running" });

 const smtpDoc = await SmtpSchema.findById(job.smtpId);


if (!smtpDoc) {
  return  res.status(400).json({ error: "Please add/connect SMTP first" });

}

    // Check daily limit for non-subscribed users
    if (!smtpDoc.isSubscribed && smtpDoc.sentToday >= smtpDoc.dailyLimit) {
      job.status = "error";
      await job.save();
      console.log("Stopped: Daily limit reached");
      return res
        .status(400)
        .json({ error: "Daily limit reached subscribe for unlimted" });
    }
    // Mark job as running
    job.status = "running";
    await job.save();
    // Start sending asynchronously (does NOT block)
    const estimatedTime = await startSending(job._id);
    // Return response immediately
    res.json({
      message: "Sending started",
      jobId: job._id,
      estimatedTime,
      status: job.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start sending" });
  }
};
const getStatus = async (req, res) => {
  try {
    const job = await EmailJobSchema.findById(req.params.jobId);

    if (!job) return res.status(404).json({ error: "Job not found" });

    // Get one reason from failed emails (first one)
    const firstFailReason = job.failed.length > 0 ? job.failed[0].reason : null;

    res.json({
      sent: job.sent.length,
      sentEmails: job.sent,
      failedEmails: job.failed.map((f) => f.email),
      failed: job.failed.length,
      pending: job.pending.length,
      status: job.status,
      totalsent: job.failed.length + job.sent.length,
      firstFailReason,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job status" });
  }
};

const createSub = async (req, res) => {
  try {
    const { amount, userWallet, yourWallet } = req.body;

    if (!amount || !userWallet || !yourWallet) {
      return res.status(400).json({ message: "amount, userWallet, and yourWallet are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const plan = "Premium";
const userEmail=user.email
    // Generate reference ID
    const referenceId = generateReferenceId(req.user.id);
const reference = referenceId
    // Save subscription
    const subscription = new SubscriptionSchema({
      userId: req.user.id,
      plan,
      referenceId,
      amountUSD: amount,
      isActive: false,
      subRequested:true,
      startDate:new Date()
    });

    await subscription.save();

    // Send email BEFORE sending response
    await paymentAlert(
      userEmail,
  userWallet,
  amount,
  yourWallet,
  reference
    );

    // Respond to frontend
    return res.status(201).json({
      message: "Subscription created successfully",
      subscription: {
        id: subscription._id,
        plan,
        referenceId,
        isActive: subscription.isActive,
        amountUSD: amount,
      },
    });

  } catch (error) {
    console.error("Error creating subscription:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


const manualConfirmSubscription = async (req, res) => {
  try {
    const { referenceId } = req.params;

    // Find subscription
    const subscription = await SubscriptionSchema.findOne({ referenceId });
    if (!subscription) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    if (subscription.isSubscribed) {
      return res.json({
        success: true,
        message: "Subscription already active",
      });
    }

    // Activate subscription
    subscription.isActive = true;
    subscription.startDate = new Date();
    subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days
    subscription.txId = req.body.txId || "MANUAL_CONFIRMATION";

    await subscription.save();

    return res.json({
      success: true,
      message: "Subscription manually activated",
      subscription,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};


const getUserProfile = async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "user id requred " });
    }
    const user = await User.findById(req.user._id).select("-passwordHash");
    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error fetching user" });
  }
};

const getSmtp = async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "user id requred " });
    }
    const smtp = await SmtpSchema.find({ userId: req.user._id }).select(
      "-password"
    );
    res.json(smtp);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error fetching smtp" });
  }
};

const getEmailJob = async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "user id requred " });
    }
    const emailJob = await EmailJobSchema.find({ userId: req.user._id });
    res.json(emailJob);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error fetching email job" });
  }
};


const getSub = async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "user id required" });
    }

    const latestSub = await SubscriptionSchema.findOne({ userId: req.user._id })
      .sort({ statDate: -1 }); // newest first

    res.json(latestSub);
  } catch (error) {
    console.error("Get sub error:", error);
    res.status(500).json({ message: "Server error fetching sub" });
  }
};



const changePassword = async (req, res) => {
  try {
    const userId = req.user.id; 
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Fetch user with password
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect." });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Save new password
    user.passwordHash = hashedPassword;
    await user.save();

    const name = user.username
    const email = user.email
   const date = new Date().toLocaleString();

    await passwordUpdate( name,email, date )
    res.json({ message: "Password updated successfully!" });

  } catch (error) {
    console.log("Change password error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

module.exports = {
  createSMTP,
  registerUser,

  deleteSMTP,
  verifyEmail,
  resendVerification,
  loginUser,
  forgotPassword,
  resetPassword,
  smtpConnection,
  testSMTP,
  createJob,
  editJob,
  startJob,
  getStatus,
  deleteJob,
  createSub,
  manualConfirmSubscription,
  getUserProfile,
  getSmtp,
  getEmailJob,
  getSub,
  changePassword
};
