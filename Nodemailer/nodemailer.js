// transporter.js
const nodemailer = require('nodemailer');
const hbs = require('nodemailer-express-handlebars');
const path = require('path');

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_HOST,
  port: process.env.BREVO_PORT,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS
  }
});

const viewsPath = path.join(__dirname, '..', 'Views');

transporter.use(
  'compile',
  hbs({
    viewEngine: { partialsDir: viewsPath, defaultLayout: false },
    viewPath: viewsPath,
    extName: '.hbs'
  })
);

module.exports = transporter;
