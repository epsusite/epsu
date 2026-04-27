import { Resend } from 'resend';

const resend = new Resend('re_xxxxxxxxx');

async function main() {
  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'epsu.site@protonmail.com',
    subject: 'Hello World',
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
