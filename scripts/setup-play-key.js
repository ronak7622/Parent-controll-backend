/**
 * One-click helper script to configure GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in .env
 * Runs safely on VPS or local machines.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('[setup-play-key] .env not found at', envPath);
  process.exit(1);
}

let env = fs.readFileSync(envPath, 'utf8');

// The exact minified Service Account JSON
const playServiceAccount = {
  type: "service_account",
  project_id: "revenuecat-451109",
  private_key_id: "44f5a47ec8402096e0c6f1bb5d587d78686d2c35",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDVWlV0mccc/5An\nyU3JV6eNvQGXkx/oAxJoW23bFogM+8EwIoUeTXphrinxbD9TbhK9BHdFcjc1g2L4\nF8tTH238D69h746PGB+v/bl54ENHr19ta/4Y6JurlJQIAwH3t96xtKsq9t67iVEU\nyORkUKIDWVAGSMUuIXNZv1P9Iy6ItMXkihfXJX6cvVHPP8pl9KJ1QD9gO1nWtlIR\nCg9b7bAucQUn913f9qfLE5jbI4LkIwu461xYYhbjrEluPuFTFOPUJMCGrvz/GM5H\nKvO5GiWskBQCd0ynBWKIWPUHsdMshBw85+Gf8RT7bBCTxy1rz6FaASV3WrxpM/bF\nLAUBB7u3AgMBAAECggEAFc2tBQUAIbkGWOKMJgLktyn1IzHgZVwHAg4x7F1hmv4R\ncKNeeknNs3TSiX8X+6U4mgN+UuUIulnKf/MijsSb/1H1COur5HjBKEGkNk3SYl2M\nQYjzR0ViP0coV6dDCLdMNVny0im3em/ejuK24H+TBweWE4ZVTFET0jyozypMw6CR\n/lZxzi/5Bie7EF0ESGgwCnsnZT5gi9SlbJEVao9y5cR/gGoDXhMSCITX6q29w0De\nWgaA7JK+Lcn6/qkaBHr7KS9bDsSxMKnRft6w5vNRck9ysulPzONGwP/3u8BDL3It\nZH3Ipvfb2BK/emdLcEfQZ2QTaf1oL0FEoMsiY/zDtQKBgQDvslWePvyTHTtnUhIl\nuIvO5bCYDR5vNgBgkaBZVFj0VcFhk2r6xEFz7cD4tOKG6HalssgxgukVCNXuYwsb\nF+buS27a8F2Je5svvdi1pC6dmsoIIy7BnRt3VMD5F0dxaDkgKrS6awx/N8havR0Q\naNerSA8wk7AZV3YG7RjCUIvCQwKBgQDj3UtiY0lYH6JIXJIgY8YJJK58QEIsTnJu\ncPbZ1tn+8GNzJ6F5wIw+B0vrfI5LAoKnnntGFYdGI69H2a4taV9RqiygwvQN6/4e\nomN4hQUzzSq+vj0ux4RflKcwJMgRxtcKat72Bdb3MqLeEAvWRtMC7KPa21c6Lbkg\nD255IjsLfQKBgHzPQk+1AnVj+kORc4uarYndBfgWlKtZ1hZynakGB4+qe5hgV4sd\n1+sSeLHIFlAjCWy8TAuj29QtFqAbiHPiHUgllSKBmGL3LtZMJ2RlijRcnihgkX8V\nXHDle9n4KiY+G8jJE/Qhu48er7+3y0N5JBu22Nn1fPOlG/r9SDAeGrfbAoGBALY9\no/ABloRbcJBNMTWkdpuTcdXAEuyapRy9TkB1fI5QNknANX5JyCBH96lUSf2l+VcU\nAmXQDAvFuIdPiuWY8/o9j0nYAhcsWman28RlJv8CJSC+x/Ik8jL7kieIE1dcX1pe\nlQnRK9cy8V2HGeB7boJVPstoR8ApF3mTvfg1r2GFAoGBALUYqJaGUQGG4s4L15a7\nuqJZYm4/UCSGxVSUMUwlsN3pB0bcuXDL1lS4EZQjsy8ju+aQqmFUrJrmxiAPo3Nr\n8ggme75F5H2Oj6S0biVXrX1z78/iQLrpC/Gty3DlfkvCjaQXw0sYWlXpRqzt3JbD\nV5sm4x9phJI8fAWiCPmq2Hx+\n-----END PRIVATE KEY-----\n",
  client_email: "google-play-billing-backend@revenuecat-451109.iam.gserviceaccount.com",
  client_id: "115524261364357905175",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/google-play-billing-backend%40revenuecat-451109.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

const fullLine = `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='${JSON.stringify(playServiceAccount)}'`;

if (/^GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=.*$/m.test(env)) {
  env = env.replace(/^GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=.*$/m, fullLine);
} else {
  env += `\n${fullLine}\n`;
}

fs.writeFileSync(envPath, env, 'utf8');
console.log('✅ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON successfully written to .env!');
