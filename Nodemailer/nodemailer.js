const nodemailer = require('nodemailer');
const path = require('path');

async function createTransporter() {
  const hbs = await import('nodemailer-express-handlebars'); // dynamic import

  const transporter = nodemailer.createTransport({
    host:  process.env.BREVO_HOST,
    port: process.env.BREVO_PORT,
    secure: false,
      requireTLS: true, 
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_PASS
    }
  });


  transporter.use(
    'compile',
    hbs.default({ // note the `.default` when importing ESM
      viewEngine: {
        partialsDir: path.resolve('./views'),
        defaultLayout: false
      },
      viewPath: path.resolve('./views'),
      extName: '.hbs'
    })
  );

  return transporter;
}

module.exports = createTransporter;
