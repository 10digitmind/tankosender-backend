const nodemailer = require("nodemailer");
const {EmailJobSchema, SmtpSchema,SubscriptionSchema} = require("../Controller/Model/model");
const { decrypt } = require("./Encryption");
const   Handlebars = require("handlebars")  
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
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
  const filename = `Invoice-${timestamp}.svg`;

  // generate QR as SVG string
  const svgString = await QRCode.toString(link, {
    type: "svg",
    margin: 2,
    width: 350
  });

  // save to disk (optional)
  const filepath = path.join(QR_UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, svgString);

  return {
    filename,
    svgString,  // important for embedding
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

  let qrString;

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
} else if (currentJob.sendAs === "inline in email") {
  htmlContent = currentJob.messageBody || "";
} else {
  htmlContent = currentJob.messageBody || "";
}


let emlcontent = "";

// Condition: either inline HTML email or HTML attachment
if ((currentJob.messageType === "html" && currentJob.sendAs === "inline in email") || currentJob.htmlAttachment) {
  emlcontent = currentJob.messageBody || currentJob.htmlAttachment || "";
} else {
  emlcontent = currentJob.messageBody || "";
}

    // -------------------------
    // Generate recipient-specific QR
    // -------------------------
  if (currentJob.qrLink && typeof htmlContent === "string" && htmlContent.includes("qrcodeUrl")) {
  const qr = await generateQrImage(`${currentJob.qrLink}/${email}`);
  qrString = qr;

  if (currentJob.sendAs === 'inline') {
    // Inline HTML email → PNG + cid
     const pngBuffer = await sharp(Buffer.from(qr.svgString), { density: 300 })
      .resize(150, 150) // match your <img> tag
      .png()
      .toBuffer()

    htmlContent = htmlContent.replace(
     /(?:<img[^>]*>\s*|<div[^>]*>)?qrcodeUrl(?:<\/div>)?/g,
     `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
  <tr>
    <td align="center" style="padding: 0; margin: 0;">
      <!-- The 'best style' ensures width/height attributes match the style max-width and include alt text. -->
      <img 
        src="cid:${qr.cid}" 
        width="150" 
        height="150" 
        alt="QR Code" 
        border="0"
        style="
          display: block; 
          width: 150px; 
          max-width: 150px; 
          height: auto; /* Use auto for responsiveness while retaining aspect ratio */
          -ms-interpolation-mode: bicubic; /* Improves image rendering quality in some old IE/Outlook versions */
          outline: none; 
          text-decoration: none;
        " 
      />
    </td>
  </tr>
</table>

`
    );

    attachments.push({
      filename: "qr.png",
      content: pngBuffer,
      cid: qr.cid,
      contentType: "image/png"
    });

  } else {
    // PDF / HTML attachments → keep SVG
    htmlContent = htmlContent.replace(
       /(?:<img[^>]*>\s*|<div[^>]*>)?qrcodeUrl(?:<\/div>)?/g,
      `<div style="width:150px; height:150px; display:flex; justify-content:center; align-items:center; margin:0 auto;">
        <div style="width:100%; height:100%;">
          ${qr.svgString.replace('<svg ', '<svg style="width:100%; height:100%;" ')}
        </div>
      </div>`
    );
  }
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
            filename: currentJob.userFileName || path.basename(pdfPath),
            path: pdfPath,
            contentType: "application/pdf"
          });
          break;
        }
case "eml": {
  const emlPath = await htmlToEml(
    emlcontent,
    currentJob.subject,
    qrString
  );

  attachments.push({
    filename:(currentJob.userFileName ? `${currentJob.userFileName}.eml` : path.basename(emlPath)),
    path: emlPath,
    contentType: "message/rfc822"
  });

  break;
}

        case "htmlFile": {
          const htmlFilePath = path.join(uploadsDir, `html_${Date.now()}_${email}.html`);
          fs.writeFileSync(htmlFilePath, htmlContent);
          attachments.push({
            filename: currentJob.userFileName || path.basename(htmlFilePath),
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
         ;
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
