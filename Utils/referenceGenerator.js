const crypto = require("crypto");
const fs = require("fs");
const  { PDFDocument, rgb } =  require ("pdf-lib");
const pdfjsLib = require ("pdfjs-dist/legacy/build/pdf.js");
const path = require('path')
const puppeteer = require("puppeteer-core");
const MailComposer = require("nodemailer/lib/mail-composer");

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


const browser = await puppeteer.launch(
  isProd
    ? {
        // ✅ Production (Linux / serverless)
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
      }
    : {
        // ✅ Local macOS / Windows
        channel: "chrome",
        headless: "new"
      }
);

  const page = await browser.newPage();

  // Set viewport for high-quality PDF
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });

  // Load HTML
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  // Remove broken images
  await page.evaluate(() => {
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) img.remove();
    });
  });

  // Wait for images to load (best effort)
  try {
    await page.waitForFunction(
      () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      { timeout: 5000 }
    );
  } catch (e) {
    console.warn("Some images did not load fully, PDF may miss them.");
  }

  // Generate PDF
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  return pdfPath;
};








async function htmlToEml(htmlContent, subject) {
  // Remove broken images (external http/https images)
  htmlContent = htmlContent.replace(/<img[^>]+src="https?:\/\/[^"]+"[^>]*>/gi, "");

  const mail = new MailComposer({
    subject,
    html: htmlContent,
    attachments: [],
  });

  const emlPath = path.join(process.cwd(), "uploads", `eml-${Date.now()}.eml`);
  const message = await mail.compile().build();
  fs.writeFileSync(emlPath, message);

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


function clearQrFolder() {
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
        console.log(`Deleted folder inside qr: ${item}`);
      }
    } catch (err) {
      console.error(`Error deleting ${item}:`, err.message);
    }
  });

  console.log("QR folder cleared, folder itself intact!");
}


module.exports = {generateReferenceId,injectQrAtPlaceholder,htmlToPdf,htmlToEml,embedRemoteImages,clearUploadsFolder};




function clearUploadsFolder() {
  const ROOT = path.resolve(process.cwd());
  const uploadsFolder = path.join(ROOT, "uploads");

  if (!fs.existsSync(uploadsFolder)) {
    console.log("Uploads folder does not exist.");
    return;
  }

  const items = fs.readdirSync(uploadsFolder);

  items.forEach((item) => {
    const itemPath = path.join(uploadsFolder, item);

    // Skip 'qr' folder
    if (item === "qr") return;

    try {
      const stat = fs.statSync(itemPath);
      if (stat.isFile()) {
        fs.unlinkSync(itemPath);
        console.log(`Deleted file: ${item}`);
      } else if (stat.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`Deleted folder: ${item}`);
      }
    } catch (err) {
      console.error(`Error deleting ${item}:`, err.message);
    }
  });

  console.log("Uploads folder cleared (except qr)!");
}




