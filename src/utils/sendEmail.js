const nodemailer = require("nodemailer");

const buildTransportConfig = () => {
	const config = {};

	if (process.env.EMAIL_SERVICE) {
		config.service = process.env.EMAIL_SERVICE;
	} else {
		config.host = process.env.EMAIL_HOST || "smtp.gmail.com";
		config.port = Number(process.env.EMAIL_PORT || 465);
		config.secure =
			typeof process.env.EMAIL_SECURE === "string"
				? process.env.EMAIL_SECURE === "true"
				: config.port === 465;
	}

	if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
		config.auth = {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		};
	}

	return config;
};

const transporter = nodemailer.createTransport(buildTransportConfig());

const sendEmail = async ({ to, subject, text, html }) => {
	if (!to) {
		throw new Error("Email recipient is required");
	}

	const mailOptions = {
		from:
			process.env.EMAIL_FROM ||
			(process.env.EMAIL_USER
				? `Frischly <${process.env.EMAIL_USER}>`
				: undefined),
		to,
		subject,
		text,
		html,
	};

	if (!mailOptions.text && !mailOptions.html) {
		mailOptions.text = "";
	}

	await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
