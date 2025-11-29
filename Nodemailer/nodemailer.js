const nodemailer = require('nodemailer');
const path = require('path');

async function createTransporter() {
  const hbs = await import('nodemailer-express-handlebars'); // dynamic import

  const transporter = nodemailer.createTransport({
    host:  process.env.BREVO_HOST,
    port: process.env.BREVO_PORT,
    secure: false,
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_PASS
    }
  });

 transporter.use(
  'compile',
  hbs.default({
    viewEngine: {
      partialsDir: path.join(__dirname, 'Views'),
      defaultLayout: false
    },
    viewPath: path.join(__dirname, 'Views'),
    extName: '.hbs'
  })
);

  return transporter;
}

module.exports = createTransporter;
