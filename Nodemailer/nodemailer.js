const nodemailer = require('nodemailer');
const path = require('path');


 async function createTransporter() {
// dynamic import
  const { default: hbs } = await import('nodemailer-express-handlebars');
  const transporter = nodemailer.createTransport({
    host:  process.env.BREVO_HOST,
    port: process.env.BREVO_PORT,
    secure: false,
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_PASS
    }, 
  });

const viewsPath = path.join(__dirname, '..' ,"Views");


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
