/* eslint-disable no-console */

import * as path from 'node:path';
import * as url from 'node:url';

import { dirname } from 'desm';
import express from 'express'; // eslint-disable-line import/no-unresolved
import helmet from 'helmet';
import { Issuer, generators } from 'openid-client';
import Provider from 'oidc-provider';
import ngrok from '@ngrok/ngrok';

import Account from './support/account.js';
import configuration from './support/configuration.js';
import routes from './routes.js';

const nonce = generators.nonce();
const codeVerifier = generators.codeVerifier();
const codeChallenge = generators.codeChallenge(codeVerifier);
const state = 'MdXrGikS5LACsWs2HZFqS7IC9zMC6F9thOiWDa5gxKRqoMf7bCkTetrrwKw5JIAA';
const codeChallengeMethod = 'S256';

const __dirname = dirname(import.meta.url);

const { PORT = 3000, ISSUER = `http://localhost:${PORT}` } = process.env;
configuration.findAccount = Account.findAccount;

const app = express();

const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
delete directives['form-action'];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives,
  },
}));

app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'ejs');

let server;
let issuer;
let client;

const configIndex = 0;
const clientConfig = configuration.clients[configIndex];
const clientId = clientConfig.client_id;
const clientSecret = clientConfig.client_secret;
let serverUri;
let redirectUri;
let listener;

(async function() {
try {
  let adapter;
  if (process.env.MONGODB_URI) {
    ({ default: adapter } = await import('./adapters/mongodb.js'));
    await adapter.connect();
  }

  const prod = process.env.NODE_ENV === 'production';

    listener = await ngrok.forward({ addr: 3000, authtoken_from_env: true });
    serverUri = listener.url();
    console.log(`Ingress established at: ${serverUri}`);
    clientConfig.redirect_uris[0] = `${serverUri}/callback`;
    redirectUri = clientConfig.redirect_uris[0];

    console.log(`configuration.clients[${configIndex}]`, configuration.clients[configIndex]);
  const provider = new Provider(ISSUER, { adapter, ...configuration });

  if (prod) {
    app.enable('trust proxy');
    provider.proxy = true;

    app.use((req, res, next) => {
      if (req.secure) {
        next();
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        res.redirect(url.format({
          protocol: 'https',
          host: req.get('host'),
          pathname: req.originalUrl,
        }));
      } else {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'do yourself a favor and only use https',
        });
      }
    });
  }


  app.get('/login', async (req, res) => {
    const redirectTo = client.authorizationUrl({
      scope: 'openid email profile',
      // resource: 'https://localhost:3001',
      response_mode: 'query',
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
      nonce,
    });
    res.redirect(redirectTo);
  });

  app.get('/callback', async (req, res) => {
    const params = client.callbackParams(req);
    console.log({ params });
    const tokens = await client.callback(redirectUri, params, {
      state: params.state,
      nonce,
      code_verifier: codeVerifier,
    });
    console.log('received and validated tokens %j', tokens);
    const claims = tokens.claims();
    console.log('validated ID Token claims %j', claims);
    
    res.render('callback', { tokens, claims });
  });

  routes(app, provider);
  app.use(provider.callback());
  server = app.listen(PORT, async () => {
    console.log(`application is listening on port ${PORT}, check its /.well-known/openid-configuration`);
    console.log(`check ${serverUri}/.well-known/openid-configuration`);
    console.log(`login via ${serverUri}/login`);

    issuer = await Issuer.discover(serverUri);
    client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [redirectUri],
      response_types: ['code'],
      // id_token_signed_response_alg (default "RS256")
    }); // => Client
  });
} catch (err) {
  if (server?.listening) server.close();
  console.error(err);
  process.exitCode = 1;
}
})();

export default server;