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

let serverUri;
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
    configuration.clients[0].redirect_uris[0] = `${serverUri}/callback`;
    // configuration.clients[0].defaultResource = async(ctx, client, oneOf) => serverUri,

    console.dir(configuration.clients);
  const provider = new Provider(serverUri, { adapter, ...configuration });

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
    const clientId = req.params.client_id || configuration.clients[0].client_id;
    const client = getClient(clientId);
    const clientConfig = getClientConfig(clientId);
    const redirectTo = client.authorizationUrl({
      scope: 'openid email profile',
      response_mode: 'query',
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
      nonce,
      redirect_uri: clientConfig.redirect_uris[0]
    });
    res.redirect(redirectTo);
  });

  app.get('/callback', async (req, res) => {
    const clientId = req.params.client_id || configuration.clients[0].client_id;
    const client = getClient(clientId);
    const clientConfig = getClientConfig(clientId);
    const params = client.callbackParams(req);
    console.log({ params });
    const tokens = await client.callback(clientConfig.redirect_uris[0], params, {
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
  });
} catch (err) {
  if (server?.listening) server.close();
  console.error(err);
  process.exitCode = 1;
}
})();

const getClient = (clientId) => {
  const clientConfig = getClientConfig(clientId);

  if (!clientConfig) {
    throw new Error(`Unable to find client with id ${clientId}`);
  }
  return new issuer.Client(clientConfig);
};

const getClientConfig = (clientId) => configuration.clients.find((client) => client.client_id === clientId);

export default server;