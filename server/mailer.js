const nodemailer = require('nodemailer');

// Настройки почты берём из файла .env
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: Number(process.env.MAIL_PORT) === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

// Общая функция: отправляет любое письмо
async function send(to, subject, text) {
  await transporter.sendMail({
    from: `"Корпоративный мессенджер" <${process.env.MAIL_USER}>`,
    to,
    subject,
    text,
  });
}

// Код для подтверждения почты
function sendLoginCode(email, code) {
  return send(
    email,
    'Код подтверждения почты',
    `Ваш код: ${code}\n\nКод действует 10 минут. Если вы не запрашивали код, просто проигнорируйте это письмо.`
  );
}

// Письмо после регистрации. Пароль в письме не указываем
function sendWelcome(email, name) {
  return send(
    email,
    'Регистрация завершена',
    `${name}, вы зарегистрированы в корпоративном мессенджере.\n\nВаш логин: ${email}\n\nПароль мы не отправляем и не храним в открытом виде. Если забудете его, нажмите «Забыли» на странице входа.`
  );
}

// Временный пароль, если человек забыл свой
function sendTempPassword(email, password) {
  return send(
    email,
    'Временный пароль',
    `Ваш временный пароль: ${password}\n\nПосле входа система предложит сделать его постоянным или задать новый. Если вы не запрашивали пароль, просто проигнорируйте это письмо.`
  );
}

module.exports = { sendLoginCode, sendWelcome, sendTempPassword };