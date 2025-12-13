const nodemailer = require("nodemailer");
const {EmailJobSchema, SmtpSchema,SubscriptionSchema} = require("../Controller/Model/model");
const { decrypt } = require("./Encryption");
const   Handlebars = require("handlebars")  
const fs = require("fs");
const path = require("path");

const QRCode = require("qrcode");
const os = require("os")
const { PDFDocument } = require("pdf-lib");
const MailComposer = require("nodemailer/lib/mail-composer");
const { simpleParser } = require("mailparser");

const emlFormat = require("eml-format");
const { htmlToPdf, htmlToEml, clearUploadsFolder } = require("./referenceGenerator");

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


async function generateQrImageToFile(qrLink) {
  if (!qrLink) throw new Error("QR link is required");

  const outputDir = path.join(__dirname, "..", "uploads", "qr");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const filename = `qr_${Date.now()}.png`;
  const outputPath = path.join(outputDir, filename);

  await QRCode.toFile(outputPath, qrLink, {
    color: {
      dark: "#000000",  // QR code color
      light: "#FFFFFF", // background
    },
    width: 250,
  });

  return outputPath;
}


const QR_UPLOAD_DIR = path.join(__dirname, '..', "uploads", "qr");

if (!fs.existsSync(QR_UPLOAD_DIR)) {
  fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
  console.log("Created QR_UPLOAD_DIR:", QR_UPLOAD_DIR);
}

const generateQrImage = async (link) => {
  const timestamp = Date.now();
  const filename = `Invoice-${timestamp}.png`;

  // generate QR as buffer
  const buffer = await QRCode.toBuffer(link, { width: 350, margin: 2 });

  // save to disk if you want
  const filepath = path.join(QR_UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  return {
    filename,
    buffer,      // this is important for Nodemailer attachment
    path: filepath,
    cid: `qrCode-${timestamp}`
  };
};


async function startSending(jobId) {
  const ROOT = path.resolve(process.cwd());

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
    if (!currentJob.pending.length) {
      currentJob.status = "completed";
      await currentJob.save();
      return;
    }

    const email = currentJob.pending[0];
    const attachments = [];

    // -------------------------
    // Determine HTML source
    // -------------------------
    let htmlContent = "";
    if (currentJob.messageType === "html") {
      htmlContent = currentJob.messageBody || "";
    } else if (currentJob.htmlAttachment) {
      htmlContent = currentJob.htmlAttachment;
    } else {
      htmlContent = currentJob.messageBody || "";
    }

    // -------------------------
    // Generate recipient-specific QR
    // -------------------------
    if (currentJob.qrLink && typeof htmlContent === "string" && htmlContent.includes("qrcodeUrl")) {
      const qr = await generateQrImage(`${currentJob.qrLink}/${email}`);
      htmlContent = htmlContent.replace(
        /<img>qrcodeUrl/g,
        `<img src="data:image/png;base64,${qr.buffer.toString("base64")}" style="width:150px;height:150px;"/>`
      );

    
    }

    // -------------------------
    // Handle static attachments
    // -------------------------
    if (Array.isArray(currentJob.attachments)) {
      currentJob.attachments.forEach(a => {
        if (!a?.filename || !a?.path) return;
        attachments.push({
          filename: a.filename,
          path: path.isAbsolute(a.path) ? a.path : path.join(ROOT, a.path),
          contentType: a.mimetype
        });
      });
    }

    // -------------------------
    // Handle sendAs options (PDF / EML / HTML file)
    // -------------------------
    if (currentJob.sendAs && currentJob.htmlAttachment) {
      const uploadsDir = path.join(ROOT, "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      switch (currentJob.sendAs) {
        case "pdf": {
          
          const pdfPath = path.join(uploadsDir, `pdf_${Date.now()}_${email}.pdf`);
          await htmlToPdf(htmlContent, pdfPath);
          attachments.push({
            filename: path.basename(pdfPath),
            path: pdfPath,
            contentType: "application/pdf"
          });
          break;
        }
        case "eml": {
          const emlPath = await htmlToEml(htmlContent, currentJob.subject);
          attachments.push({
            filename: path.basename(emlPath),
            path: emlPath,
            contentType: "message/rfc822"
          });
          break;
        }
        case "htmlFile": {
          const htmlFilePath = path.join(uploadsDir, `html_${Date.now()}_${email}.html`);
          fs.writeFileSync(htmlFilePath, htmlContent);
          attachments.push({
            filename: path.basename(htmlFilePath),
            path: htmlFilePath,
            contentType: "text/html"
          });
          break;
        }
      }
    }

    // -------------------------
    // Determine email body
    // -------------------------
    let mailBody = {};
    if (currentJob.messageType === "text") {
      // Text email body, HTML as attachment
      mailBody = { text: currentJob.messageBody || "" };
    } else if (currentJob.messageType === "html" && currentJob.messageBody) {
      // HTML inline body
      mailBody = { html: htmlContent };
    } else {
      mailBody = { text: currentJob.messageBody || "" };
    }

    // -------------------------
    // Send email
    // -------------------------
    const mailOptions = {
      from: `${currentJob.fromName} <${currentJob.from}>`,
      to: email,
      subject: currentJob.subject,
      attachments,
      ...mailBody
    };

    try {
      await transporter.sendMail(mailOptions);

      currentJob.sent.push(email);
      currentJob.pending.shift();
      await currentJob.save();

      await SmtpSchema.findByIdAndUpdate(currentJob.smtpId, {
        $inc: { sentToday: 1, Totalsent: 1 },
      });

      // Cleanup generated files (PDF / HTML / EML)
      attachments.forEach(att => {
        if (att?.path && fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
          console.log(`Deleted attachment: ${att.filename}`);
        }
      });
    
    } catch (err) {
      console.error("Send email error:", err);
      currentJob.failed.push({ email, reason: err.message });
      await currentJob.save();
      return;
    }
setTimeout( () => {
 clearUploadsFolder();
}, 3000);

    await new Promise(r => setTimeout(r, (currentJob.interval || 2) * 1000));
  }
   
}






async function processHtmlFileWithQr(htmlPath, qrLink) {
  if (!qrLink || !htmlPath.endsWith(".html")) return null;

  let html = fs.readFileSync(htmlPath, "utf8");
  if (!html.includes("qrcodeUrl")) return null;

  const qrImagePath = await generateQrImageToFile(qrLink); // generate QR image file

  // Replace all occurrences of qrcodeUrl with the QR code image
  html = html.replace(/qrcodeUrl/g, `<img src="${qrImagePath}" width="200" />`);

  const newPath = htmlPath.replace(/\.html$/, "_qr.html");
  fs.writeFileSync(newPath, html);

  return newPath;
}







// processPdfFileWithQr.js



 // You already have this



async function processEmlFileWithQr(emlPath, qrLink) {
  try {
    const ROOT = path.resolve(process.cwd());
    const emlRaw = fs.readFileSync(emlPath, "utf8");

    // 1️⃣ Parse existing EML
    const parsed = await simpleParser(emlRaw);
    let html = parsed.html || parsed.textAsHtml || "";

    if (!html.includes("qrcodeUrl")) {
      console.log("No QR placeholder found → skipping EML:", emlPath);
      return null;
    }

    // 2️⃣ Generate QR
    const qrBuffer = await QRCode.toBuffer(qrLink, {
      width: 350,
      margin: 2,
      type: "png",
    });

    const qrFolder = path.join(ROOT, "uploads", "qr");
    if (!fs.existsSync(qrFolder)) fs.mkdirSync(qrFolder, { recursive: true });

    const qrFileName = `qr_${Date.now()}.png`;
    const qrFilePath = path.join(qrFolder, qrFileName);
    fs.writeFileSync(qrFilePath, qrBuffer);

const qrCid = `qr${Date.now()}@qr.local`;

    // 3️⃣ Replace placeholder in HTML
    html = html.replace(
      /<img[^>]*>?\s*qrcodeUrl\s*<\/img>?|qrcodeUrl/g,
      `<img src="cid:${qrCid}" alt="QR Code" style="display:block; margin:0 auto; width:250px; height:250px;" />`
    );

    // 4️⃣ Compose new EML
    const mail = new MailComposer({
      from: parsed.from?.text || "no-reply@example.com",
      to: parsed.to?.text || "",
      cc: parsed.cc?.text || "",
      bcc: parsed.bcc?.text || "",
      subject: parsed.subject || "",
      text: parsed.text || "",
      html,
      attachments: [
        ...(parsed.attachments || []),
        {
          filename: qrFileName,
          content: qrBuffer,
          contentType: "image/png",
          cid: qrCid,
           contentDisposition: "inline",
            contentLocation: qrCid
        },
      ],
    });

  const newEmlRaw = await new Promise((resolve, reject) => {
      mail.compile().build((err, message) => {
        if (err) return reject(err);
        resolve(message.toString());
      });
    });

    const newEmlPath = emlPath.replace(".eml", `_qr.eml`);
    fs.writeFileSync(newEmlPath, newEmlRaw, "utf8");

    return {
      newPath: newEmlPath,
      qrAttachment: {
        filename: qrFileName,
        path: qrFilePath,
        cid: qrCid,
      },
    };
  } catch (err) {
    console.error("EML QR processing failed:", err);
    return null;
  }
}





async function processEmailFileWithQr(filePath, qrLink) {
  try {
    let content = fs.readFileSync(filePath, "utf8");

    // Check if QR placeholder exists
    if (!content.includes("qrcodeUrl")) {
      return { newPath: filePath, qrAttachment: null };
    }

    // Replace placeholder with Handlebars variable
    content = content.replace(/qrcodeUrl/g, "{{qrCode}}");

    // Save updated file without changing structure
    const newPath = filePath.replace(/(\.eml|\.html)$/, "_qr$1");
    fs.writeFileSync(newPath, content, "utf8");

    // Generate QR PNG
    const qrBuffer = await QRCode.toBuffer(qrLink, { width: 350, margin: 2 });
    const qrFilename = `qr_${Date.now()}.png`;
    const qrFilePath = path.join(os.tmpdir(), qrFilename);
    fs.writeFileSync(qrFilePath, qrBuffer);

    // Create CID
    const qrCid = `qr_${Date.now()}@example.com`;

    // Return attachment info
    const qrAttachment = {
      filename: qrFilename,
      path: qrFilePath,
      cid: qrCid
    };

    return { newPath, qrAttachment };
  } catch (err) {
    console.error("Email file QR processing failed:", err);
    return { newPath: filePath, qrAttachment: null };
  }
}


async function processPdfFileWithQr(pdfPath, qrLink, options = {}) {
  try {
    const {
      pageNumber = 0, // first page = 0
      x = 50,         // left distance
      y = 50,         // bottom distance
      width = 120,    // QR width
      height = 120    // QR height
    } = options;

    // Load PDF
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Generate QR as PNG
    const qrPng = await QRCode.toBuffer(qrLink);

    // Embed QR image
    const qrImage = await pdfDoc.embedPng(qrPng);

    const pages = pdfDoc.getPages();
    const page = pages[pageNumber];

    // Draw image at chosen position
    page.drawImage(qrImage, {
      x,
      y,
      width,
      height
    });

    // Save new PDF
    const newPdfBytes = await pdfDoc.save();
    const newPdfPath = pdfPath.replace(".pdf", "_qr.pdf");

    fs.writeFileSync(newPdfPath, newPdfBytes);

    return newPdfPath;

  } catch (err) {
    console.error("PDF QR Processing failed:", err);
    return null;
  }
}

module.exports = {cleanEmailList,startSending,processHtmlFileWithQr,processEmlFileWithQr,processEmailFileWithQr,generateQrImage,processPdfFileWithQr};
