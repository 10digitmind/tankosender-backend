const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  username: { type: String, trim: true },
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  createdAt: { type: Date, default: Date.now },
  // models/User.js
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  // other fields...
});
const SmtpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // A label so the user knows which SMTP this is
  label: {
    type: String,
    required: true,
  },

  host: {
    type: String,
    required: true,
  },

  port: {
    type: Number,
    required: true,
  },

  secure: {
    type: Boolean,
    default: false,
  },

  username: {
    type: String,
    required: true,
  },

  password: {
    type: String,
    required: true,
  },

  // Tracks how many emails have been sent with this SMTP today
  sentToday: {
    type: Number,
    default: 0,
  },

   failedToday: {
    type: Number,
    default: 0,
  },

   Totalsent: {
    type: Number,
    default: 0,
  },
    Totalfailed: {
    type: Number,
    default: 0,
  },

  // Reset daily at midnight or when sending starts
  lastReset: {
    type: Date,
    default: Date.now,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  dailyLimit: { type: Number, default: 200 } ,
  isSubscribed:{
     type: Boolean,
    default: false,
  },
  connected: { type: Boolean, default: false },
});

const EmailJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  smtpId: { type: mongoose.Schema.Types.ObjectId, ref: "SMTP" },

  recipients: [String],             // original list added
  pending: [String],            // unsent
  sent: [String], 
  qrLink:String,           // successful
 failed: [
    {
      email: { type: String },
      reason: { type: String }
    }
  ],            // failed
qrAttachment: {
  filename: String, // the file name, e.g., "qr-1764627771813.png"
  path: String,     // server path to the file, e.g., "/uploads/qr/qr-1764627771813.png"
  cid: String       // the Content-ID used in the email HTML, e.g., "qrCode-1764627771813"
},
  from: String,
    fromName: String,
  subject: String,
   role: String,

  messageType: {
    type: String,
    enum: ["html", "text"],
    required: true
  },

  messageContent: String,

  attachments: [
    {
      filename: String,
      path: String,
        mimetype: String,
    size: Number,
    }
  ],
  
   messageBody: String,       // **new field for the email body**
  htmlAttachment: String,    // **new field if user pastes HTML to send as file**
  sendAs: {                  // how the HTML attachment should be sent
    type: String,
    enum: ["inline", "pdf", "eml", "htmlFile"],
    default: "inline"
  },

  batchSize: { type: Number, default: 100 },
  interval: { type: Number, default: 2 }, // seconds

  status: {
    type: String,
    enum: ["idle", "running", "paused", "completed", "error"],
    default: "idle"
  },

  createdAt: { type: Date, default: Date.now }
});

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
plan: { type: String, enum: ["free", "Premium"], required: true },
amountUSD: { type: Number, required: true }, // amount you want to receive net
status: { type: String, enum: ["pending", "active", "expired", "failed"], default: "pending" },
startDate: { type: Date },
endDate: { type: Date },
isActive: { type: Boolean, default:false },
subRequested: { type: Boolean, default:false },
invoiceId: { type: String }, // NOWPayments invoice ID
txId: { type: String }, // blockchain transaction ID
 referenceId: { type: String, required: true, unique: true }, 
});

module.exports = {
  User: mongoose.model("User", UserSchema),
  SmtpSchema: mongoose.model("SMTP", SmtpSchema),
  EmailJobSchema:mongoose.model("Emailjob", EmailJobSchema),
  SubscriptionSchema:mongoose.model("Subscription", SubscriptionSchema)

};