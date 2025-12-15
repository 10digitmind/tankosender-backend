const crypto = require("crypto");
const fs = require("fs");
const  { PDFDocument, rgb } =  require ("pdf-lib");
const pdfjsLib = require ("pdfjs-dist/legacy/build/pdf.js");
const path = require('path')
const puppeteer = require("puppeteer-core");
const MailComposer = require("nodemailer/lib/mail-composer");
const sharp = require("sharp");
const chromium = require("@sparticuz/chromium");

function generateReferenceId(userId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(3).toString("hex"); // 6 hex chars
    return `SUB-${userId.toString().slice(-6)}-${timestamp}-${random}`;
}
const axios = require("axios");
const QRCode = require("qrcode");
const  htmlPdf = require("html-pdf-node") ;
const { firefox } = require("playwright");
// -------------------------
// Find position of "qrcodeUrl"
// -------------------------
async function findQrPlaceholder(pdfPath) {
  const loadingTask = pdfjsLib.getDocument(pdfPath);
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (item.str.trim() === "qrcodeUrl") {
        return {
          page: i,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height
        };
      }
    }
  }

  return null;
}

// -------------------------
// Inject QR at detected position
// -------------------------
 async function injectQrAtPlaceholder(inputPdf, qrImagePath) {
  const placeholder = await findQrPlaceholder(inputPdf);
  if (!placeholder) return null;

  const outputPdf = inputPdf.replace(".pdf", "_qr.pdf");

  const pdfBytes = fs.readFileSync(inputPdf);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const qrBytes = fs.readFileSync(qrImagePath);
  const qrImage = await pdfDoc.embedPng(qrBytes);

  const page = pdfDoc.getPage(placeholder.page - 1);

  // White out the text area
  page.drawRectangle({
    x: placeholder.x - 2,
    y: placeholder.y - 2,
    width: placeholder.width + 4,
    height: placeholder.height + 6,
    color: rgb(1, 1, 1)
  });

  // Make QR nice and proportional
  const size = placeholder.height * 4;
const offsetX = 0;   // + moves right, - moves left
const offsetY = -9; // + moves up, - moves down

  page.drawImage(qrImage, {
  x: placeholder.x - (size / 4) + offsetX,
  y: placeholder.y - (size / 4) + offsetY,
    width: size,
    height: size
  });

  const final = await pdfDoc.save();
  fs.writeFileSync(outputPdf, final);

  return outputPdf;
}

const QR_UPLOAD_DIR = path.join(__dirname, '..', "uploads", "qr");
const generateQrImage = async (link) => {
  const timestamp = Date.now();
  const filename = `qr-${timestamp}.png`;
  const filepath = path.join(QR_UPLOAD_DIR, filename);



  await QRCode.toFile(filepath, link, { width: 350, margin: 2 });

  return {
    filename,
    path: filepath,
    cid: `qrCode-${timestamp}`,
  };
};





const isProd = process.env.NODE_ENV === "production";

async function htmlToPdf(htmlContent, pdfPath) {
  // Launch browser
  const browser = await puppeteer.launch(
    isProd
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        }
      : {
          channel: "chrome",
          headless: "new",
        }
  );

  const page = await browser.newPage();

  // Set viewport for high-quality PDF
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });

  // Inject CSS to scale inline SVGs correctly
  await page.setContent(
    `<style>
      svg { width: 100% !important; height: 100% !important; display: block; }
    </style>${htmlContent}`,
    { waitUntil: "networkidle0" }
  );

  // Remove broken images (if any)
  await page.evaluate(() => {
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) img.remove();
    });
  });

  // Generate PDF
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();
  return pdfPath;
}




function removeExternalImages(html) {
  return html.replace(
    /<img[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/gi,
    ""
  );
}




async function htmlToEml(emlcontent, subject, qrString , currentJob) {
cleanHtml = removeExternalImages(emlcontent);


  let svgString =qrString.svgString
  let cid = qrString.cid
  // Convert SVG → PNG

 const pngBuffer = await sharp(Buffer.from(svgString), { density: 300 })
  .resize(150, 150) // match your <img> tag
  .png()
  .toBuffer();


  // Replace placeholder with CID reference
const htmlWithCid = cleanHtml.replace(
   /(?:<img[^>]*>\s*|<div[^>]*>)?qrcodeUrl(?:<\/div>)?/g,
  `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
  <tr>
    <td align="center" style="padding: 0; margin: 0;">
      <!-- The 'best style' ensures width/height attributes match the style max-width and include alt text. -->
      <img 
        src="cid:${cid}" 
        width="150" 
        height="150" 
        alt="QR Code" 
        border="0"
        background="black"
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

  


  const mail = new MailComposer({
    subject,
    html: htmlWithCid,
    attachments: [
      {
        filename: "qr.png",
        content: pngBuffer,
        cid: cid, // 👈 embedded INSIDE the EML
        contentType: "image/png"
      }
    ]
  });

  const emlBuffer = await mail.compile().build();

  const emlPath = path.join(process.cwd(), "uploads", `mail-${Date.now()}.eml`);
  fs.writeFileSync(emlPath, emlBuffer);

  return emlPath;
}





async function embedRemoteImages(html) {
  const matches = [...html.matchAll(/<img\s+[^>]*src="([^"]+)"/g)];

  for (let match of matches) {
    let url = match[1];
    if (!url.startsWith("data:")) {
      try {
        const safeUrl = encodeURI(url);
        const res = await axios.get(safeUrl, {
          responseType: "arraybuffer",
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        const ext = safeUrl.split(".").pop().split("?")[0];
        const base64 = Buffer.from(res.data, "binary").toString("base64");
        const dataUrl = `data:image/${ext};base64,${base64}`;
        html = html.replace(match[1], dataUrl);
      } catch (err) {
        console.warn("Failed to embed image:", url, err.message);
      }
    }
  }
  return html;
}


function clearUploadsFolder() {
  const ROOT = path.resolve(process.cwd());
  const qrFolder = path.join(ROOT, "uploads", "qr");

  if (!fs.existsSync(qrFolder)) {
    console.log("QR folder does not exist.");
    return;
  }

  const items = fs.readdirSync(qrFolder);

  items.forEach((item) => {
    const itemPath = path.join(qrFolder, item);
    try {
      const stat = fs.statSync(itemPath);
      if (stat.isFile()) {
        fs.unlinkSync(itemPath); // delete file
        console.log(`Deleted file: ${item}`);
      } else if (stat.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true }); // delete folder inside qr if any
      
      }
    } catch (err) {
      console.error(`Error deleting ${item}:`, err.message);
    }
  });

  console.log("QR folder cleared, folder itself intact!");
}


module.exports = {generateReferenceId,injectQrAtPlaceholder,htmlToPdf,htmlToEml,embedRemoteImages,clearUploadsFolder};








