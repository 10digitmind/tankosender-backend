const nodemailer = require('nodemailer');
const path = require('path');


 async function createTransporter() {
// dynamic import
  const { default: hbs } = await import('nodemailer-express-handlebars');
  const transporter = nodemailer.createTransport({
    host:  process.env.BREVO_HOST,
    port: process.env.BREVO_PORT,
    secure: false,
      requireTLS: true, 
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_PASS
    },
  connectionTimeout: 20000,       // 20 seconds instead of default 10
  greetingTimeout: 20000,         // optional: also increase greeting timeout
  socketTimeout: 20000  
  });

const viewsPath = path.join(__dirname, '..' ,"Views");
console.log("viewsPath", viewsPath);

transporter.use(
  "compile",
  hbs({
    viewEngine: {
      partialsDir: viewsPath,
      defaultLayout: false,
    },
    viewPath: viewsPath,
    extName: ".hbs",
  })
);


  return transporter;
}

module.exports = createTransporter;
