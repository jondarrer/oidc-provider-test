# OIDC Provider Test

Based on [node-oidc-provider/example/express.js](https://github.com/panva/node-oidc-provider/blob/2be00659b3ea2828659e388a51603d20cad5c7ca/example/express.js).

Worth looking at [https://dev.to/ebrahimmfadae/develop-an-openid-server-with-nodejs-typescript-9n1](https://dev.to/ebrahimmfadae/develop-an-openid-server-with-nodejs-typescript-9n1).

This is a test service for OIDC provider to see how it works.

## Pre-requisities

Requires an [ngrok](https://ngrok.com) account.

Prior to doing anything else, create a `.env` file in the project's root folder and set it as follows:

```sh
NGROK_AUTHTOKEN={replace with your ngrok auth token}
```

## Install the dependencies

```sh
npm i
```

## Start the service

```sh
NODE_ENV=production npm start
```

## Go through the OIDC login flow

Open the login link provided in the terminal logs, which looks something like `https://{id}.ngrok-free.app/login`.

When promoted, put any login details you like, it doesn't matter.

After accepting the terms, a debug page showing the contents of the id token will be shown.
